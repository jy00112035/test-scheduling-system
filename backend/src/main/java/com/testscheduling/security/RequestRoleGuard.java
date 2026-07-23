package com.testscheduling.security;

import com.testscheduling.exception.BusinessException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.Arrays;
import java.util.Collection;

@Component
public class RequestRoleGuard {

    public void requireAny(String... requiredRoles) {
        RequestAttributes attributes = RequestContextHolder.getRequestAttributes();
        if (!(attributes instanceof ServletRequestAttributes servletAttributes)) {
            throw forbidden();
        }

        HttpServletRequest request = servletAttributes.getRequest();
        Object usernameAttribute = request.getAttribute("username");
        Object roleAttribute = request.getAttribute("roles");
        if (!(usernameAttribute instanceof String username)
                || username.isBlank()
                || !(roleAttribute instanceof Collection<?> roles)) {
            throw forbidden();
        }

        boolean permitted = Arrays.stream(requiredRoles)
            .anyMatch(required -> roles.stream().anyMatch(required::equals))
            || roles.stream().anyMatch("admin"::equals);
        if (!permitted) {
            throw forbidden();
        }
    }

    private BusinessException forbidden() {
        return new BusinessException("FORBIDDEN", "无权限执行此操作");
    }
}
