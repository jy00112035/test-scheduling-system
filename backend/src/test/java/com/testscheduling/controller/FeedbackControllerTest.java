package com.testscheduling.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.testscheduling.config.GlobalExceptionHandler;
import com.testscheduling.dto.FeedbackCreateRequest;
import com.testscheduling.dto.FeedbackResponse;
import com.testscheduling.dto.FeedbackUpdateRequest;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.security.RequestRoleGuard;
import com.testscheduling.service.FeedbackService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class FeedbackControllerTest {

    private FeedbackService feedbackService;
    private RequestRoleGuard roleGuard;
    private MockMvc mockMvc;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        feedbackService = mock(FeedbackService.class);
        roleGuard = mock(RequestRoleGuard.class);
        FeedbackController controller = new FeedbackController();
        ReflectionTestUtils.setField(controller, "feedbackService", feedbackService);
        ReflectionTestUtils.setField(controller, "roleGuard", roleGuard);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
        objectMapper = new ObjectMapper();
    }

    @Test
    void createFeedback_shouldReturnSuccess() throws Exception {
        FeedbackCreateRequest request = new FeedbackCreateRequest();
        request.setType("BUG");
        request.setTitle("Test Bug");
        request.setDescription("Description");

        FeedbackResponse response = new FeedbackResponse();
        response.setId(1L);
        response.setType("BUG");
        response.setTitle("Test Bug");
        response.setDescription("Description");
        response.setStatus("PENDING");
        response.setCreatedAt(LocalDateTime.now());

        when(feedbackService.create(any(), any(), any())).thenReturn(response);

        mockMvc.perform(post("/api/feedback")
                        .requestAttr("username", "tester")
                        .requestAttr("roles", List.of("testManager"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.id").value(1))
                .andExpect(jsonPath("$.data.type").value("BUG"))
                .andExpect(jsonPath("$.message").value("反馈提交成功"));
    }

    @Test
    void createFeedback_shouldRejectBlankTitle() throws Exception {
        FeedbackCreateRequest request = new FeedbackCreateRequest();
        request.setType("BUG");
        request.setTitle("");
        request.setDescription("Description");

        mockMvc.perform(post("/api/feedback")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(400));
    }

    @Test
    void createFeedback_shouldRejectMissingType() throws Exception {
        FeedbackCreateRequest request = new FeedbackCreateRequest();
        request.setTitle("Test Bug");
        request.setDescription("Description");

        mockMvc.perform(post("/api/feedback")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(400));
    }

    @Test
    void getFeedbackList_shouldCallRequireAdmin() throws Exception {
        Page<FeedbackResponse> page = new PageImpl<>(List.of());
        when(feedbackService.findFiltered(any())).thenReturn(page);

        // Standalone MockMvc lacks Spring Data PageJacksonModule, so response
        // serialization may fail, but the admin guard must still be invoked.
        mockMvc.perform(get("/api/feedback"));

        verify(roleGuard, times(1)).requireAny("admin");
    }

    @Test
    void updateFeedbackStatus_shouldCallRequireAdmin() throws Exception {
        FeedbackResponse response = new FeedbackResponse();
        response.setId(1L);
        response.setStatus("RESOLVED");
        when(feedbackService.updateStatus(any(), any())).thenReturn(response);

        FeedbackUpdateRequest request = new FeedbackUpdateRequest();
        request.setStatus("RESOLVED");

        mockMvc.perform(put("/api/feedback/{id}/status", 1L)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));

        verify(roleGuard, times(1)).requireAny("admin");
    }

    @Test
    void exportFeedback_shouldCallRequireAdmin() throws Exception {
        when(feedbackService.findAllForExport(any())).thenReturn(List.of());

        mockMvc.perform(get("/api/feedback/export/excel"))
                .andExpect(status().isOk());

        verify(roleGuard, times(1)).requireAny("admin");
    }

    @Test
    void getFeedbackList_shouldHandleBusinessException() throws Exception {
        when(feedbackService.findFiltered(any())).thenThrow(
                new BusinessException("FORBIDDEN", "无权限执行此操作"));

        mockMvc.perform(get("/api/feedback"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value(403))
                .andExpect(jsonPath("$.data.errorCode").value("FORBIDDEN"));
    }

    @Test
    void updateFeedbackStatus_shouldHandleNotFound() throws Exception {
        when(feedbackService.updateStatus(any(), any())).thenThrow(
                new BusinessException("NOT_FOUND", "反馈不存在"));

        FeedbackUpdateRequest request = new FeedbackUpdateRequest();
        request.setStatus("RESOLVED");

        mockMvc.perform(put("/api/feedback/{id}/status", 99L)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(400))
                .andExpect(jsonPath("$.data.errorCode").value("NOT_FOUND"));
    }
}
