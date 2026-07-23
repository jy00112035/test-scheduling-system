package com.testscheduling.service;

import com.testscheduling.dto.StaffRequest;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.entity.User;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.TestStaffRepository;
import com.testscheduling.repository.UserRepository;
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
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;

@SpringBootTest
class StaffUpdateAuthorizationConcurrencyIntegrationTest {

    private static final String DATABASE_URL = "jdbc:h2:mem:staff-auth-lock-"
        + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=10000";

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> DATABASE_URL);
    }

    @Autowired TestStaffService service;
    @SpyBean TestStaffRepository staffRepository;
    @Autowired UserRepository userRepository;
    @Autowired EntityManager entityManager;

    private final ExecutorService executor = Executors.newFixedThreadPool(2);

    @AfterEach
    void shutDownExecutor() throws InterruptedException {
        executor.shutdownNow();
        assertTrue(executor.awaitTermination(5, TimeUnit.SECONDS));
    }

    @Test
    void lowerPrivilegeUpdateReauthorizesAfterConcurrentRoleElevation() throws Exception {
        String empNo = "STAFF-RACE-" + UUID.randomUUID();
        TestStaff target = staff(empNo);
        user(empNo, List.of("testExecutor"));
        String admin = "staff-race-admin-" + UUID.randomUUID();
        String resourceManager = "staff-race-resource-" + UUID.randomUUID();
        user(admin, List.of("admin"));
        user(resourceManager, List.of("resourceManager"));

        CountDownLatch lowerReachedLock = new CountDownLatch(1);
        CountDownLatch releaseLower = new CountDownLatch(1);
        AtomicBoolean pauseOnce = new AtomicBoolean();
        doAnswer(invocation -> {
            if (Thread.currentThread().getName().equals("lower-staff-update")
                    && pauseOnce.compareAndSet(false, true)) {
                lowerReachedLock.countDown();
                if (!releaseLower.await(5, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("timed out waiting to release lower update");
                }
            }
            return Optional.ofNullable(entityManager.find(
                TestStaff.class, target.getId(), LockModeType.PESSIMISTIC_WRITE));
        }).when(staffRepository).findByIdForUpdate(eq(target.getId()));

        Future<?> lower = executor.submit(() -> {
            Thread.currentThread().setName("lower-staff-update");
            return service.update(target.getId(), request(empNo, null), resourceManager);
        });
        assertTrue(lowerReachedLock.await(5, TimeUnit.SECONDS));

        service.update(target.getId(), request(empNo, List.of("projectManager")), admin);
        releaseLower.countDown();

        ExecutionException lowerError = assertThrows(ExecutionException.class,
            () -> lower.get(5, TimeUnit.SECONDS));
        BusinessException businessError = assertInstanceOf(
            BusinessException.class, lowerError.getCause());
        assertEquals("STAFF_ROLE_ASSIGNMENT_FORBIDDEN", businessError.getErrorCode());
        assertEquals(List.of("projectManager"),
            userRepository.findByUsername(empNo).orElseThrow().getRoles());
    }

    private TestStaff staff(String empNo) {
        TestStaff staff = new TestStaff();
        staff.setName("Concurrent Target");
        staff.setEmpNo(empNo);
        staff.setGroupName("功能测试组");
        staff.setTestType("功能测试");
        return staffRepository.saveAndFlush(staff);
    }

    private void user(String username, List<String> roles) {
        User user = new User();
        user.setUsername(username);
        user.setPassword("unused");
        user.setDisplayName(username);
        user.setRoles(roles);
        user.setEnabled(true);
        userRepository.saveAndFlush(user);
    }

    private StaffRequest request(String empNo, List<String> roles) {
        StaffRequest request = new StaffRequest();
        request.setName("Concurrent Target Updated");
        request.setEmpNo(empNo);
        request.setGroupName("功能测试组");
        request.setTestType("功能测试");
        request.setStatus("active");
        request.setRoles(roles);
        return request;
    }
}
