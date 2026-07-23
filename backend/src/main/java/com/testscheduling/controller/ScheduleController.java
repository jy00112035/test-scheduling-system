package com.testscheduling.controller;

import com.testscheduling.dto.ApiResponse;
import com.testscheduling.dto.BatchPublishRequest;
import com.testscheduling.dto.BatchPublishResponse;
import com.testscheduling.dto.GanttViewItem;
import com.testscheduling.dto.ScheduleClassificationRequest;
import com.testscheduling.dto.ScheduleDeleteScope;
import com.testscheduling.dto.ScheduleMoveRequest;
import com.testscheduling.dto.ScheduleRecommendationRequest;
import com.testscheduling.dto.ScheduleRecommendationResponse;
import com.testscheduling.dto.ScheduleValidationRequest;
import com.testscheduling.dto.ScheduleValidationResponse;
import com.testscheduling.entity.Schedule;
import com.testscheduling.security.RequestRoleGuard;
import com.testscheduling.service.ScheduleService;
import com.testscheduling.service.SchedulePublishService;
import com.testscheduling.service.ScheduleRecommendationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/schedules")
public class ScheduleController {

    @Autowired
    private ScheduleService scheduleService;

    @Autowired
    private ScheduleRecommendationService recommendationService;

    @Autowired
    private SchedulePublishService publishService;

    @Autowired
    private RequestRoleGuard roleGuard;

    @PostMapping("/recommend/draft")
    public ApiResponse<ScheduleRecommendationResponse> recommendDraft(
            @RequestBody ScheduleRecommendationRequest request) {
        roleGuard.requireAny("resourceManager", "projectManager", "fieldAdmin");
        return ApiResponse.success("推荐草稿已生成", recommendationService.recommend(request));
    }

    @GetMapping
    public ApiResponse<List<Schedule>> getAllSchedules() {
        return ApiResponse.success(scheduleService.findAll());
    }

    @GetMapping("/{id}")
    public ApiResponse<Schedule> getScheduleById(@PathVariable Long id) {
        return ApiResponse.success(scheduleService.findById(id));
    }

    @GetMapping("/date/{date}")
    public ApiResponse<List<Schedule>> getSchedulesByDate(
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ApiResponse.success(scheduleService.findByDate(date));
    }

    @GetMapping("/range")
    public ApiResponse<List<Schedule>> getSchedulesByDateRange(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return ApiResponse.success(scheduleService.findByDateRange(startDate, endDate));
    }

    @GetMapping("/staff/{staffId}")
    public ApiResponse<List<Schedule>> getSchedulesByStaffId(@PathVariable Long staffId) {
        return ApiResponse.success(scheduleService.findByStaffId(staffId));
    }

    @PostMapping
    public ApiResponse<Schedule> createSchedule(@RequestBody Schedule schedule) {
        requireSchedulingRole();
        return ApiResponse.success("创建成功", scheduleService.create(schedule));
    }

    @PostMapping("/batch")
    public ApiResponse<List<Schedule>> createSchedulesBatch(@RequestBody List<Schedule> schedules) {
        requireSchedulingRole();
        return ApiResponse.success("批量创建成功", scheduleService.createBatch(schedules));
    }

    @PutMapping("/{id}")
    public ApiResponse<Schedule> updateSchedule(@PathVariable Long id, @RequestBody Schedule schedule) {
        requireSchedulingRole();
        return ApiResponse.success("更新成功", scheduleService.update(id, schedule));
    }

    @PostMapping("/validate")
    public ApiResponse<ScheduleValidationResponse> validateSchedule(
            @RequestBody ScheduleValidationRequest request) {
        requireSchedulingRole();
        scheduleService.validateOnly(toSchedule(request));
        return ApiResponse.success(new ScheduleValidationResponse(true));
    }

    @PostMapping("/{id}/move")
    public ApiResponse<Schedule> moveSchedule(
            @PathVariable Long id, @RequestBody ScheduleMoveRequest request) {
        requireSchedulingRole();
        return ApiResponse.success("转移成功", scheduleService.move(
            id, request.staffId(), request.date(), request.percentage()));
    }

    @PostMapping("/{id}/classify")
    public ApiResponse<Schedule> classifySchedule(
            @PathVariable Long id, @RequestBody ScheduleClassificationRequest request) {
        requireSchedulingRole();
        return ApiResponse.success("归类成功", scheduleService.classifyHistorical(
            id, request.demandManpowerDetailId(), request.demandSpecialModuleId()));
    }

    @DeleteMapping("/demand/{demandId}")
    public ApiResponse<Void> deleteSchedulesByDemand(
            @PathVariable Long demandId,
            @RequestParam(defaultValue = "draft_only") String scope) {
        requireSchedulingRole();
        ScheduleDeleteScope deleteScope = ScheduleDeleteScope.fromApiValue(scope);
        if (deleteScope == ScheduleDeleteScope.ALL) {
            roleGuard.requireAny("resourceManager", "fieldAdmin");
        }
        scheduleService.deleteByDemandId(demandId, deleteScope);
        return ApiResponse.success("清除成功", null);
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> deleteSchedule(@PathVariable Long id) {
        requireSchedulingRole();
        scheduleService.delete(id);
        return ApiResponse.success("删除成功", null);
    }

    @GetMapping("/published")
    public ApiResponse<List<Schedule>> getPublishedSchedules() {
        return ApiResponse.success(scheduleService.findPublished());
    }

    @PutMapping("/publish/{demandId}")
    public ApiResponse<Void> publishSchedules(@PathVariable Long demandId) {
        requireSchedulingRole();
        publishService.publishOne(demandId);
        return ApiResponse.success("发布成功", null);
    }

    @PostMapping("/batch-publish")
    public ApiResponse<BatchPublishResponse> publishSchedulesBatch(
            @RequestBody BatchPublishRequest request) {
        requireSchedulingRole();
        return ApiResponse.success("批量发布完成", publishService.publishBatch(request));
    }

    @PutMapping("/unpublish/{demandId}")
    public ApiResponse<Void> unpublishSchedules(@PathVariable Long demandId) {
        requireSchedulingRole();
        scheduleService.unpublishByDemandId(demandId);
        return ApiResponse.success("取消发布成功", null);
    }

    @GetMapping("/gantt-view")
    public ApiResponse<List<GanttViewItem>> getGanttView() {
        return ApiResponse.success(scheduleService.getGanttView());
    }

    private void requireSchedulingRole() {
        roleGuard.requireAny("resourceManager", "projectManager", "fieldAdmin");
    }

    private Schedule toSchedule(ScheduleValidationRequest request) {
        Schedule schedule = new Schedule();
        schedule.setDemandId(request.demandId());
        schedule.setStaffId(request.staffId());
        schedule.setDate(request.date());
        schedule.setPercentage(request.percentage());
        schedule.setDemandManpowerDetailId(request.demandManpowerDetailId());
        schedule.setDemandSpecialModuleId(request.demandSpecialModuleId());
        return schedule;
    }
}
