package com.testscheduling.service;

import com.testscheduling.entity.FieldConfig;
import com.testscheduling.dto.StaffRequest;
import com.testscheduling.entity.DemandManpowerDetail;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.FieldConfigRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;

import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.math.BigDecimal;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

@SpringBootTest
class FieldConfigOptionConcurrencyIntegrationTest {

    @SpyBean FieldConfigService service;
    @Autowired TestStaffService staffService;
    @Autowired TestDemandService demandService;
    @SpyBean FieldConfigRepository repository;

    private final ExecutorService executor = Executors.newFixedThreadPool(2);

    @AfterEach
    void shutDownExecutor() throws InterruptedException {
        executor.shutdownNow();
        assertTrue(executor.awaitTermination(5, TimeUnit.SECONDS));
    }

    @Test
    void concurrentAppendsRetainBothOptions() throws Exception {
        repository.deleteAll();
        FieldConfig config = new FieldConfig();
        config.setFieldName("groupName");
        config.setFieldType("select");
        config.setOptions("已有项目");
        repository.saveAndFlush(config);

        CountDownLatch firstWriterAtSave = new CountDownLatch(1);
        CountDownLatch releaseFirstWriter = new CountDownLatch(1);
        AtomicBoolean pauseOnce = new AtomicBoolean();
        doAnswer(invocation -> {
            FieldConfig saving = invocation.getArgument(0);
            if (saving.getOptions().contains("并发项目甲")
                    && pauseOnce.compareAndSet(false, true)) {
                firstWriterAtSave.countDown();
                if (!releaseFirstWriter.await(5, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("timed out waiting to release first option append");
                }
            }
            return saving;
        }).when(repository).save(any(FieldConfig.class));

        Future<?> first = executor.submit(
            () -> service.appendStaffOptions("并发项目甲", null, null));
        assertTrue(firstWriterAtSave.await(5, TimeUnit.SECONDS));
        Future<?> second = executor.submit(
            () -> service.appendStaffOptions("并发项目乙", null, null));

        try {
            second.get(1, TimeUnit.SECONDS);
        } catch (java.util.concurrent.TimeoutException expectedWhenLocked) {
            // The second transaction waits for the first row lock after the fix.
        } finally {
            releaseFirstWriter.countDown();
        }
        first.get(5, TimeUnit.SECONDS);
        second.get(5, TimeUnit.SECONDS);

        FieldConfig saved = repository.findByFieldName("groupName").orElseThrow();
        assertEquals(Set.of("已有项目", "并发项目甲", "并发项目乙"),
            Set.copyOf(Arrays.asList(saved.getOptions().split(","))));
    }

    @Test
    void manualUpdateWaitsForStaffCreateAndKeepsItsReferencedOption() throws Exception {
        repository.deleteAll();
        FieldConfig config = new FieldConfig();
        config.setFieldName("groupName");
        config.setFieldType("select");
        config.setOptions("待删除旧项目");
        config = repository.saveAndFlush(config);

        CountDownLatch appendAtSave = new CountDownLatch(1);
        CountDownLatch releaseAppend = new CountDownLatch(1);
        AtomicBoolean pauseOnce = new AtomicBoolean();
        doAnswer(invocation -> {
            FieldConfig saving = invocation.getArgument(0);
            if (saving.getOptions().contains("自动追加项目")
                    && pauseOnce.compareAndSet(false, true)) {
                appendAtSave.countDown();
                if (!releaseAppend.await(5, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("timed out waiting to release staff option append");
                }
            }
            return saving;
        }).when(repository).save(any(FieldConfig.class));

        StaffRequest staff = new StaffRequest();
        staff.setName("并发字段人员");
        staff.setEmpNo("FIELD-CONCURRENT-" + java.util.UUID.randomUUID());
        staff.setGroupName("自动追加项目");
        staff.setStatus("active");
        Future<?> append = executor.submit(() -> staffService.create(staff, "admin"));
        assertTrue(appendAtSave.await(5, TimeUnit.SECONDS));

        FieldConfig manualChanges = new FieldConfig();
        manualChanges.setFieldName("groupName");
        manualChanges.setFieldType("select");
        manualChanges.setOptions("管理员项目");
        manualChanges.setRequired(false);
        manualChanges.setSortOrder(10);
        Long configId = config.getId();
        Future<?> manual = executor.submit(() -> service.update(configId, manualChanges));

        try {
            assertThrows(TimeoutException.class,
                () -> manual.get(300, TimeUnit.MILLISECONDS));
        } finally {
            releaseAppend.countDown();
        }

        append.get(5, TimeUnit.SECONDS);
        manual.get(5, TimeUnit.SECONDS);
        FieldConfig saved = repository.findById(configId).orElseThrow();
        Set<String> savedOptions = Set.copyOf(Arrays.asList(saved.getOptions().split(",")));
        assertTrue(savedOptions.containsAll(Set.of("自动追加项目", "管理员项目")));
        assertFalse(savedOptions.contains("待删除旧项目"));
    }

    @Test
    void manualUpdateWaitsForDemandWriteAndKeepsItsReferencedTestType() throws Exception {
        repository.deleteAll();
        FieldConfig config = new FieldConfig();
        config.setFieldName("testType");
        config.setFieldType("select");
        config.setOptions("并发需求类型,待删除旧类型");
        config = repository.saveAndFlush(config);

        CountDownLatch demandAtFieldConfigLock = new CountDownLatch(1);
        CountDownLatch releaseDemand = new CountDownLatch(1);
        AtomicBoolean pauseOnce = new AtomicBoolean();
        doAnswer(invocation -> {
            Object result = invocation.callRealMethod();
            if (pauseOnce.compareAndSet(false, true)) {
                demandAtFieldConfigLock.countDown();
                if (!releaseDemand.await(5, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("timed out waiting to release demand write");
                }
            }
            return result;
        }).when(service).validateTestTypeOptionsForDemandWrite(any());

        TestDemand demand = new TestDemand();
        demand.setProduct("并发字段需求");
        demand.setVersionType("release");
        DemandManpowerDetail detail = new DemandManpowerDetail();
        detail.setTestType("并发需求类型");
        detail.setManpowerDemand(BigDecimal.ONE);
        demand.setManpowerDetails(List.of(detail));
        Future<?> demandWrite = executor.submit(
            () -> demandService.create(demand, "field-concurrency-submitter"));
        assertTrue(demandAtFieldConfigLock.await(5, TimeUnit.SECONDS));

        FieldConfig manualChanges = new FieldConfig();
        manualChanges.setFieldName("testType");
        manualChanges.setFieldType("select");
        manualChanges.setOptions("管理员类型");
        manualChanges.setRequired(false);
        manualChanges.setSortOrder(10);
        Long configId = config.getId();
        Future<?> manual = executor.submit(() -> service.update(configId, manualChanges));

        try {
            assertThrows(TimeoutException.class,
                () -> manual.get(300, TimeUnit.MILLISECONDS));
        } finally {
            releaseDemand.countDown();
        }

        demandWrite.get(5, TimeUnit.SECONDS);
        manual.get(5, TimeUnit.SECONDS);
        FieldConfig saved = repository.findById(configId).orElseThrow();
        Set<String> savedOptions = Set.copyOf(Arrays.asList(saved.getOptions().split(",")));
        assertTrue(savedOptions.containsAll(Set.of("管理员类型", "并发需求类型")));
        assertFalse(savedOptions.contains("待删除旧类型"));
    }

    @Test
    void demandWriteAfterTestTypeRemovalIsRejectedInsteadOfRecreatingTheRemovedOption()
            throws Exception {
        repository.deleteAll();
        FieldConfig config = new FieldConfig();
        config.setFieldName("testType");
        config.setFieldType("select");
        config.setOptions("已删除类型,保留类型");
        config = repository.saveAndFlush(config);

        FieldConfig manualChanges = new FieldConfig();
        manualChanges.setFieldName("testType");
        manualChanges.setFieldType("select");
        manualChanges.setOptions("保留类型");
        manualChanges.setRequired(false);
        manualChanges.setSortOrder(10);
        service.update(config.getId(), manualChanges);

        TestDemand demand = new TestDemand();
        demand.setProduct("过期页面提交的需求");
        demand.setVersionType("release");
        DemandManpowerDetail detail = new DemandManpowerDetail();
        detail.setTestType("已删除类型");
        detail.setManpowerDemand(BigDecimal.ONE);
        demand.setManpowerDetails(List.of(detail));

        Future<?> demandWrite = executor.submit(
            () -> demandService.create(demand, "stale-form-submitter"));
        java.util.concurrent.ExecutionException failure = assertThrows(
            java.util.concurrent.ExecutionException.class, () -> demandWrite.get(5, TimeUnit.SECONDS));
        BusinessException businessFailure = assertInstanceOf(
            BusinessException.class, failure.getCause());
        assertEquals("DEMAND_TEST_TYPE_NOT_CONFIGURED", businessFailure.getErrorCode());
        Set<String> options = Set.copyOf(Arrays.asList(
            repository.findById(config.getId()).orElseThrow().getOptions().split(",")));
        assertTrue(options.contains("保留类型"));
        assertFalse(options.contains("已删除类型"));
    }

    @Test
    void demandWriteWithoutATestTypeConfigRowIsRejected() throws Exception {
        repository.deleteAll();

        TestDemand demand = new TestDemand();
        demand.setProduct("缺失配置的需求");
        demand.setVersionType("release");
        DemandManpowerDetail detail = new DemandManpowerDetail();
        detail.setTestType("任意旧类型");
        detail.setManpowerDemand(BigDecimal.ONE);
        demand.setManpowerDetails(List.of(detail));

        Future<?> demandWrite = executor.submit(
            () -> demandService.create(demand, "missing-config-submitter"));
        java.util.concurrent.ExecutionException failure = assertThrows(
            java.util.concurrent.ExecutionException.class, () -> demandWrite.get(5, TimeUnit.SECONDS));
        BusinessException businessFailure = assertInstanceOf(
            BusinessException.class, failure.getCause());
        assertEquals("DEMAND_TEST_TYPE_NOT_CONFIGURED", businessFailure.getErrorCode());
    }
}
