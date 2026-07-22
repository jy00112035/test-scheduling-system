package com.testscheduling.dto;

public record ScheduleClassificationRequest(
    Long demandManpowerDetailId,
    Long demandSpecialModuleId
) {
}
