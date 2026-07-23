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
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
}
