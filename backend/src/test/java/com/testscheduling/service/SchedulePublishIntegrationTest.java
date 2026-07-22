package com.testscheduling.service;

import com.testscheduling.dto.BatchPublishRequest;
import com.testscheduling.dto.BatchPublishResponse;
import com.testscheduling.entity.DemandManpowerDetail;
import com.testscheduling.entity.DemandSpecialModule;
import com.testscheduling.entity.Schedule;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.entity.TestStaffModule;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.AuditLogRepository;
import com.testscheduling.repository.DemandManpowerDetailRepository;
import com.testscheduling.repository.DemandSpecialModuleRepository;
import com.testscheduling.repository.ScheduleRepository;
import com.testscheduling.repository.TestDemandRepository;
import com.testscheduling.repository.TestModuleConfigRepository;
import com.testscheduling.repository.TestStaffModuleRepository;
import com.testscheduling.repository.TestStaffRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
class SchedulePublishIntegrationTest {
    private static final LocalDate DATE = LocalDate.of(2026, 7, 22);
    private static final String DATABASE_URL = "jdbc:h2:mem:schedule-publish-"
        + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=10000";

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> DATABASE_URL);
    }

    @Autowired SchedulePublishService publishService;
    @Autowired ScheduleService scheduleService;
    @Autowired StaffModuleService staffModuleService;
    @Autowired ScheduleRepository scheduleRepository;
    @Autowired TestDemandRepository demandRepository;
    @Autowired DemandManpowerDetailRepository detailRepository;
    @Autowired DemandSpecialModuleRepository specialRepository;
    @Autowired TestModuleConfigRepository moduleRepository;
    @Autowired TestStaffRepository staffRepository;
    @Autowired TestStaffModuleRepository staffModuleRepository;
    @Autowired AuditLogRepository auditLogRepository;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired EntityManager entityManager;

    @Test
    void fullyValidDemandPublishesAllRowsAndSuccessAudit() {
        TestDemand demand = demand("valid", 0.5);
        DemandManpowerDetail detail = detail(demand, 0.5);
        TestStaff staff = staff("valid");
        Schedule row = create(schedule(demand, staff, detail, null, 50));

        assertEquals(1, publishService.publishOne(demand.getId()));

        assertTrue(scheduleRepository.findById(row.getId()).orElseThrow().getPublished());
        assertTrue(audits(demand).stream().anyMatch(a -> "SCHEDULE_PUBLISHED".equals(a.getActionType())));
    }

    @Test
    void removedFamiliarModuleIsRejectedAndRowsRemainDraft() {
        TestDemand demand = demand("removed-familiar", 1.0);
        DemandManpowerDetail detail = detail(demand, 1.0);
        TestModuleConfig module = module("removed-familiar-module");
        DemandSpecialModule special = special(demand, module, 0.5);
        TestStaff staff = staff("removed-familiar");
        staffModuleRepository.saveAndFlush(new TestStaffModule(staff.getId(), module.getId()));
        Schedule specialRow = create(schedule(demand, staff, detail, special, 50));
        create(schedule(demand, staff, detail, null, 50));
        staffModuleService.deleteForStaff(staff.getId());

        BusinessException error = assertThrows(BusinessException.class,
            () -> publishService.publishOne(demand.getId()));

        assertEquals("STAFF_MODULE_NOT_FAMILIAR", error.getErrorCode());
        assertFalse(scheduleRepository.findById(specialRow.getId()).orElseThrow().getPublished());
    }

    @Test
    void specialAndGeneralGapsAreRejectedWithStableCodes() {
        TestDemand specialDemand = demand("special-gap", 1.0);
        DemandManpowerDetail specialDetail = detail(specialDemand, 1.0);
        TestModuleConfig module = module("special-gap-module");
        special(specialDemand, module, 0.5);
        TestStaff specialStaff = staff("special-gap");
        create(schedule(specialDemand, specialStaff, specialDetail, null, 50));
        BusinessException specialError = assertThrows(BusinessException.class,
            () -> publishService.publishOne(specialDemand.getId()));
        assertEquals("SPECIAL_MODULE_UNFULFILLED", specialError.getErrorCode());

        TestDemand generalDemand = demand("general-gap", 1.0);
        DemandManpowerDetail generalDetail = detail(generalDemand, 1.0);
        TestStaff generalStaff = staff("general-gap");
        create(schedule(generalDemand, generalStaff, generalDetail, null, 50));
        BusinessException generalError = assertThrows(BusinessException.class,
            () -> publishService.publishOne(generalDemand.getId()));
        assertEquals("GENERAL_MANPOWER_UNFULFILLED", generalError.getErrorCode());
    }

    @Test
    void historicalDoubleNullScheduleIsRejected() {
        TestDemand demand = demand("historical", 1.0);
        detail(demand, 1.0);
        TestModuleConfig module = module("historical-module");
        special(demand, module, 0.5);
        TestStaff staff = staff("historical");
        Schedule historical = schedule(demand, staff, null, null, 100);
        historical.setDemandManpowerDetailId(null);
        historical.setDemandSpecialModuleId(null);
        scheduleRepository.saveAndFlush(historical);

        BusinessException error = assertThrows(BusinessException.class,
            () -> publishService.publishOne(demand.getId()));

        assertEquals("SCHEDULE_HISTORICAL_CLASSIFICATION_REQUIRED", error.getErrorCode());
        assertFalse(scheduleRepository.findById(historical.getId()).orElseThrow().getPublished());
    }

    @Test
    void lateSecondRowFailureRollsBackBothRows() {
        TestDemand demand = demand("late-second", 1.0);
        DemandManpowerDetail detail = detail(demand, 1.0);
        TestStaff first = staff("late-first");
        TestStaff second = staff("late-second");
        Schedule firstRow = create(schedule(demand, first, detail, null, 50));
        Schedule secondRow = create(schedule(demand, second, detail, null, 50));
        second.setStatus(TestStaff.StaffStatus.leave);
        staffRepository.saveAndFlush(second);

        BusinessException error = assertThrows(BusinessException.class,
            () -> publishService.publishOne(demand.getId()));

        assertEquals("STAFF_NOT_ACTIVE", error.getErrorCode());
        assertFalse(scheduleRepository.findById(firstRow.getId()).orElseThrow().getPublished());
        assertFalse(scheduleRepository.findById(secondRow.getId()).orElseThrow().getPublished());
    }

    @Test
    void batchKeepsFirstCommitAndPersistsSecondFailureAudit() {
        TestDemand valid = demand("batch-valid", 0.5);
        DemandManpowerDetail validDetail = detail(valid, 0.5);
        create(schedule(valid, staff("batch-valid"), validDetail, null, 50));
        TestDemand invalid = demand("batch-invalid", 1.0);
        DemandManpowerDetail invalidDetail = detail(invalid, 1.0);
        create(schedule(invalid, staff("batch-invalid"), invalidDetail, null, 50));

        BatchPublishResponse response = publishService.publishBatch(
            new BatchPublishRequest(List.of(valid.getId(), invalid.getId())));

        assertEquals(1, response.successCount());
        assertEquals("GENERAL_MANPOWER_UNFULFILLED", response.failed().get(0).reasonCode());
        assertTrue(scheduleRepository.findByDemandId(valid.getId()).get(0).getPublished());
        assertFalse(scheduleRepository.findByDemandId(invalid.getId()).get(0).getPublished());
        assertTrue(audits(invalid).stream().anyMatch(a ->
            "SCHEDULE_PUBLISH_FAILED".equals(a.getActionType())
                && a.getAfterValue().contains("GENERAL_MANPOWER_UNFULFILLED")
                && a.getAfterValue().contains("通用人力仍缺少 0.5 人天")));
    }

    @Test
    void noSchedulesReturnsStableError() {
        TestDemand demand = demand("no-schedules", 0.5);

        BusinessException error = assertThrows(BusinessException.class,
            () -> publishService.publishOne(demand.getId()));

        assertEquals("SCHEDULE_NOT_FOUND", error.getErrorCode());
    }

    @Test
    void familiarModuleRemovalCommitsBeforeWaitingPublishRevalidates() throws Exception {
        TestDemand demand = demand("concurrent-remove", 1.0);
        DemandManpowerDetail detail = detail(demand, 1.0);
        TestModuleConfig module = module("concurrent-remove-module");
        DemandSpecialModule special = special(demand, module, 0.5);
        TestStaff staff = staff("concurrent-remove");
        staffModuleRepository.saveAndFlush(new TestStaffModule(staff.getId(), module.getId()));
        create(schedule(demand, staff, detail, special, 50));
        create(schedule(demand, staff, detail, null, 50));

        CountDownLatch removed = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        Future<?> mutation = executor.submit(() -> new TransactionTemplate(transactionManager)
            .executeWithoutResult(tx -> {
                staffRepository.findByIdForUpdate(staff.getId()).orElseThrow();
                staffModuleRepository.deleteByStaffId(staff.getId());
                staffModuleRepository.flush();
                removed.countDown();
                await(release);
            }));
        try {
            assertTrue(removed.await(5, TimeUnit.SECONDS));
            Future<Integer> publish = executor.submit(() -> publishService.publishOne(demand.getId()));
            assertThrows(TimeoutException.class, () -> publish.get(200, TimeUnit.MILLISECONDS));
            release.countDown();
            ExecutionException failure = assertThrows(ExecutionException.class,
                () -> publish.get(5, TimeUnit.SECONDS));
            assertEquals("STAFF_MODULE_NOT_FAMILIAR",
                ((BusinessException) failure.getCause()).getErrorCode());
            mutation.get(5, TimeUnit.SECONDS);
        } finally {
            release.countDown();
            executor.shutdownNow();
            executor.awaitTermination(5, TimeUnit.SECONDS);
        }
    }

    private List<com.testscheduling.entity.AuditLog> audits(TestDemand demand) {
        return auditLogRepository.findByEntityTypeAndEntityIdOrderByCreatedAtDesc(
            "SCHEDULE", demand.getId().toString());
    }

    private void await(CountDownLatch latch) {
        try {
            if (!latch.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("lock timed out");
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(error);
        }
    }

    private TestDemand demand(String name, double manpower) {
        TestDemand demand = new TestDemand();
        demand.setProduct(name + UUID.randomUUID());
        demand.setVersionType("维护");
        demand.setStartDate(LocalDateTime.of(2026, 7, 20, 0, 0));
        demand.setEndDate(LocalDateTime.of(2026, 7, 31, 0, 0));
        demand.setManpowerDemand(BigDecimal.valueOf(manpower));
        demand.setTestDeviceCount(10);
        demand.setConfidential(false);
        return demandRepository.saveAndFlush(demand);
    }

    private DemandManpowerDetail detail(TestDemand demand, double manpower) {
        DemandManpowerDetail detail = new DemandManpowerDetail();
        detail.setDemandId(demand.getId());
        detail.setTestType("功能测试");
        detail.setManpowerDemand(BigDecimal.valueOf(manpower));
        return detailRepository.saveAndFlush(detail);
    }

    private TestModuleConfig module(String name) {
        TestModuleConfig module = new TestModuleConfig();
        module.setModuleName(name + UUID.randomUUID());
        module.setTestType("功能测试");
        module.setEnabled(true);
        module.setSortOrder(1);
        return moduleRepository.saveAndFlush(module);
    }

    private DemandSpecialModule special(
            TestDemand demand, TestModuleConfig module, double manpower) {
        DemandSpecialModule special = new DemandSpecialModule();
        special.setDemandId(demand.getId());
        special.setModuleId(module.getId());
        special.setManpowerDemand(BigDecimal.valueOf(manpower));
        return specialRepository.saveAndFlush(special);
    }

    private TestStaff staff(String name) {
        TestStaff staff = new TestStaff();
        staff.setName(name + UUID.randomUUID());
        staff.setEmpNo(name + UUID.randomUUID());
        staff.setTestType("功能测试");
        staff.setStatus(TestStaff.StaffStatus.active);
        staff.setInitialCoefficient(BigDecimal.ONE);
        staff.setCurrentCoefficient(BigDecimal.ONE);
        return staffRepository.saveAndFlush(staff);
    }

    private Schedule create(Schedule schedule) {
        return scheduleService.create(schedule);
    }

    private Schedule schedule(
            TestDemand demand, TestStaff staff, DemandManpowerDetail detail,
            DemandSpecialModule special, int percentage) {
        Schedule schedule = new Schedule();
        schedule.setDemandId(demand.getId());
        schedule.setStaffId(staff.getId());
        schedule.setDemandManpowerDetailId(detail == null ? null : detail.getId());
        schedule.setDemandSpecialModuleId(special == null ? null : special.getId());
        schedule.setDate(DATE);
        schedule.setPercentage(percentage);
        return schedule;
    }
}
