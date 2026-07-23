package com.testscheduling.security;

import com.testscheduling.dto.StaffRequest;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.entity.User;
import com.testscheduling.exception.BusinessException;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

@Component
public class StaffRoleAssignmentPolicy {

    private static final Set<String> ALL_NON_ADMIN_ROLES = Set.of(
        "testExecutor", "testManager", "resourceManager", "projectManager",
        "fieldAdmin", "testLead");
    private static final Set<String> PROJECT_MANAGER_ROLES = Set.of(
        "testExecutor", "testManager", "resourceManager", "testLead");
    private static final Set<String> EXECUTOR_ONLY = Set.of("testExecutor");

    public List<String> authorizeCreate(User actor, StaffRequest request) {
        if (hasRole(actor, "testLead") && !hasManagerRole(actor)) {
            throw error("TEST_LEAD_CREATE_FORBIDDEN", "测试组长无权创建人员");
        }
        List<String> requested = requestedRoles(request, List.of("testExecutor"));
        requireAssignable(actor, requested);
        return requested;
    }

    public List<String> authorizeUpdate(
            User actor, User targetUser, TestStaff targetStaff, StaffRequest request) {
        List<String> current = currentRoles(targetUser);
        requireAssignable(actor, current);
        List<String> requested = requestedRoles(request, current);
        rejectAdmin(requested);

        if (hasRole(actor, "testLead") && !hasManagerRole(actor)) {
            requireMatchingTestType(actor, targetStaff.getTestType());
            requireMatchingTestType(actor, request.getTestType());
            if (!new LinkedHashSet<>(current).equals(new LinkedHashSet<>(requested))) {
                throw error("STAFF_ROLE_CHANGE_FORBIDDEN", "测试组长无权修改人员角色");
            }
        }
        requireAssignable(actor, requested);
        return requested;
    }

    public void authorizeDelete(User actor, User targetUser, TestStaff targetStaff) {
        if (hasRole(actor, "testLead") && !hasManagerRole(actor)) {
            throw error("TEST_LEAD_SCOPE_FORBIDDEN", "测试组长无权删除人员");
        }
        requireAssignable(actor, currentRoles(targetUser));
    }

    private void requireAssignable(User actor, List<String> roles) {
        rejectAdmin(roles);
        Set<String> allowed = allowedRoles(actor);
        if (roles.isEmpty() || !allowed.containsAll(roles)) {
            throw error("STAFF_ROLE_ASSIGNMENT_FORBIDDEN", "无权分配请求中的人员角色");
        }
    }

    private Set<String> allowedRoles(User actor) {
        List<String> actorRoles = actor.getRoles() == null ? List.of() : actor.getRoles();
        if (actorRoles.contains("admin")) {
            return ALL_NON_ADMIN_ROLES;
        }
        Set<String> allowed = new LinkedHashSet<>();
        if (actorRoles.contains("projectManager")) {
            allowed.addAll(PROJECT_MANAGER_ROLES);
        }
        if (actorRoles.contains("resourceManager")
                || actorRoles.contains("fieldAdmin")
                || actorRoles.contains("testLead")) {
            allowed.addAll(EXECUTOR_ONLY);
        }
        return allowed;
    }

    private List<String> requestedRoles(StaffRequest request, List<String> fallback) {
        List<String> requested = request.getRoles();
        if (requested == null || requested.isEmpty()) {
            requested = request.getRole() == null || request.getRole().isBlank()
                ? fallback : List.of(request.getRole());
        }
        return new ArrayList<>(requested.stream()
            .filter(Objects::nonNull)
            .map(String::trim)
            .filter(role -> !role.isEmpty())
            .distinct()
            .toList());
    }

    private List<String> currentRoles(User targetUser) {
        if (targetUser == null || targetUser.getRoles() == null || targetUser.getRoles().isEmpty()) {
            return List.of("testExecutor");
        }
        return List.copyOf(targetUser.getRoles());
    }

    private void rejectAdmin(List<String> roles) {
        if (roles.contains("admin")) {
            throw error("STAFF_ADMIN_ROLE_FORBIDDEN", "管理员角色只能通过独立引导流程维护");
        }
    }

    private boolean hasManagerRole(User actor) {
        List<String> roles = actor.getRoles() == null ? List.of() : actor.getRoles();
        return roles.stream().anyMatch(Set.of(
            "admin", "resourceManager", "projectManager", "fieldAdmin")::contains);
    }

    private boolean hasRole(User actor, String role) {
        return actor.getRoles() != null && actor.getRoles().contains(role);
    }

    private void requireMatchingTestType(User actor, String targetTestType) {
        if (actor.getTestType() == null || actor.getTestType().isBlank()
                || targetTestType == null || !actor.getTestType().equals(targetTestType)) {
            throw error("TEST_LEAD_SCOPE_FORBIDDEN", "无权管理其他测试类型的人员");
        }
    }

    private BusinessException error(String code, String message) {
        return new BusinessException(code, message);
    }
}
