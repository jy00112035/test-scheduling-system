package com.testscheduling.controller;

import com.testscheduling.dto.*;
import com.testscheduling.security.RequestRoleGuard;
import com.testscheduling.service.FeedbackService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/feedback")
public class FeedbackController {

    @Autowired
    private FeedbackService feedbackService;

    @Autowired
    private RequestRoleGuard roleGuard;

    @PostMapping
    public ApiResponse<FeedbackResponse> createFeedback(
            @Valid @RequestBody FeedbackCreateRequest request,
            HttpServletRequest httpRequest) {
        String username = username(httpRequest);
        List<String> roles = roles(httpRequest);
        return ApiResponse.success("反馈提交成功", feedbackService.create(username, roles, request));
    }

    @GetMapping
    public ApiResponse<Page<FeedbackResponse>> getFeedbackList(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String submitterId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        requireAdmin();
        FeedbackQueryParams params = new FeedbackQueryParams();
        params.setType(type);
        params.setStatus(status);
        params.setSubmitterId(submitterId);
        params.setPage(page);
        params.setSize(size);
        return ApiResponse.success(feedbackService.findFiltered(params));
    }

    @GetMapping("/mine")
    public ApiResponse<Page<FeedbackResponse>> getMyFeedback(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            HttpServletRequest httpRequest) {
        String username = username(httpRequest);
        return ApiResponse.success(feedbackService.findBySubmitter(username, page, size));
    }

    @PutMapping("/{id}/status")
    public ApiResponse<FeedbackResponse> updateFeedbackStatus(
            @PathVariable Long id,
            @Valid @RequestBody FeedbackUpdateRequest request) {
        requireAdmin();
        return ApiResponse.success("状态更新成功", feedbackService.updateStatus(id, request));
    }

    @GetMapping("/export/excel")
    public ApiResponse<List<FeedbackResponse>> exportFeedback(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String submitterId) {
        requireAdmin();
        FeedbackQueryParams params = new FeedbackQueryParams();
        params.setType(type);
        params.setStatus(status);
        params.setSubmitterId(submitterId);
        return ApiResponse.success(feedbackService.findAllForExport(params));
    }

    private void requireAdmin() {
        roleGuard.requireAny("admin");
    }

    private String username(HttpServletRequest request) {
        return (String) request.getAttribute("username");
    }

    @SuppressWarnings("unchecked")
    private List<String> roles(HttpServletRequest request) {
        return (List<String>) request.getAttribute("roles");
    }
}
