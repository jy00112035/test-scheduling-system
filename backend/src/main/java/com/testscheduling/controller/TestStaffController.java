package com.testscheduling.controller;

import com.testscheduling.dto.ApiResponse;
import com.testscheduling.dto.StaffCreateResponse;
import com.testscheduling.dto.StaffRequest;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.service.TestStaffService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/staff")
public class TestStaffController {

    @Autowired
    private TestStaffService testStaffService;

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
            return ApiResponse.success("更新成功", testStaffService.update(id, request));
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @DeleteMapping("/batch")
    public ApiResponse<Void> deleteStaffsBatch(@RequestBody List<Long> ids) {
        try {
            testStaffService.deleteBatch(ids);
            return ApiResponse.success("批量删除成功", null);
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> deleteStaff(@PathVariable Long id) {
        try {
            testStaffService.delete(id);
            return ApiResponse.success("删除成功", null);
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }
}
