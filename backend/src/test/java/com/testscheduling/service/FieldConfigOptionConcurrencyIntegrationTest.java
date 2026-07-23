package com.testscheduling.service;

import com.testscheduling.entity.FieldConfig;
import com.testscheduling.repository.FieldConfigRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;

import java.util.Arrays;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

@SpringBootTest
class FieldConfigOptionConcurrencyIntegrationTest {

    @Autowired FieldConfigService service;
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
            () -> service.appendStaffOptions("并发项目甲", null));
        assertTrue(firstWriterAtSave.await(5, TimeUnit.SECONDS));
        Future<?> second = executor.submit(
            () -> service.appendStaffOptions("并发项目乙", null));

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
    void manualUpdateWaitsForAppendAndMergesFreshStaffOption() throws Exception {
        repository.deleteAll();
        FieldConfig config = new FieldConfig();
        config.setFieldName("groupName");
        config.setFieldType("select");
        config.setOptions("已有项目");
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

        Future<?> append = executor.submit(
            () -> service.appendStaffOptions("自动追加项目", null));
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
        assertEquals(Set.of("已有项目", "自动追加项目", "管理员项目"),
            Set.copyOf(Arrays.asList(saved.getOptions().split(","))));
    }
}
