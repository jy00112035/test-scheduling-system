package com.testscheduling.service;

import com.testscheduling.dto.TestModuleRequest;
import com.testscheduling.entity.DemandManpowerDetail;
import com.testscheduling.entity.DemandSpecialModule;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.DemandSpecialModuleRepository;
import com.testscheduling.repository.TestModuleConfigRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

@SpringBootTest
class DemandModuleIdentityLockIntegrationTest {

    private static final String DATABASE_URL = "jdbc:h2:mem:demand-module-lock-"
        + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=5000";

    @DynamicPropertySource
    static void useUniqueDatabase(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> DATABASE_URL);
    }

    @Autowired TestDemandService demandService;
    @Autowired TestModuleService moduleService;
    @Autowired TestModuleConfigRepository moduleRepository;
    @Autowired EntityManager entityManager;
    @SpyBean DemandSpecialModuleRepository specialRepository;

    @Test
    void moduleIdentityCannotChangeBetweenDemandValidationAndSpecialPersistence() throws Exception {
        TestModuleConfig module = moduleService.create(
            new TestModuleRequest("Race Module", "功能测试", 1));
        CountDownLatch beforeSpecialSave = new CountDownLatch(1);
        CountDownLatch allowSpecialSave = new CountDownLatch(1);
        CountDownLatch moduleUpdateFinished = new CountDownLatch(1);
        doAnswer(invocation -> {
            beforeSpecialSave.countDown();
            await(allowSpecialSave);
            Iterable<?> rows = invocation.getArgument(0);
            java.util.ArrayList<Object> persisted = new java.util.ArrayList<>();
            rows.forEach(row -> {
                entityManager.persist(row);
                persisted.add(row);
            });
            return persisted;
        }).when(specialRepository).saveAll(any());

        ExecutorService executor = Executors.newFixedThreadPool(2);
        Future<TestDemand> creation = executor.submit(() -> demandService.create(demand(module.getId())));
        Future<?> update = null;
        try {
            assertTrue(beforeSpecialSave.await(5, TimeUnit.SECONDS));
            update = executor.submit(() -> {
                try {
                    return moduleService.update(module.getId(),
                        new TestModuleRequest("Race Module", "性能测试", 1));
                } finally {
                    moduleUpdateFinished.countDown();
                }
            });

            assertFalse(moduleUpdateFinished.await(300, TimeUnit.MILLISECONDS),
                "module identity update must wait for demand validation transaction");
            allowSpecialSave.countDown();

            TestDemand created = creation.get(5, TimeUnit.SECONDS);
            Future<?> updateFuture = update;
            ExecutionException updateFailure = org.junit.jupiter.api.Assertions.assertThrows(
                ExecutionException.class, () -> updateFuture.get(5, TimeUnit.SECONDS));
            BusinessException businessError = assertInstanceOf(
                BusinessException.class, updateFailure.getCause());
            assertEquals("MODULE_REFERENCED_IMMUTABLE", businessError.getErrorCode());
            assertEquals("功能测试",
                moduleRepository.findById(module.getId()).orElseThrow().getTestType());
            assertEquals("功能测试", created.getManpowerDetails().getFirst().getTestType());
            assertEquals("功能测试", created.getSpecialModuleDemands().getFirst().getTestType());
        } finally {
            allowSpecialSave.countDown();
            creation.cancel(true);
            if (update != null) {
                update.cancel(true);
            }
            executor.shutdownNow();
            assertTrue(executor.awaitTermination(5, TimeUnit.SECONDS));
        }
    }

    private TestDemand demand(Long moduleId) {
        DemandManpowerDetail detail = new DemandManpowerDetail();
        detail.setTestType("功能测试");
        detail.setManpowerDemand(BigDecimal.ONE);
        DemandSpecialModule special = new DemandSpecialModule();
        special.setModuleId(moduleId);
        special.setManpowerDemand(BigDecimal.ONE);
        special.setTestType("客户端伪造分组");
        TestDemand demand = new TestDemand();
        demand.setProduct("Race Demand");
        demand.setVersionType("release");
        demand.setManpowerDetails(List.of(detail));
        demand.setSpecialModuleDemands(List.of(special));
        return demand;
    }

    private void await(CountDownLatch latch) {
        try {
            if (!latch.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("timed out waiting for test coordination");
            }
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(error);
        }
    }
}
