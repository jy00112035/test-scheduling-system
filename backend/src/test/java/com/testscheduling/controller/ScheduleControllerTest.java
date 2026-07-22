package com.testscheduling.controller;

import com.testscheduling.config.GlobalExceptionHandler;
import com.testscheduling.dto.ScheduleDeleteScope;
import com.testscheduling.dto.BatchPublishResponse;
import com.testscheduling.dto.ScheduleRecommendationResponse;
import com.testscheduling.entity.Schedule;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.security.RequestRoleGuard;
import com.testscheduling.service.ScheduleService;
import com.testscheduling.service.SchedulePublishService;
import com.testscheduling.service.SchedulePublishTransactionService;
import com.testscheduling.service.ScheduleRecommendationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.LocalDate;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.LongStream;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ScheduleControllerTest {

    private ScheduleService service;
    private ScheduleRecommendationService recommendationService;
    private SchedulePublishService publishService;
    private ScheduleController controller;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        service = mock(ScheduleService.class);
        recommendationService = mock(ScheduleRecommendationService.class);
        publishService = mock(SchedulePublishService.class);
        controller = new ScheduleController();
        ReflectionTestUtils.setField(controller, "scheduleService", service);
        ReflectionTestUtils.setField(controller, "recommendationService", recommendationService);
        ReflectionTestUtils.setField(controller, "publishService", publishService);
        ReflectionTestUtils.setField(controller, "roleGuard", new RequestRoleGuard());
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
            .setControllerAdvice(new GlobalExceptionHandler())
            .build();
    }

    @Test
    void validateAllowsSchedulingRoleAndDoesNotPersist() throws Exception {
        mockMvc.perform(authorized(post("/api/schedules/validate")
                .contentType(MediaType.APPLICATION_JSON)
                .content(scheduleJson()), "projectManager"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(200))
            .andExpect(jsonPath("$.data.valid").value(true));

        verify(service).validateOnly(any(Schedule.class));
    }

    @Test
    void validateRejectsOrdinaryExecutorWithStableErrorShape() throws Exception {
        mockMvc.perform(authorized(post("/api/schedules/validate")
                .contentType(MediaType.APPLICATION_JSON)
                .content(scheduleJson()), "testExecutor"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value(400))
            .andExpect(jsonPath("$.data.errorCode").value("FORBIDDEN"));
    }

    @Test
    void createRejectsMissingSchedulingRole() throws Exception {
        mockMvc.perform(post("/api/schedules")
                .contentType(MediaType.APPLICATION_JSON)
                .content(scheduleJson()))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.data.errorCode").value("FORBIDDEN"));
    }

    @Test
    void updateRejectsMalformedRoleAttribute() throws Exception {
        mockMvc.perform(authorized(put("/api/schedules/{id}", 9L), "projectManager")
                .requestAttr("username", "tester")
                .requestAttr("roles", "projectManager")
                .contentType(MediaType.APPLICATION_JSON)
                .content(scheduleJson()))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.data.errorCode").value("FORBIDDEN"));
    }

    @Test
    void publishRejectsMissingSchedulingRole() throws Exception {
        mockMvc.perform(put("/api/schedules/publish/{demandId}", 10L))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.data.errorCode").value("FORBIDDEN"));
    }

    @Test
    void unpublishRejectsMissingSchedulingRole() throws Exception {
        mockMvc.perform(put("/api/schedules/unpublish/{demandId}", 10L))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.data.errorCode").value("FORBIDDEN"));
    }

    @Test
    void publishPropagatesStableBusinessErrorShape() throws Exception {
        doThrow(new BusinessException("DEMAND_NOT_FOUND", "测试需求不存在"))
            .when(publishService).publishOne(10L);

        mockMvc.perform(authorized(put("/api/schedules/publish/{demandId}", 10L),
                "projectManager"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.data.errorCode").value("DEMAND_NOT_FOUND"));
    }

    @Test
    void batchPublishRequiresSchedulingRole() throws Exception {
        mockMvc.perform(post("/api/schedules/batch-publish")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"demandIds\":[10]}") )
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.data.errorCode").value("FORBIDDEN"));
    }

    @Test
    void batchPublishReturnsDetailedPartialResult() throws Exception {
        when(publishService.publishBatch(any())).thenReturn(new BatchPublishResponse(
            List.of(new BatchPublishResponse.Success(10L, 2)),
            List.of(new BatchPublishResponse.Failure(11L,
                "GENERAL_MANPOWER_UNFULFILLED", "通用人力仍缺少 0.5 人天"))));

        mockMvc.perform(authorized(post("/api/schedules/batch-publish")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"demandIds\":[10,11]}") , "projectManager"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.success.length()").value(1))
            .andExpect(jsonPath("$.data.failed.length()").value(1))
            .andExpect(jsonPath("$.data.failed[0].reasonCode")
                .value("GENERAL_MANPOWER_UNFULFILLED"));
    }

    @Test
    void batchPublishMapsNullAndEmptyInputsToStableCodes() throws Exception {
        useRealPublishValidationService();
        assertBatchError("{}", "BATCH_PUBLISH_IDS_REQUIRED");
        assertBatchError("{\"demandIds\":null}", "BATCH_PUBLISH_IDS_REQUIRED");
        assertBatchError("{\"demandIds\":[]}", "BATCH_PUBLISH_IDS_REQUIRED");
        assertBatchError("{\"demandIds\":[1,null]}", "BATCH_PUBLISH_ID_INVALID");
    }

    @Test
    void batchPublishMapsDistinctOversizedInputToStableCode() throws Exception {
        useRealPublishValidationService();
        String ids = LongStream.rangeClosed(1, 501).mapToObj(Long::toString)
            .collect(Collectors.joining(","));
        assertBatchError("{\"demandIds\":[" + ids + "]}", "BATCH_PUBLISH_TOO_LARGE");
    }

    @Test
    void batchPublishMapsMalformedAndMissingBodiesToStableCode() throws Exception {
        assertBatchError("{", "BATCH_PUBLISH_REQUEST_INVALID");
        mockMvc.perform(authorized(post("/api/schedules/batch-publish"), "projectManager"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.data.errorCode").value("BATCH_PUBLISH_REQUEST_INVALID"));
    }

    private void useRealPublishValidationService() {
        ReflectionTestUtils.setField(controller, "publishService",
            new SchedulePublishService(mock(SchedulePublishTransactionService.class),
                mock(com.testscheduling.service.AuditLogService.class)));
    }

    private void assertBatchError(String body, String code) throws Exception {
        mockMvc.perform(authorized(post("/api/schedules/batch-publish")
                .contentType(MediaType.APPLICATION_JSON).content(body), "projectManager"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.data.errorCode").value(code));
    }

    @Test
    void deletePropagatesStableBusinessErrorShape() throws Exception {
        doThrow(new BusinessException("PUBLISHED_SCHEDULE_PROTECTED", "已发布排班受保护"))
            .when(service).delete(9L);

        mockMvc.perform(authorized(delete("/api/schedules/{id}", 9L), "fieldAdmin"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.data.errorCode").value("PUBLISHED_SCHEDULE_PROTECTED"));
    }

    @Test
    void validateReturnsStableErrorForMissingDemandId() throws Exception {
        doThrow(new BusinessException("DEMAND_REQUIRED", "需求ID不能为空"))
            .when(service).validateOnly(any(Schedule.class));

        mockMvc.perform(authorized(post("/api/schedules/validate")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"staffId":108,"date":"2026-07-22","percentage":50,
                     "demandManpowerDetailId":301}
                    """), "projectManager"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value(400))
            .andExpect(jsonPath("$.data.errorCode").value("DEMAND_REQUIRED"));
    }

    @Test
    void validateReturnsStableErrorForMissingDetailId() throws Exception {
        doThrow(new BusinessException("SCHEDULE_DETAIL_REQUIRED", "排班必须归属人力明细"))
            .when(service).validateOnly(any(Schedule.class));

        mockMvc.perform(authorized(post("/api/schedules/validate")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"demandId":1001,"staffId":108,"date":"2026-07-22","percentage":50}
                    """), "projectManager"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value(400))
            .andExpect(jsonPath("$.data.errorCode").value("SCHEDULE_DETAIL_REQUIRED"));
    }

    @Test
    void moveUsesFocusedFields() throws Exception {
        Schedule moved = schedule();
        moved.setId(9L);
        when(service.move(9L, 108L, LocalDate.of(2026, 7, 23), 40)).thenReturn(moved);

        mockMvc.perform(authorized(post("/api/schedules/{id}/move", 9L)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"staffId":108,"date":"2026-07-23","percentage":40,
                     "demandId":999,"product":"should-not-bind"}
                    """), "resourceManager"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(200));

        verify(service).move(9L, 108L, LocalDate.of(2026, 7, 23), 40);
    }

    @Test
    void classifyUsesOnlyAttributionIds() throws Exception {
        Schedule classified = schedule();
        classified.setId(9L);
        when(service.classifyHistorical(9L, 301L, 501L)).thenReturn(classified);

        mockMvc.perform(authorized(post("/api/schedules/{id}/classify", 9L)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"demandManpowerDetailId":301,"demandSpecialModuleId":501,
                     "staffId":999,"percentage":100}
                    """), "fieldAdmin"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(200));

        verify(service).classifyHistorical(9L, 301L, 501L);
    }

    @Test
    void draftClearIsDefaultAndAllowsProjectManager() throws Exception {
        mockMvc.perform(authorized(delete("/api/schedules/demand/{demandId}", 10L),
                "projectManager"))
            .andExpect(status().isOk());

        verify(service).deleteByDemandId(10L, ScheduleDeleteScope.DRAFT_ONLY);
    }

    @Test
    void allClearRejectsProjectManager() throws Exception {
        mockMvc.perform(authorized(delete("/api/schedules/demand/{demandId}", 10L)
                .queryParam("scope", "all"), "projectManager"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.data.errorCode").value("FORBIDDEN"));
    }

    @Test
    void allClearAllowsResourceManager() throws Exception {
        mockMvc.perform(authorized(delete("/api/schedules/demand/{demandId}", 10L)
                .queryParam("scope", "all"), "resourceManager"))
            .andExpect(status().isOk());

        verify(service).deleteByDemandId(10L, ScheduleDeleteScope.ALL);
    }

    @Test
    void invalidClearScopeReturnsStableBusinessError() throws Exception {
        mockMvc.perform(authorized(delete("/api/schedules/demand/{demandId}", 10L)
                .queryParam("scope", "published_only"), "resourceManager"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.data.errorCode").value("SCHEDULE_DELETE_SCOPE_INVALID"));
    }

    @Test
    void updatePropagatesEligibilityBusinessErrorShape() throws Exception {
        when(service.update(eq(9L), any(Schedule.class))).thenThrow(
            new BusinessException("STAFF_CAPACITY_EXCEEDED", "人员当日容量不足"));

        mockMvc.perform(authorized(put("/api/schedules/{id}", 9L), "projectManager")
                .contentType(MediaType.APPLICATION_JSON)
                .content(scheduleJson()))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value(400))
            .andExpect(jsonPath("$.data.errorCode").value("STAFF_CAPACITY_EXCEEDED"));
    }

    @Test
    void batchCreateDelegatesEverySubmittedRow() throws Exception {
        when(service.createBatch(any())).thenReturn(List.of(schedule(), schedule()));

        mockMvc.perform(authorized(post("/api/schedules/batch"), "projectManager")
                .contentType(MediaType.APPLICATION_JSON)
                .content("[" + scheduleJson() + "," + scheduleJson() + "]"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.length()").value(2));

        verify(service).createBatch(any());
    }

    @Test
    void recommendationEndpointAllowsSchedulingRoles() throws Exception {
        when(recommendationService.recommend(any())).thenReturn(
                new ScheduleRecommendationResponse(List.of(), List.of()));

        mockMvc.perform(authorized(post("/api/schedules/recommend/draft"), "projectManager")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"mode\":\"FULL_DEMAND\",\"demandIds\":[10]}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(200));

        verify(recommendationService).recommend(any());
    }

    @Test
    void recommendationEndpointRejectsOrdinaryExecutor() throws Exception {
        mockMvc.perform(authorized(post("/api/schedules/recommend/draft"), "testExecutor")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"mode\":\"FULL_DEMAND\",\"demandIds\":[10]}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.data.errorCode").value("FORBIDDEN"));
    }

    @Test
    void recommendationEndpointReturnsStableDataChangedErrorShape() throws Exception {
        doThrow(new BusinessException("DATA_CHANGED_RETRY", "排班数据已变化，请刷新后重试"))
            .when(recommendationService).recommend(any());

        mockMvc.perform(authorized(post("/api/schedules/recommend/draft"), "resourceManager")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"mode\":\"FULL_DEMAND\",\"demandIds\":[10]}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value(400))
            .andExpect(jsonPath("$.data.errorCode").value("DATA_CHANGED_RETRY"));
    }

    @Test
    void publishedSingleDeleteErrorUsesGlobalErrorShape() throws Exception {
        org.mockito.Mockito.doThrow(new BusinessException(
                "PUBLISHED_SCHEDULE_PROTECTED", "已发布排班受保护"))
            .when(service).delete(9L);

        mockMvc.perform(authorized(delete("/api/schedules/{id}", 9L), "fieldAdmin"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.data.errorCode").value("PUBLISHED_SCHEDULE_PROTECTED"));
    }

    private MockHttpServletRequestBuilder authorized(
            MockHttpServletRequestBuilder request, String role) {
        return request
            .requestAttr("username", "tester")
            .requestAttr("roles", List.of(role));
    }

    private String scheduleJson() {
        return """
            {"demandId":1001,"staffId":108,"date":"2026-07-22",
             "percentage":50,"demandManpowerDetailId":301,
             "demandSpecialModuleId":501}
            """;
    }

    private Schedule schedule() {
        Schedule schedule = new Schedule();
        schedule.setDemandId(1001L);
        schedule.setStaffId(108L);
        schedule.setDate(LocalDate.of(2026, 7, 22));
        schedule.setPercentage(50);
        schedule.setDemandManpowerDetailId(301L);
        schedule.setDemandSpecialModuleId(501L);
        return schedule;
    }
}
