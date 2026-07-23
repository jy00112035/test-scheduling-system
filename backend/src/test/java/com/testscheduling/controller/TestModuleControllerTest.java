package com.testscheduling.controller;

import com.testscheduling.dto.TestModuleRequest;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.security.RequestRoleGuard;
import com.testscheduling.service.TestModuleService;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TestModuleControllerTest {

    private final TestModuleService service = mock(TestModuleService.class);
    private final RequestRoleGuard roleGuard = mock(RequestRoleGuard.class);
    private final TestModuleController controller = new TestModuleController(service, roleGuard);

    @Test
    void everyWriteEndpointRequiresFieldAdminRole() {
        TestModuleRequest request = new TestModuleRequest("支付模块", "功能测试", 10);
        TestModuleConfig module = new TestModuleConfig();
        when(service.create(request)).thenReturn(module);
        when(service.update(11L, request)).thenReturn(module);
        when(service.setEnabled(11L, false)).thenReturn(module);

        controller.create(request);
        controller.update(11L, request);
        controller.status(11L, Map.of("enabled", false));
        controller.delete(11L);

        verify(roleGuard, times(4)).requireAny("fieldAdmin");
    }

    @Test
    void listEndpointDoesNotRequireFieldAdminRole() {
        when(service.list(null, null)).thenReturn(List.of());

        controller.list(null, null);

        verify(roleGuard, never()).requireAny("fieldAdmin");
    }

    @Test
    void statusEndpointRejectsMissingEnabledValue() {
        BusinessException error = assertThrows(BusinessException.class,
            () -> controller.status(11L, Map.of()));

        assertEquals("MODULE_ENABLED_REQUIRED", error.getErrorCode());
    }
}
