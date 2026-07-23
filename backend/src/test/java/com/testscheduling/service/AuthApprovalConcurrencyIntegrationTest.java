package com.testscheduling.service;

import com.testscheduling.entity.User;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

@SpringBootTest
class AuthApprovalConcurrencyIntegrationTest {

    private static final String DATABASE_URL = "jdbc:h2:mem:auth-approval-lock-"
        + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=10000";

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> DATABASE_URL);
    }

    @Autowired AuthService service;
    @SpyBean UserRepository repository;

    private final ExecutorService executor = Executors.newFixedThreadPool(2);

    @AfterEach
    void shutDownExecutor() throws InterruptedException {
        executor.shutdownNow();
        assertTrue(executor.awaitTermination(5, TimeUnit.SECONDS));
    }

    @Test
    void rejectWaitsForConcurrentApprovalAndCannotDeleteEnabledUser() throws Exception {
        User target = pending("approval-race", List.of("testExecutor"));
        CountDownLatch approvalAtSave = new CountDownLatch(1);
        CountDownLatch releaseApproval = new CountDownLatch(1);
        AtomicBoolean pauseOnce = new AtomicBoolean();
        doAnswer(invocation -> {
            User saving = invocation.getArgument(0);
            if (target.getId().equals(saving.getId())
                    && Boolean.TRUE.equals(saving.getEnabled())
                    && pauseOnce.compareAndSet(false, true)) {
                approvalAtSave.countDown();
                if (!releaseApproval.await(5, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("timed out waiting to release approval");
                }
            }
            return saving;
        }).when(repository).save(any(User.class));

        Future<?> approval = executor.submit(() -> service.approveUser(
            target.getId(), List.of("resourceManager"), "resource-approver"));
        assertTrue(approvalAtSave.await(5, TimeUnit.SECONDS));
        Future<?> rejection = executor.submit(() -> service.rejectUser(
            target.getId(), List.of("resourceManager"), "resource-approver"));

        try {
            assertThrows(TimeoutException.class,
                () -> rejection.get(300, TimeUnit.MILLISECONDS));
        } finally {
            releaseApproval.countDown();
        }

        approval.get(5, TimeUnit.SECONDS);
        ExecutionException rejectionError = assertThrows(ExecutionException.class,
            () -> rejection.get(5, TimeUnit.SECONDS));
        BusinessException businessError = assertInstanceOf(
            BusinessException.class, rejectionError.getCause());
        assertEquals("APPROVAL_SCOPE_FORBIDDEN", businessError.getErrorCode());
        assertTrue(repository.findById(target.getId()).orElseThrow().getEnabled());
    }

    @Test
    void mixedBatchFailureLeavesEveryTargetPending() {
        User allowed = pending("batch-allowed", List.of("testExecutor"));
        User forbidden = pending("batch-forbidden", List.of("projectManager"));

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.batchApprove(
                List.of(forbidden.getId(), allowed.getId(), allowed.getId()),
                List.of("resourceManager"), "resource-approver"));

        assertEquals("APPROVAL_SCOPE_FORBIDDEN", error.getErrorCode());
        assertFalse(repository.findById(allowed.getId()).orElseThrow().getEnabled());
        assertFalse(repository.findById(forbidden.getId()).orElseThrow().getEnabled());
    }

    private User pending(String prefix, List<String> roles) {
        User user = new User();
        user.setUsername(prefix + "-" + UUID.randomUUID());
        user.setPassword("unused");
        user.setRoles(roles);
        user.setEnabled(false);
        return repository.saveAndFlush(user);
    }
}
