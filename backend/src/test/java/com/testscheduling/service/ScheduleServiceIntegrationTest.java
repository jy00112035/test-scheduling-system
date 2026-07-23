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
import com.testscheduling.repository.StaffDailyStatusRepository;
import com.testscheduling.repository.TestDemandRepository;
import com.testscheduling.repository.TestModuleConfigRepository;
import com.testscheduling.repository.TestStaffModuleRepository;
import com.testscheduling.repository.TestStaffRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.stat.Statistics;
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
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(properties = "spring.jpa.properties.hibernate.generate_statistics=true")
class ScheduleServiceIntegrationTest {

    private static final LocalDate DATE = LocalDate.of(2026, 7, 22);
    private static final String DATABASE_URL = "jdbc:h2:mem:schedule-eligibility-"
        + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=10000";

    @DynamicPropertySource
    static void useUniqueDatabase(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> DATABASE_URL);
    }

    @Autowired ScheduleService scheduleService;
    @Autowired SchedulePublishService publishService;
    @Autowired ScheduleRepository scheduleRepository;
    @Autowired TestDemandRepository demandRepository;
    @Autowired DemandManpowerDetailRepository detailRepository;
    @Autowired DemandSpecialModuleRepository specialRepository;
    @Autowired TestModuleConfigRepository moduleRepository;
    @Autowired TestStaffRepository staffRepository;
    @Autowired TestStaffModuleRepository staffModuleRepository;
    @Autowired StaffDailyStatusService staffDailyStatusService;
    @Autowired StaffDailyStatusRepository dailyStatusRepository;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired EntityManagerFactory entityManagerFactory;

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
    void batchRejectsCumulativeStaffCapacity() {
        TestDemand demand = saveDemand("batch-capacity", 2.0, 3);
        DemandManpowerDetail detail = saveDetail(demand, "功能测试", 2.0);
        TestStaff staff = saveStaff("BATCH-CAPACITY-A", "功能测试", 1.0);

        BusinessException error = assertThrows(BusinessException.class,
            () -> scheduleService.createBatch(List.of(
                schedule(demand, staff, detail, null, 60),
                schedule(demand, staff, detail, null, 60))));

        assertEquals("STAFF_CAPACITY_EXCEEDED", error.getErrorCode());
        assertTrue(scheduleRepository.findByDemandId(demand.getId()).isEmpty());
    }

    @Test
    void batchRejectsCumulativeDeviceCount() {
        TestDemand demand = saveDemand("batch-devices", 2.0, 1);
        DemandManpowerDetail detail = saveDetail(demand, "功能测试", 2.0);
        TestStaff first = saveStaff("BATCH-DEVICE-A", "功能测试", 1.0);
        TestStaff second = saveStaff("BATCH-DEVICE-B", "功能测试", 1.0);

        BusinessException error = assertThrows(BusinessException.class,
            () -> scheduleService.createBatch(List.of(
                schedule(demand, first, detail, null, 20),
                schedule(demand, second, detail, null, 20))));

        assertEquals("TEST_DEVICE_CAPACITY_EXCEEDED", error.getErrorCode());
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
        demand.setStatus(TestDemand.DemandStatus.scheduled);
        demandRepository.saveAndFlush(demand);

        scheduleService.deleteByDemandId(demand.getId(), ScheduleDeleteScope.DRAFT_ONLY);

        assertTrue(scheduleRepository.findById(draft.getId()).isEmpty());
        assertTrue(scheduleRepository.findById(published.getId()).isPresent());
        assertEquals(TestDemand.DemandStatus.scheduled,
            demandRepository.findById(demand.getId()).orElseThrow().getStatus());
        Schedule finalPublished = published;
        BusinessException protectedError = assertThrows(BusinessException.class,
            () -> scheduleService.delete(finalPublished.getId()));
        assertEquals("PUBLISHED_SCHEDULE_PROTECTED", protectedError.getErrorCode());

        scheduleService.deleteByDemandId(demand.getId(), ScheduleDeleteScope.ALL);
        assertTrue(scheduleRepository.findByDemandId(demand.getId()).isEmpty());
        assertEquals(TestDemand.DemandStatus.pending,
            demandRepository.findById(demand.getId()).orElseThrow().getStatus());
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

            List<Object> outcomes = List.of(
                first.get(5, TimeUnit.SECONDS), second.get(5, TimeUnit.SECONDS));

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

    @Test
    void batchUsesBoundedPreloadAndSingleSavePath() {
        TestDemand demand = saveDemand("batch-query-count", 5.0, 5);
        DemandManpowerDetail detail = saveDetail(demand, "功能测试", 5.0);
        TestStaff first = saveStaff("BATCH-QUERY-A", "功能测试", 1.0);
        TestStaff second = saveStaff("BATCH-QUERY-B", "功能测试", 1.0);
        TestStaff third = saveStaff("BATCH-QUERY-C", "功能测试", 1.0);
        Statistics statistics = entityManagerFactory.unwrap(
            org.hibernate.SessionFactory.class).getStatistics();
        statistics.clear();

        List<Schedule> returned = scheduleService.createBatch(List.of(
            schedule(demand, first, detail, null, 30),
            schedule(demand, second, detail, null, 30),
            schedule(demand, third, detail, null, 30)));

        assertEquals(3, returned.size());
        assertTrue(returned.stream().allMatch(item -> item.getId() != null));
        assertTrue(statistics.getPrepareStatementCount() < 20,
            "batch should use bounded preload queries, count="
                + statistics.getPrepareStatementCount());
        assertEquals(3, scheduleRepository.findByDemandId(demand.getId()).size());
    }

    @Test
    void publishAndUnpublishSerializeThroughDemandAndScheduleLocks() throws Exception {
        TestDemand demand = saveDemand("publish-locks", 0.2, 2);
        DemandManpowerDetail detail = saveDetail(demand, "功能测试", 0.2);
        TestStaff staff = saveStaff("PUBLISH-LOCK-A", "功能测试", 1.0);
        scheduleService.create(schedule(demand, staff, detail, null, 20));
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<Object> publish = executor.submit(() -> runLockedAction(start,
                () -> publishService.publishOne(demand.getId())));
            Future<Object> unpublish = executor.submit(() -> runLockedAction(start,
                () -> scheduleService.unpublishByDemandId(demand.getId())));
            start.countDown();
            Object publishOutcome = publish.get(5, TimeUnit.SECONDS);
            assertTrue(publishOutcome instanceof Boolean
                || (publishOutcome instanceof BusinessException error
                    && "SCHEDULE_NOT_FOUND".equals(error.getErrorCode())));
            assertTrue(unpublish.get(5, TimeUnit.SECONDS) instanceof Boolean);
            assertEquals(1, scheduleRepository.findByDemandId(demand.getId()).size());
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void publishAndDraftClearSerializeThroughSameDemandLock() throws Exception {
        TestDemand demand = saveDemand("publish-clear-locks", 0.2, 2);
        DemandManpowerDetail detail = saveDetail(demand, "功能测试", 0.2);
        TestStaff staff = saveStaff("PUBLISH-CLEAR-A", "功能测试", 1.0);
        scheduleService.create(schedule(demand, staff, detail, null, 20));
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<Object> publish = executor.submit(() -> runLockedAction(start,
                () -> publishService.publishOne(demand.getId())));
            Future<Object> clear = executor.submit(() -> runLockedAction(start,
                () -> scheduleService.deleteByDemandId(demand.getId(),
                    ScheduleDeleteScope.DRAFT_ONLY)));
            start.countDown();
            Object publishOutcome = publish.get(5, TimeUnit.SECONDS);
            assertTrue(publishOutcome instanceof Boolean
                || (publishOutcome instanceof BusinessException error
                    && "SCHEDULE_NOT_FOUND".equals(error.getErrorCode())));
            assertTrue(clear.get(5, TimeUnit.SECONDS) instanceof Boolean);
            assertTrue(scheduleRepository.findByDemandId(demand.getId()).size() <= 1);
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void dailyStatusMutationWaitsForStaffLockAndChangesLaterScheduleCapacity() throws Exception {
        TestStaff staff = saveStaff("STATUS-SERIAL-A", "功能测试", 1.0);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch lockHeld = new CountDownLatch(1);
        CountDownLatch releaseLock = new CountDownLatch(1);
        CountDownLatch operationStarted = new CountDownLatch(1);
        Future<?> lockHolder = holdStaffLock(executor, staff.getId(), lockHeld, releaseLock);
        try {
            assertTrue(lockHeld.await(5, TimeUnit.SECONDS));
            Future<Object> statusMutation = executor.submit(() -> {
                operationStarted.countDown();
                staffDailyStatusService.setStatus(staff.getId(), DATE,
                    com.testscheduling.entity.StaffDailyStatus.DailyAvailabilityStatus.OTHER_TASKS,
                    100.0, "admin");
                return Boolean.TRUE;
            });
            assertTrue(operationStarted.await(5, TimeUnit.SECONDS));
            assertThrows(TimeoutException.class,
                () -> statusMutation.get(200, TimeUnit.MILLISECONDS));
            assertTrue(dailyStatusRepository.findByStaffIdAndDate(staff.getId(), DATE).isEmpty());

            releaseLock.countDown();
            assertEquals(Boolean.TRUE, statusMutation.get(5, TimeUnit.SECONDS));
            lockHolder.get(5, TimeUnit.SECONDS);
            assertTrue(dailyStatusRepository.findByStaffIdAndDate(staff.getId(), DATE).isPresent());

            TestDemand demand = saveDemand("status-capacity-after-lock", 1.0, 2);
            DemandManpowerDetail detail = saveDetail(demand, "功能测试", 1.0);
            BusinessException error = assertThrows(BusinessException.class,
                () -> scheduleService.create(schedule(demand, staff, detail, null, 50)));
            assertEquals("STAFF_CAPACITY_EXCEEDED", error.getErrorCode());
        } finally {
            releaseLock.countDown();
            shutdownExecutor(executor);
        }
    }

    @Test
    void scheduleCreationWaitsForStaffLockBeforeEligibilityAndCommit() throws Exception {
        TestDemand demand = saveDemand("schedule-serial", 1.0, 2);
        DemandManpowerDetail detail = saveDetail(demand, "功能测试", 1.0);
        TestStaff staff = saveStaff("SCHEDULE-SERIAL-A", "功能测试", 1.0);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch lockHeld = new CountDownLatch(1);
        CountDownLatch releaseLock = new CountDownLatch(1);
        CountDownLatch operationStarted = new CountDownLatch(1);
        Future<?> lockHolder = holdStaffLock(executor, staff.getId(), lockHeld, releaseLock);
        try {
            assertTrue(lockHeld.await(5, TimeUnit.SECONDS));
            Future<Object> scheduleCreation = executor.submit(() -> {
                operationStarted.countDown();
                return scheduleService.create(schedule(demand, staff, detail, null, 50));
            });
            assertTrue(operationStarted.await(5, TimeUnit.SECONDS));
            assertThrows(TimeoutException.class,
                () -> scheduleCreation.get(200, TimeUnit.MILLISECONDS));
            assertTrue(scheduleRepository.findByDemandId(demand.getId()).isEmpty());

            releaseLock.countDown();
            assertInstanceOf(Schedule.class, scheduleCreation.get(5, TimeUnit.SECONDS));
            lockHolder.get(5, TimeUnit.SECONDS);
            assertEquals(1, scheduleRepository.findByDemandId(demand.getId()).size());
        } finally {
            releaseLock.countDown();
            shutdownExecutor(executor);
        }
    }

    private Future<?> holdStaffLock(
            ExecutorService executor,
            Long staffId,
            CountDownLatch lockHeld,
            CountDownLatch releaseLock) {
        return executor.submit(() -> new TransactionTemplate(transactionManager)
            .executeWithoutResult(transaction -> {
                staffRepository.findByIdForUpdate(staffId)
                    .orElseThrow(() -> new IllegalStateException("staff fixture missing"));
                lockHeld.countDown();
                try {
                    if (!releaseLock.await(5, TimeUnit.SECONDS)) {
                        throw new IllegalStateException("staff lock release timed out");
                    }
                } catch (InterruptedException error) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(error);
                }
            }));
    }

    private void shutdownExecutor(ExecutorService executor) {
        executor.shutdownNow();
        try {
            if (!executor.awaitTermination(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("executor cleanup timed out");
            }
        } catch (InterruptedException error) {
            executor.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }

    private Object runLockedAction(CountDownLatch start, Runnable action) {
        try {
            if (!start.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("start signal timed out");
            }
            action.run();
            return Boolean.TRUE;
        } catch (BusinessException error) {
            return error;
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(error);
        }
    }

    private Object createAfterSignal(CountDownLatch start, Schedule schedule) {
        try {
            if (!start.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("start signal timed out");
            }
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
        demand.setStatus(TestDemand.DemandStatus.pending);
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
