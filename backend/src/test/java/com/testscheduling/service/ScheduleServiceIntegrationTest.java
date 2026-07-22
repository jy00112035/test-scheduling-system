package com.testscheduling.service;

import com.testscheduling.dto.ScheduleDeleteScope;
import com.testscheduling.entity.DemandManpowerDetail;
import com.testscheduling.entity.DemandSpecialModule;
import com.testscheduling.entity.Schedule;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.entity.TestStaffModule;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.DemandManpowerDetailRepository;
import com.testscheduling.repository.DemandSpecialModuleRepository;
import com.testscheduling.repository.ScheduleRepository;
import com.testscheduling.repository.TestDemandRepository;
import com.testscheduling.repository.TestModuleConfigRepository;
import com.testscheduling.repository.TestStaffModuleRepository;
import com.testscheduling.repository.TestStaffRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
class ScheduleServiceIntegrationTest {

    private static final LocalDate DATE = LocalDate.of(2026, 7, 22);
    private static final String DATABASE_URL = "jdbc:h2:mem:schedule-eligibility-"
        + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=10000";

    @DynamicPropertySource
    static void useUniqueDatabase(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> DATABASE_URL);
    }

    @Autowired ScheduleService scheduleService;
    @Autowired ScheduleRepository scheduleRepository;
    @Autowired TestDemandRepository demandRepository;
    @Autowired DemandManpowerDetailRepository detailRepository;
    @Autowired DemandSpecialModuleRepository specialRepository;
    @Autowired TestModuleConfigRepository moduleRepository;
    @Autowired TestStaffRepository staffRepository;
    @Autowired TestStaffModuleRepository staffModuleRepository;

    @Test
    void persistsCrossGroupSpecialScheduleWithOptimisticVersion() {
        TestDemand demand = saveDemand("cross-group", 2.0, 2);
        DemandManpowerDetail detail = saveDetail(demand, "功能测试", 2.0);
        TestModuleConfig module = saveModule("支付-集成");
        DemandSpecialModule special = saveSpecial(demand, module, 1.0);
        TestStaff staff = saveStaff("AUTO-INTEGRATION", "自动化测试", 1.0);
        staffModuleRepository.saveAndFlush(new TestStaffModule(staff.getId(), module.getId()));

        Schedule saved = scheduleService.create(
            schedule(demand, staff, detail, special, 50));

        assertNotNull(saved.getId());
        assertNotNull(saved.getLockVersion());
        assertEquals(special.getId(), saved.getDemandSpecialModuleId());
    }

    @Test
    void batchBucketFailureRollsBackEarlierRows() {
        TestDemand demand = saveDemand("batch-rollback", 1.0, 3);
        DemandManpowerDetail detail = saveDetail(demand, "功能测试", 1.0);
        TestStaff first = saveStaff("BATCH-A", "功能测试", 1.0);
        TestStaff second = saveStaff("BATCH-B", "功能测试", 1.0);

        BusinessException error = assertThrows(BusinessException.class,
            () -> scheduleService.createBatch(List.of(
                schedule(demand, first, detail, null, 60),
                schedule(demand, second, detail, null, 60))));

        assertEquals("SCHEDULE_BUCKET_EXCEEDED", error.getErrorCode());
        assertTrue(scheduleRepository.findByDemandId(demand.getId()).isEmpty());
    }

    @Test
    void updateMoveAndHistoricalClassifyPreserveAttributionAndMetadata() {
        TestDemand demand = saveDemand("write-entry-points", 3.0, 3);
        DemandManpowerDetail detail = saveDetail(demand, "功能测试", 3.0);
        TestStaff first = saveStaff("WRITE-A", "功能测试", 1.0);
        TestStaff second = saveStaff("WRITE-B", "功能测试", 1.0);
        Schedule original = schedule(demand, first, detail, null, 50);
        original.setProduct("产品元数据");
        original.setVersion("v-preserved");
        original = scheduleService.create(original);

        Schedule changes = schedule(demand, second, detail, null, 40);
        changes.setDate(DATE.plusDays(1));
        Schedule updated = scheduleService.update(original.getId(), changes);
        Schedule moved = scheduleService.move(
            updated.getId(), first.getId(), DATE.plusDays(2), 30);

        assertEquals("产品元数据", moved.getProduct());
        assertEquals("v-preserved", moved.getVersion());
        assertEquals(detail.getId(), moved.getDemandManpowerDetailId());

        Schedule historical = schedule(demand, second, null, null, 20);
        historical = scheduleRepository.saveAndFlush(historical);
        Schedule classified = scheduleService.classifyHistorical(
            historical.getId(), detail.getId(), null);
        assertEquals(detail.getId(), classified.getDemandManpowerDetailId());
    }

    @Test
    void draftAndAllDeleteScopesNeverSilentlyDeletePublishedRows() {
        TestDemand demand = saveDemand("delete-scopes", 3.0, 3);
        DemandManpowerDetail detail = saveDetail(demand, "功能测试", 3.0);
        TestStaff staff = saveStaff("DELETE-A", "功能测试", 1.0);
        Schedule draft = scheduleService.create(schedule(demand, staff, detail, null, 40));
        Schedule published = schedule(demand, staff, detail, null, 40);
        published.setDate(DATE.plusDays(1));
        published.setPublished(true);
        published = scheduleRepository.saveAndFlush(published);

        scheduleService.deleteByDemandId(demand.getId(), ScheduleDeleteScope.DRAFT_ONLY);

        assertTrue(scheduleRepository.findById(draft.getId()).isEmpty());
        assertTrue(scheduleRepository.findById(published.getId()).isPresent());
        Schedule finalPublished = published;
        BusinessException protectedError = assertThrows(BusinessException.class,
            () -> scheduleService.delete(finalPublished.getId()));
        assertEquals("PUBLISHED_SCHEDULE_PROTECTED", protectedError.getErrorCode());

        scheduleService.deleteByDemandId(demand.getId(), ScheduleDeleteScope.ALL);
        assertTrue(scheduleRepository.findByDemandId(demand.getId()).isEmpty());
    }

    @Test
    void concurrentDifferentDemandsCannotOverbookSameStaffDay() throws Exception {
        TestDemand firstDemand = saveDemand("concurrent-a", 1.0, 2);
        TestDemand secondDemand = saveDemand("concurrent-b", 1.0, 2);
        DemandManpowerDetail firstDetail = saveDetail(firstDemand, "功能测试", 1.0);
        DemandManpowerDetail secondDetail = saveDetail(secondDemand, "功能测试", 1.0);
        TestStaff staff = saveStaff("CONCURRENT-A", "功能测试", 1.0);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<Object> first = executor.submit(() -> createAfterSignal(
                start, schedule(firstDemand, staff, firstDetail, null, 60)));
            Future<Object> second = executor.submit(() -> createAfterSignal(
                start, schedule(secondDemand, staff, secondDetail, null, 60)));
            start.countDown();

            List<Object> outcomes = List.of(first.get(), second.get());

            assertEquals(1, outcomes.stream().filter(Schedule.class::isInstance).count());
            Object failure = outcomes.stream()
                .filter(BusinessException.class::isInstance)
                .findFirst()
                .orElseThrow();
            BusinessException error = assertInstanceOf(BusinessException.class, failure);
            assertEquals("STAFF_CAPACITY_EXCEEDED", error.getErrorCode());
            assertEquals(1, scheduleRepository.findByStaffIdAndDate(staff.getId(), DATE).size());
        } finally {
            executor.shutdownNow();
        }
    }

    private Object createAfterSignal(CountDownLatch start, Schedule schedule) {
        try {
            start.await();
            return scheduleService.create(schedule);
        } catch (BusinessException error) {
            return error;
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(error);
        }
    }

    private TestDemand saveDemand(String product, double manpower, int devices) {
        TestDemand demand = new TestDemand();
        demand.setProduct(product);
        demand.setVersionType("维护");
        demand.setStartDate(LocalDateTime.of(2026, 7, 20, 0, 0));
        demand.setEndDate(LocalDateTime.of(2026, 7, 31, 0, 0));
        demand.setManpowerDemand(BigDecimal.valueOf(manpower));
        demand.setConfidential(false);
        demand.setTestDeviceCount(devices);
        return demandRepository.saveAndFlush(demand);
    }

    private DemandManpowerDetail saveDetail(
            TestDemand demand, String testType, double manpower) {
        DemandManpowerDetail detail = new DemandManpowerDetail();
        detail.setDemandId(demand.getId());
        detail.setTestType(testType);
        detail.setManpowerDemand(BigDecimal.valueOf(manpower));
        return detailRepository.saveAndFlush(detail);
    }

    private TestModuleConfig saveModule(String name) {
        TestModuleConfig module = new TestModuleConfig();
        module.setModuleName(name);
        module.setTestType("功能测试");
        module.setEnabled(true);
        module.setSortOrder(10);
        return moduleRepository.saveAndFlush(module);
    }

    private DemandSpecialModule saveSpecial(
            TestDemand demand, TestModuleConfig module, double manpower) {
        DemandSpecialModule special = new DemandSpecialModule();
        special.setDemandId(demand.getId());
        special.setModuleId(module.getId());
        special.setManpowerDemand(BigDecimal.valueOf(manpower));
        return specialRepository.saveAndFlush(special);
    }

    private TestStaff saveStaff(String empNo, String testType, double coefficient) {
        TestStaff staff = new TestStaff();
        staff.setName(empNo);
        staff.setEmpNo(empNo);
        staff.setTestType(testType);
        staff.setStatus(TestStaff.StaffStatus.active);
        staff.setInitialCoefficient(BigDecimal.valueOf(coefficient));
        staff.setCurrentCoefficient(BigDecimal.valueOf(coefficient));
        return staffRepository.saveAndFlush(staff);
    }

    private Schedule schedule(
            TestDemand demand,
            TestStaff staff,
            DemandManpowerDetail detail,
            DemandSpecialModule special,
            int percentage) {
        Schedule schedule = new Schedule();
        schedule.setDemandId(demand.getId());
        schedule.setStaffId(staff.getId());
        schedule.setDemandManpowerDetailId(detail == null ? null : detail.getId());
        schedule.setDemandSpecialModuleId(special == null ? null : special.getId());
        schedule.setDate(DATE);
        schedule.setPercentage(percentage);
        schedule.setPublished(false);
        return schedule;
    }
}
