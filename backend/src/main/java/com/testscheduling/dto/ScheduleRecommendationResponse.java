package com.testscheduling.dto;

import com.testscheduling.entity.Schedule;

import java.math.BigDecimal;
import java.util.List;

public record ScheduleRecommendationResponse(
        List<Schedule> generatedSchedules,
        List<Fulfillment> fulfillment) {
    public record Fulfillment(
            Long demandId,
            boolean fullySatisfied,
            List<Gap> specialModuleGaps,
            List<Gap> generalGaps) {
        public Fulfillment(Long demandId, List<Gap> specialModuleGaps, List<Gap> generalGaps) {
            this(demandId, specialModuleGaps.isEmpty() && generalGaps.isEmpty(),
                    specialModuleGaps, generalGaps);
        }
    }

    public record Gap(
            Long demandManpowerDetailId,
            Long demandSpecialModuleId,
            BigDecimal shortage,
            String reasonCode,
            String reason) { }
}
