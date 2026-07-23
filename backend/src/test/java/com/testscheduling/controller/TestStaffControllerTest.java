package com.testscheduling.controller;

import com.testscheduling.dto.LegacyModuleMigrationReport;
import com.testscheduling.dto.StaffRequest;
import com.testscheduling.entity.User;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.UserRepository;
import com.testscheduling.security.RequestRoleGuard;
import com.testscheduling.service.TestStaffService;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.InOrder;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TestStaffControllerTest {

    @Mock
    private TestStaffService testStaffService;

    @Mock
    private RequestRoleGuard roleGuard;

    @Mock
    private HttpServletRequest request;

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private TestStaffController controller;

    @Test
    void legacyMigrationRequiresFieldAdminBeforeRunningService() {
        LegacyModuleMigrationReport report = new LegacyModuleMigrationReport(
            1, Map.of(), Map.of(), List.of());
        when(testStaffService.migrateLegacyModules()).thenReturn(report);

        var response = controller.migrateLegacyModules();

        InOrder order = inOrder(roleGuard, testStaffService);
        order.verify(roleGuard).requireAny("fieldAdmin");
        order.verify(testStaffService).migrateLegacyModules();
        assertEquals("迁移完成", response.getMessage());
        assertEquals(report, response.getData());
    }

    @Test
    void testLeadWithNonManagerRoleStillCannotCreateStaffForAnotherTestType() {
        User lead = new User();
        lead.setUsername("lead");
        lead.setTestType("功能测试");
        when(request.getAttribute("roles"))
            .thenReturn(List.of("testLead", "testExecutor"));
        when(request.getAttribute("username")).thenReturn("lead");
        when(userRepository.findByUsername("lead")).thenReturn(Optional.of(lead));
        StaffRequest staff = new StaffRequest();
        staff.setTestType("性能测试");

        BusinessException error = assertThrows(BusinessException.class,
            () -> controller.createStaff(staff));

        assertEquals("TEST_LEAD_SCOPE_FORBIDDEN", error.getErrorCode());
    }
}
