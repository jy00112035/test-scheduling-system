package com.testscheduling.controller;

import com.testscheduling.dto.ApiResponse;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.security.RequestRoleGuard;
import com.testscheduling.service.TestModuleService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/test-modules")
public class TestModuleController {

    private final TestModuleService service;
    private final RequestRoleGuard roleGuard;

    public TestModuleController(TestModuleService service, RequestRoleGuard roleGuard) {
        this.service = service;
        this.roleGuard = roleGuard;
    }

    @GetMapping
    public ApiResponse<List<TestModuleConfig>> list(
            @RequestParam(required = false) String testType,
            @RequestParam(required = false) Boolean enabled) {
        return ApiResponse.success(service.list(testType, enabled));
    }

    @PostMapping
    public ApiResponse<TestModuleConfig> create(@RequestBody TestModuleConfig module) {
        roleGuard.requireAny("fieldAdmin");
        return ApiResponse.success("创建成功", service.create(module));
    }

    @PutMapping("/{id}")
    public ApiResponse<TestModuleConfig> update(
            @PathVariable Long id, @RequestBody TestModuleConfig module) {
        roleGuard.requireAny("fieldAdmin");
        return ApiResponse.success("更新成功", service.update(id, module));
    }

    @PutMapping("/{id}/status")
    public ApiResponse<TestModuleConfig> status(
            @PathVariable Long id, @RequestBody Map<String, Boolean> body) {
        roleGuard.requireAny("fieldAdmin");
        Boolean enabled = body == null ? null : body.get("enabled");
        if (enabled == null) {
            throw new BusinessException("MODULE_ENABLED_REQUIRED", "模块状态不能为空");
        }
        return ApiResponse.success("状态更新成功", service.setEnabled(id, enabled));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        roleGuard.requireAny("fieldAdmin");
        service.delete(id);
        return ApiResponse.success("删除成功", null);
    }
}
