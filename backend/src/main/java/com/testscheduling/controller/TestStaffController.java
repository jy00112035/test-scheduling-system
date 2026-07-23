package com.testscheduling.controller;

import com.testscheduling.dto.ApiResponse;
import com.testscheduling.dto.LegacyModuleMigrationReport;
import com.testscheduling.dto.StaffCreateResponse;
import com.testscheduling.dto.StaffRequest;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.entity.User;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.UserRepository;
import com.testscheduling.security.RequestRoleGuard;
import com.testscheduling.service.TestStaffService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;

@RestController
@RequestMapping("/api/staff")
public class TestStaffController {

    @Autowired
    private TestStaffService testStaffService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private HttpServletRequest request;

    @Autowired
    private RequestRoleGuard roleGuard;

    private boolean isRestrictedTestLead() {
        Object rolesObj = request.getAttribute("roles");
        if (rolesObj instanceof List<?> list) {
            return list.contains("testLead")
                && list.stream().noneMatch(role -> List.of(
                    "admin", "resourceManager", "projectManager", "fieldAdmin").contains(role));
        }
        return false;
    }

    private String getCurrentUserTestType() {
        String username = (String) request.getAttribute("username");
        if (username != null) {
            return userRepository.findByUsername(username)
                .map(User::getTestType)
                .orElse(null);
        }
        return null;
    }

    @GetMapping
    public ApiResponse<List<TestStaff>> getAllStaff() {
        return ApiResponse.success(testStaffService.findAll());
    }

    @GetMapping("/active")
    public ApiResponse<List<TestStaff>> getActiveStaff() {
        return ApiResponse.success(testStaffService.findActive());
    }

    @GetMapping("/group/{groupName}")
    public ApiResponse<List<TestStaff>> getStaffByGroup(@PathVariable String groupName) {
        return ApiResponse.success(testStaffService.findByGroupName(groupName));
    }

    @GetMapping("/role/{empNo}")
    public ApiResponse<String> getRoleByEmpNo(@PathVariable String empNo) {
        String role = testStaffService.getRoleByEmpNo(empNo);
        return ApiResponse.success(role);
    }

    @GetMapping("/roles/{empNo}")
    public ApiResponse<List<String>> getRolesByEmpNo(@PathVariable String empNo) {
        List<String> roles = testStaffService.getRolesByEmpNo(empNo);
        return ApiResponse.success(roles);
    }

    @PostMapping("/modules/migrate-legacy")
    public ApiResponse<LegacyModuleMigrationReport> migrateLegacyModules() {
        roleGuard.requireAny("fieldAdmin");
        return ApiResponse.success("迁移完成", testStaffService.migrateLegacyModules());
    }

    @GetMapping("/{id}")
    public ApiResponse<TestStaff> getStaffById(@PathVariable Long id) {
        try {
            return ApiResponse.success(testStaffService.findById(id));
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @PostMapping
    public ApiResponse<StaffCreateResponse> createStaff(@RequestBody StaffRequest request) {
        requireStaffMutationRole();
        enforceTestLeadScope(request.getTestType());
        try {
            return ApiResponse.success("创建成功", testStaffService.create(request));
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @PutMapping("/{id}")
    public ApiResponse<TestStaff> updateStaff(@PathVariable Long id, @RequestBody StaffRequest request) {
        requireStaffMutationRole();
        if (isRestrictedTestLead()) {
            TestStaff staff = testStaffService.findById(id);
            enforceTestLeadScope(staff.getTestType());
            enforceTestLeadScope(request.getTestType());
        }
        try {
            return ApiResponse.success("更新成功", testStaffService.update(id, request));
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @DeleteMapping("/batch")
    public ApiResponse<Void> deleteStaffsBatch(@RequestBody List<Long> ids) {
        requireStaffMutationRole();
        denyTestLeadDelete();
        try {
            testStaffService.deleteBatch(ids);
            return ApiResponse.success("批量删除成功", null);
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> deleteStaff(@PathVariable Long id) {
        requireStaffMutationRole();
        denyTestLeadDelete();
        try {
            testStaffService.delete(id);
            return ApiResponse.success("删除成功", null);
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    private void requireStaffMutationRole() {
        roleGuard.requireAny("resourceManager", "projectManager", "fieldAdmin", "testLead");
    }

    private void enforceTestLeadScope(String staffTestType) {
        if (!isRestrictedTestLead()) {
            return;
        }
        String currentUserTestType = getCurrentUserTestType();
        if (currentUserTestType == null || currentUserTestType.isBlank()) {
            throw new BusinessException(
                "TEST_LEAD_SCOPE_UNVERIFIED", "无法确认测试组长负责的测试类型");
        }
        if (staffTestType == null || !currentUserTestType.equals(staffTestType)) {
            throw new BusinessException(
                "TEST_LEAD_SCOPE_FORBIDDEN", "无权管理其他测试类型的人员");
        }
    }

    private void denyTestLeadDelete() {
        if (isRestrictedTestLead()) {
            throw new BusinessException("TEST_LEAD_SCOPE_FORBIDDEN", "测试组长无权删除人员");
        }
    }
}
