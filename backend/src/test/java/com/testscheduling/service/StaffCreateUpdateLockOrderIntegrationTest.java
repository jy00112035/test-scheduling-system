package com.testscheduling.service;

import com.testscheduling.dto.StaffRequest;
import com.testscheduling.entity.FieldConfig;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.repository.FieldConfigRepository;
import com.testscheduling.repository.TestModuleConfigRepository;
import com.testscheduling.repository.TestStaffModuleRepository;
import com.testscheduling.repository.TestStaffRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;

@SpringBootTest
class StaffCreateUpdateLockOrderIntegrationTest {

    private static final String DATABASE_URL = "jdbc:h2:mem:staff-lock-order-"
        + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=5000";

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> DATABASE_URL);
    }

    @Autowired TestStaffService service;
    @Autowired TestStaffRepository staffRepository;
    @Autowired TestStaffModuleRepository staffModuleRepository;
    @SpyBean TestModuleConfigRepository moduleRepository;
    @SpyBean FieldConfigRepository fieldConfigRepository;
    @Autowired EntityManager entityManager;

    private final ExecutorService executor = Executors.newFixedThreadPool(2);

    @AfterEach
    void shutDownExecutor() throws InterruptedException {
        executor.shutdownNow();
        assertTrue(executor.awaitTermination(5, TimeUnit.SECONDS));
    }

    @Test
    void concurrentCreateAndUpdateUseModuleBeforeFieldConfigAndBothCommit() throws Exception {
        TestModuleConfig module = new TestModuleConfig();
        module.setModuleName("共享锁序模块-" + UUID.randomUUID());
        module.setTestType("功能测试");
        module.setEnabled(true);
        module.setSortOrder(10);
        module = moduleRepository.saveAndFlush(module);
        String existingEmpNo = "LOCK-UPDATE-" + UUID.randomUUID();
        TestStaff existing = service.create(
            request(existingEmpNo, "更新前人员", "更新前项目", module.getId()), "admin")
            .getStaff();

        CountDownLatch createAtFieldSave = new CountDownLatch(1);
        CountDownLatch releaseCreate = new CountDownLatch(1);
        CountDownLatch updateHasModuleLock = new CountDownLatch(1);
        AtomicBoolean pauseCreateOnce = new AtomicBoolean();
        doAnswer(invocation -> {
            FieldConfig saving = invocation.getArgument(0);
            if (Thread.currentThread().getName().equals("canonical-create")
                    && "groupName".equals(saving.getFieldName())
                    && saving.getOptions().contains("并发创建项目")
                    && pauseCreateOnce.compareAndSet(false, true)) {
                createAtFieldSave.countDown();
                if (!releaseCreate.await(5, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("timed out releasing concurrent staff create");
                }
            }
            return saving;
        }).when(fieldConfigRepository).save(any(FieldConfig.class));

        Long moduleId = module.getId();
        doAnswer(invocation -> {
            Optional<TestModuleConfig> locked = Optional.ofNullable(entityManager.find(
                TestModuleConfig.class, moduleId, LockModeType.PESSIMISTIC_WRITE));
            if (Thread.currentThread().getName().equals("canonical-update")) {
                updateHasModuleLock.countDown();
            }
            return locked;
        }).when(moduleRepository).findByIdForUpdate(eq(moduleId));

        String createdEmpNo = "LOCK-CREATE-" + UUID.randomUUID();
        Future<?> create = executor.submit(() -> {
            Thread.currentThread().setName("canonical-create");
            return service.create(request(
                createdEmpNo, "并发创建人员", "并发创建项目", moduleId), "admin");
        });
        assertTrue(createAtFieldSave.await(5, TimeUnit.SECONDS));

        Future<?> update = executor.submit(() -> {
            Thread.currentThread().setName("canonical-update");
            return service.update(existing.getId(), request(
                existingEmpNo, "并发更新人员", "并发更新项目", moduleId), "admin");
        });

        updateHasModuleLock.await(500, TimeUnit.MILLISECONDS);
        releaseCreate.countDown();
        create.get(8, TimeUnit.SECONDS);
        update.get(8, TimeUnit.SECONDS);

        TestStaff created = staffRepository.findByEmpNo(createdEmpNo).orElseThrow();
        TestStaff updated = staffRepository.findById(existing.getId()).orElseThrow();
        assertEquals("并发创建人员", created.getName());
        assertEquals("并发更新人员", updated.getName());
        assertEquals(List.of(moduleId), staffModuleRepository.findModuleIdsByStaffId(created.getId()));
        assertEquals(List.of(moduleId), staffModuleRepository.findModuleIdsByStaffId(updated.getId()));
    }

    private StaffRequest request(
            String empNo, String name, String groupName, Long moduleId) {
        StaffRequest request = new StaffRequest();
        request.setName(name);
        request.setEmpNo(empNo);
        request.setGroupName(groupName);
        request.setStatus("active");
        request.setFamiliarModuleIds(List.of(moduleId));
        return request;
    }
}
