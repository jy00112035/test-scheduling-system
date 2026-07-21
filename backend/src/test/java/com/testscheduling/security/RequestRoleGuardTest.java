package com.testscheduling.security;

import com.testscheduling.exception.BusinessException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class RequestRoleGuardTest {

    private final RequestRoleGuard guard = new RequestRoleGuard();

    @AfterEach
    void clearRequestContext() {
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    void rejectsRequestWithoutJwtRoles() {
        bindRequest(new MockHttpServletRequest());

        BusinessException error = assertThrows(BusinessException.class,
            () -> guard.requireAny("fieldAdmin"));

        assertEquals("FORBIDDEN", error.getErrorCode());
    }

    @Test
    void rejectsRequestWithoutAnyRequiredRole() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setAttribute("username", "tester");
        request.setAttribute("roles", List.of("testExecutor"));
        bindRequest(request);

        BusinessException error = assertThrows(BusinessException.class,
            () -> guard.requireAny("fieldAdmin", "testManager"));

        assertEquals("FORBIDDEN", error.getErrorCode());
    }

    @Test
    void rejectsRolesWithoutAuthenticatedUsername() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setAttribute("roles", List.of("fieldAdmin"));
        bindRequest(request);

        BusinessException error = assertThrows(BusinessException.class,
            () -> guard.requireAny("fieldAdmin"));

        assertEquals("FORBIDDEN", error.getErrorCode());
    }

    @Test
    void acceptsRequestWithAnyRequiredRole() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setAttribute("username", "field-admin");
        request.setAttribute("roles", List.of("testExecutor", "fieldAdmin"));
        bindRequest(request);

        assertDoesNotThrow(() -> guard.requireAny("fieldAdmin"));
    }

    private static void bindRequest(MockHttpServletRequest request) {
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
    }
}
