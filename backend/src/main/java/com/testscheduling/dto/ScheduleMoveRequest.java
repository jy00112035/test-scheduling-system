package com.testscheduling.dto;

import java.time.LocalDate;

public record ScheduleMoveRequest(
    Long staffId,
    LocalDate date,
    Integer percentage
) {
}
