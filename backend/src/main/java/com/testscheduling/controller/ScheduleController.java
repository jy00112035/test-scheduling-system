package com.testscheduling.controller;

import com.testscheduling.dto.ApiResponse;
import com.testscheduling.entity.Schedule;
import com.testscheduling.service.ScheduleService;
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

    @GetMapping
    public ApiResponse<List<Schedule>> getAllSchedules() {
        return ApiResponse.success(scheduleService.findAll());
    }

    @GetMapping("/{id}")
    public ApiResponse<Schedule> getScheduleById(@PathVariable Long id) {
        try {
            return ApiResponse.success(scheduleService.findById(id));
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
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
        return ApiResponse.success("创建成功", scheduleService.create(schedule));
    }

    @PostMapping("/batch")
    public ApiResponse<List<Schedule>> createSchedulesBatch(@RequestBody List<Schedule> schedules) {
        return ApiResponse.success("批量创建成功", scheduleService.createBatch(schedules));
    }

    @PutMapping("/{id}")
    public ApiResponse<Schedule> updateSchedule(@PathVariable Long id, @RequestBody Schedule schedule) {
        try {
            return ApiResponse.success("更新成功", scheduleService.update(id, schedule));
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @DeleteMapping("/demand/{demandId}")
    public ApiResponse<Void> deleteSchedulesByDemand(@PathVariable Long demandId) {
        try {
            scheduleService.deleteByDemandId(demandId);
            return ApiResponse.success("清除成功", null);
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> deleteSchedule(@PathVariable Long id) {
        try {
            scheduleService.delete(id);
            return ApiResponse.success("删除成功", null);
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @GetMapping("/published")
    public ApiResponse<List<Schedule>> getPublishedSchedules() {
        return ApiResponse.success(scheduleService.findPublished());
    }

    @PutMapping("/publish/{demandId}")
    public ApiResponse<Void> publishSchedules(@PathVariable Long demandId) {
        try {
            scheduleService.publishByDemandId(demandId);
            return ApiResponse.success("发布成功", null);
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @PutMapping("/unpublish/{demandId}")
    public ApiResponse<Void> unpublishSchedules(@PathVariable Long demandId) {
        try {
            scheduleService.unpublishByDemandId(demandId);
            return ApiResponse.success("取消发布成功", null);
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }
}
