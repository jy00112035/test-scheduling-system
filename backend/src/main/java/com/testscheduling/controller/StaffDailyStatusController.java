package com.testscheduling.controller;

import com.testscheduling.dto.ApiResponse;
import com.testscheduling.entity.StaffDailyStatus.DailyAvailabilityStatus;
import com.testscheduling.service.StaffDailyStatusService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Map;

@RestController
@RequestMapping("/api/daily-statuses")
public class StaffDailyStatusController {

    @Autowired
    private StaffDailyStatusService service;

    @GetMapping
    public ApiResponse<java.util.List<com.testscheduling.entity.StaffDailyStatus>> getStatuses(
            @RequestParam String startDate,
            @RequestParam String endDate) {
        return ApiResponse.success(
            service.getStatusesByDateRange(LocalDate.parse(startDate), LocalDate.parse(endDate))
        );
    }

    @PutMapping
    public ApiResponse<Void> setStatus(@RequestBody Map<String, Object> body) {
        Long staffId = Long.valueOf(body.get("staffId").toString());
        LocalDate date = LocalDate.parse(body.get("date").toString());
        DailyAvailabilityStatus status = DailyAvailabilityStatus.valueOf(body.get("status").toString());
        Double percentage = body.containsKey("percentage") && body.get("percentage") != null
                ? Double.valueOf(body.get("percentage").toString())
                : 100.0;
        service.setStatus(staffId, date, status, percentage);
        return ApiResponse.success("设置成功", null);
    }
}
