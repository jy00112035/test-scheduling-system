package com.testscheduling.dto;

import java.time.LocalDate;

public record ScheduleValidationRequest(
    Long demandId,
    Long staffId,
    LocalDate date,
    Integer percentage,
    Long demandManpowerDetailId,
    Long demandSpecialModuleId
) {
}
