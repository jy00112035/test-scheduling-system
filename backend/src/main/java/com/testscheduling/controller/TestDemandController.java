package com.testscheduling.controller;

import com.testscheduling.dto.ApiResponse;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.service.TestDemandService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/demands")
public class TestDemandController {

    @Autowired
    private TestDemandService testDemandService;

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
    public ApiResponse<TestDemand> createDemand(@RequestBody TestDemand demand) {
        return ApiResponse.success("创建成功", testDemandService.create(demand));
    }

    @PutMapping("/{id}")
    public ApiResponse<TestDemand> updateDemand(@PathVariable Long id, @RequestBody TestDemand demand) {
        try {
            return ApiResponse.success("更新成功", testDemandService.update(id, demand));
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> deleteDemand(@PathVariable Long id) {
        try {
            testDemandService.delete(id);
            return ApiResponse.success("删除成功", null);
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @PostMapping("/{id}/close")
    public ApiResponse<TestDemand> closeDemand(@PathVariable Long id) {
        try {
            return ApiResponse.success("关闭成功", testDemandService.close(id));
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @GetMapping("/pending-approval")
    public ApiResponse<List<TestDemand>> getPendingApprovalDemands() {
        return ApiResponse.success(testDemandService.findPendingApproval());
    }

    @PutMapping("/{id}/approve")
    public ApiResponse<TestDemand> approveDemand(@PathVariable Long id) {
        try {
            return ApiResponse.success("已批准", testDemandService.approveDemand(id));
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @PutMapping("/{id}/reject")
    public ApiResponse<Void> rejectDemand(@PathVariable Long id) {
        try {
            testDemandService.rejectDemand(id);
            return ApiResponse.success("已退回", null);
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @PutMapping("/batch-approve")
    public ApiResponse<Void> batchApproveDemands(@RequestBody List<Long> ids) {
        try {
            testDemandService.batchApproveDemands(ids);
            return ApiResponse.success("批量批准成功", null);
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @PutMapping("/batch-reject")
    public ApiResponse<Void> batchRejectDemands(@RequestBody List<Long> ids) {
        try {
            testDemandService.batchRejectDemands(ids);
            return ApiResponse.success("批量退回成功", null);
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }
}
