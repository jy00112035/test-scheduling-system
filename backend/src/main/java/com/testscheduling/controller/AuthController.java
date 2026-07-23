package com.testscheduling.controller;

import com.testscheduling.dto.ApiResponse;
import com.testscheduling.dto.ChangePasswordRequest;
import com.testscheduling.dto.LoginRequest;
import com.testscheduling.dto.LoginResponse;
import com.testscheduling.dto.RegisterRequest;
import com.testscheduling.entity.User;
import com.testscheduling.security.RequestRoleGuard;
import com.testscheduling.service.AuthService;
import com.testscheduling.service.FieldConfigService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired
    private AuthService authService;

    @Autowired
    private RequestRoleGuard roleGuard;

    @Autowired
    private FieldConfigService fieldConfigService;

    @PostMapping("/login")
    public ApiResponse<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        try {
            LoginResponse response = authService.login(request);
            return ApiResponse.success(response);
        } catch (Exception e) {
            return ApiResponse.error(401, e.getMessage());
        }
    }

    @PostMapping("/change-password")
    public ApiResponse<Void> changePassword(
            @Valid @RequestBody ChangePasswordRequest request,
            HttpServletRequest httpRequest) {
        try {
            if (!request.getNewPassword().equals(request.getConfirmPassword())) {
                return ApiResponse.error("两次输入的新密码不一致");
            }
            String username = (String) httpRequest.getAttribute("username");
            if (username == null) {
                return ApiResponse.error(401, "未登录或登录已过期");
            }
            authService.changePassword(username, request.getOldPassword(), request.getNewPassword());
            return ApiResponse.success("密码修改成功", null);
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @PostMapping("/register")
    public ApiResponse<Void> register(@Valid @RequestBody RegisterRequest request) {
        try {
            authService.register(request);
            return ApiResponse.success("注册成功，请等待管理员审批", null);
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @GetMapping("/registration-options/test-types")
    public ApiResponse<List<String>> getRegistrationTestTypes() {
        return ApiResponse.success(fieldConfigService.findRegistrationTestTypes());
    }

    @SuppressWarnings("unchecked")
    @GetMapping("/pending-approvals")
    public ApiResponse<List<User>> getPendingApprovals(HttpServletRequest httpRequest) {
        requireRegistrationApprover();
        try {
            List<String> roles = (List<String>) httpRequest.getAttribute("roles");
            String username = (String) httpRequest.getAttribute("username");
            if (roles == null || roles.isEmpty()) {
                return ApiResponse.error(401, "未登录或登录已过期");
            }
            List<User> pending = authService.getPendingApprovals(roles, username);
            return ApiResponse.success(pending);
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @PutMapping("/approve/{id}")
    public ApiResponse<Void> approveUser(@PathVariable Long id, HttpServletRequest request) {
        requireRegistrationApprover();
        authService.approveUser(id, roles(request), username(request));
        return ApiResponse.success("已批准", null);
    }

    @PutMapping("/reject/{id}")
    public ApiResponse<Void> rejectUser(@PathVariable Long id, HttpServletRequest request) {
        requireRegistrationApprover();
        authService.rejectUser(id, roles(request), username(request));
        return ApiResponse.success("已拒绝", null);
    }

    @PutMapping("/batch-approve")
    public ApiResponse<Void> batchApprove(
            @RequestBody List<Long> ids, HttpServletRequest request) {
        requireRegistrationApprover();
        authService.batchApprove(ids, roles(request), username(request));
        return ApiResponse.success("批量批准成功", null);
    }

    @PutMapping("/batch-reject")
    public ApiResponse<Void> batchReject(
            @RequestBody List<Long> ids, HttpServletRequest request) {
        requireRegistrationApprover();
        authService.batchReject(ids, roles(request), username(request));
        return ApiResponse.success("批量拒绝成功", null);
    }

    private void requireRegistrationApprover() {
        roleGuard.requireAny("projectManager", "resourceManager", "testLead");
    }

    @SuppressWarnings("unchecked")
    private List<String> roles(HttpServletRequest request) {
        return (List<String>) request.getAttribute("roles");
    }

    private String username(HttpServletRequest request) {
        return (String) request.getAttribute("username");
    }
}
