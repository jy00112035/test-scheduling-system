package com.testscheduling.controller;

import com.testscheduling.dto.ApiResponse;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.security.RequestRoleGuard;
import com.testscheduling.service.TestDemandService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/demands")
public class TestDemandController {

    @Autowired
    private TestDemandService testDemandService;

    @Autowired
    private RequestRoleGuard roleGuard;

    @GetMapping
    public ApiResponse<List<TestDemand>> getAllDemands() {
        return ApiResponse.success(testDemandService.findAll());
    }

    @GetMapping("/{id}")
    public ApiResponse<TestDemand> getDemandById(@PathVariable Long id) {
        try {
            return ApiResponse.success(testDemandService.findById(id));
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @GetMapping("/pending")
    public ApiResponse<List<TestDemand>> getPendingDemands() {
        return ApiResponse.success(testDemandService.findPendingAndScheduled());
    }

    @PostMapping
    public ApiResponse<TestDemand> createDemand(
            @RequestBody TestDemand demand, HttpServletRequest request) {
        requireDemandEditor();
        return ApiResponse.success("创建成功",
            testDemandService.create(demand, username(request)));
    }

    @PutMapping("/{id}")
    public ApiResponse<TestDemand> updateDemand(@PathVariable Long id, @RequestBody TestDemand demand) {
        requireDemandEditor();
        return ApiResponse.success("更新成功", testDemandService.update(id, demand));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> deleteDemand(@PathVariable Long id) {
        requireDemandEditor();
        testDemandService.delete(id);
        return ApiResponse.success("删除成功", null);
    }

    @PostMapping("/{id}/close")
    public ApiResponse<TestDemand> closeDemand(@PathVariable Long id) {
        requireDemandEditor();
        return ApiResponse.success("关闭成功", testDemandService.close(id));
    }

    @GetMapping("/pending-approval")
    public ApiResponse<List<TestDemand>> getPendingApprovalDemands() {
        return ApiResponse.success(testDemandService.findPendingApproval());
    }

    @PutMapping("/{id}/approve")
    public ApiResponse<TestDemand> approveDemand(@PathVariable Long id) {
        requireDemandApprover();
        return ApiResponse.success("已批准", testDemandService.approveDemand(id));
    }

    @PutMapping("/{id}/reject")
    public ApiResponse<Void> rejectDemand(@PathVariable Long id) {
        requireDemandApprover();
        testDemandService.rejectDemand(id);
        return ApiResponse.success("已退回", null);
    }

    @PutMapping("/{id}/resubmit")
    public ApiResponse<TestDemand> resubmitDemand(
            @PathVariable Long id, HttpServletRequest request) {
        requireDemandEditor();
        return ApiResponse.success("已重新提交",
            testDemandService.resubmitDemand(id, username(request)));
    }

    @PutMapping("/{id}/approve-with-changes")
    public ApiResponse<TestDemand> approveWithChanges(@PathVariable Long id, @RequestBody TestDemand demand) {
        requireDemandApprover();
        return ApiResponse.success("修改并批准成功", testDemandService.approveWithChanges(id, demand));
    }

    @PutMapping("/{id}/priority")
    public ApiResponse<TestDemand> updatePriority(@PathVariable Long id, @RequestBody Map<String, String> body) {
        requireDemandEditor();
        try {
            String priority = body.get("priority");
            return ApiResponse.success("优先级更新成功", testDemandService.updatePriority(id, priority));
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @PutMapping("/batch-approve")
    public ApiResponse<Void> batchApproveDemands(@RequestBody List<Long> ids) {
        requireDemandApprover();
        testDemandService.batchApproveDemands(ids);
        return ApiResponse.success("批量批准成功", null);
    }

    @PutMapping("/batch-reject")
    public ApiResponse<Void> batchRejectDemands(@RequestBody List<Long> ids) {
        requireDemandApprover();
        testDemandService.batchRejectDemands(ids);
        return ApiResponse.success("批量退回成功", null);
    }

    private void requireDemandEditor() {
        roleGuard.requireAny(
            "testManager", "resourceManager", "projectManager", "fieldAdmin", "testLead");
    }

    private void requireDemandApprover() {
        roleGuard.requireAny("projectManager", "fieldAdmin");
    }

    private String username(HttpServletRequest request) {
        return (String) request.getAttribute("username");
    }
}
