package com.testscheduling.controller;

import com.testscheduling.dto.ApiResponse;
import com.testscheduling.dto.StaffCreateResponse;
import com.testscheduling.dto.StaffRequest;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.entity.User;
import com.testscheduling.repository.UserRepository;
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

    @SuppressWarnings("unchecked")
    private boolean isTestLead() {
        Object rolesObj = request.getAttribute("roles");
        if (rolesObj instanceof List<?> list) {
            return list.contains("testLead");
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
        try {
            return ApiResponse.success("创建成功", testStaffService.create(request));
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @PutMapping("/{id}")
    public ApiResponse<TestStaff> updateStaff(@PathVariable Long id, @RequestBody StaffRequest request) {
        try {
            if (isTestLead()) {
                TestStaff staff = testStaffService.findById(id);
                String currentUserTestType = getCurrentUserTestType();
                if (currentUserTestType != null && !currentUserTestType.equals(staff.getTestType())) {
                    return ApiResponse.error("无权编辑其他小组的人员");
                }
            }
            return ApiResponse.success("更新成功", testStaffService.update(id, request));
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @DeleteMapping("/batch")
    public ApiResponse<Void> deleteStaffsBatch(@RequestBody List<Long> ids) {
        try {
            if (isTestLead()) {
                return ApiResponse.error("无权删除人员");
            }
            testStaffService.deleteBatch(ids);
            return ApiResponse.success("批量删除成功", null);
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> deleteStaff(@PathVariable Long id) {
        try {
            if (isTestLead()) {
                return ApiResponse.error("无权删除人员");
            }
            testStaffService.delete(id);
            return ApiResponse.success("删除成功", null);
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }
}
