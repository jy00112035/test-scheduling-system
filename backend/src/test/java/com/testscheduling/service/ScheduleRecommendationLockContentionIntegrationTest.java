package com.testscheduling.service;

import com.testscheduling.dto.ScheduleRecommendationRequest;
import com.testscheduling.entity.DemandManpowerDetail;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.DemandManpowerDetailRepository;
import com.testscheduling.repository.ScheduleRepository;
import com.testscheduling.repository.TestDemandRepository;
import com.testscheduling.repository.TestStaffRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
class ScheduleRecommendationLockContentionIntegrationTest {

    private static final String DATABASE_URL = "jdbc:h2:mem:recommendation-lock-"
            + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=100";

    @DynamicPropertySource
    static void useUniqueDatabase(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> DATABASE_URL);
    }

    @Autowired ScheduleRecommendationService service;
    @Autowired TestDemandRepository demandRepository;
    @Autowired DemandManpowerDetailRepository detailRepository;
    @Autowired TestStaffRepository staffRepository;
    @Autowired ScheduleRepository scheduleRepository;
    @Autowired PlatformTransactionManager transactionManager;

    @Test
    void demandLockContentionIsBoundedTranslatedAndLeavesNoDrafts() throws Exception {
        TestDemand demand = demand();
        detail(demand.getId());
        staff();
        ExecutorService executor = Executors.newSingleThreadExecutor();
        CountDownLatch held = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        Future<?> holder = executor.submit(() -> new TransactionTemplate(transactionManager)
                .executeWithoutResult(status -> {
                    demandRepository.findByIdForUpdate(demand.getId()).orElseThrow();
                    held.countDown();
                    await(release);
                }));
        try {
            assertTrue(held.await(5, TimeUnit.SECONDS));
            BusinessException error = org.junit.jupiter.api.Assertions.assertThrows(
                    BusinessException.class, () -> service.recommend(request(demand.getId())));
            assertEquals("DATA_CHANGED_RETRY", error.getErrorCode());
            assertTrue(scheduleRepository.findByDemandId(demand.getId()).isEmpty());
        } finally {
            release.countDown();
            holder.get(5, TimeUnit.SECONDS);
            executor.shutdownNow();
            assertTrue(executor.awaitTermination(5, TimeUnit.SECONDS));
        }
    }

    private void await(CountDownLatch latch) {
        try {
            if (!latch.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("lock release timed out");
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(error);
        }
    }

    private ScheduleRecommendationRequest request(Long id) {
        ScheduleRecommendationRequest request = new ScheduleRecommendationRequest();
        request.setMode(ScheduleRecommendationRequest.Mode.FULL_DEMAND);
        request.setDemandIds(List.of(id));
        request.setIncludeSaturdays(true);
        request.setIncludeSundays(true);
        return request;
    }

    private TestDemand demand() {
        TestDemand demand = new TestDemand();
        demand.setProduct("lock");
        demand.setVersionType("维护");
        demand.setStartDate(LocalDateTime.of(2026, 7, 22, 0, 0));
        demand.setEndDate(LocalDateTime.of(2026, 7, 22, 23, 59));
        return demandRepository.saveAndFlush(demand);
    }

    private void detail(Long demandId) {
        DemandManpowerDetail detail = new DemandManpowerDetail();
        detail.setDemandId(demandId);
        detail.setTestType("lock-test");
        detail.setManpowerDemand(new BigDecimal("1.0"));
        detailRepository.saveAndFlush(detail);
    }

    private void staff() {
        TestStaff staff = new TestStaff();
        staff.setName("LOCK-STAFF");
        staff.setEmpNo("LOCK-STAFF");
        staff.setTestType("lock-test");
        staff.setStatus(TestStaff.StaffStatus.active);
        staff.setCurrentCoefficient(BigDecimal.ONE);
        staffRepository.saveAndFlush(staff);
    }
}
