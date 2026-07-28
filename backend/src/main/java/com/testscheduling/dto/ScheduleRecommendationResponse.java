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
            boolean requiresHistoricalClassification,
            List<Gap> specialModuleGaps,
            List<Gap> generalGaps,
            List<DemandFulfillmentResponse.SpecialModuleSummary> specialModules,
            List<DemandFulfillmentResponse.Summary> summary,
            BigDecimal totalRequired,
            BigDecimal totalAllocated,
            BigDecimal totalShortage,
            int processOrder,
            int totalDemands,
            String priority,
            List<ContestedResource> contestedResources) {
        public Fulfillment(Long demandId, boolean fullySatisfied,
                List<Gap> specialModuleGaps, List<Gap> generalGaps) {
            this(demandId, fullySatisfied, false, specialModuleGaps, generalGaps,
                List.of(), List.of(), BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                0, 0, null, List.of());
        }

        public Fulfillment(Long demandId, boolean fullySatisfied,
                boolean requiresHistoricalClassification,
                List<Gap> specialModuleGaps, List<Gap> generalGaps) {
            this(demandId, fullySatisfied, requiresHistoricalClassification,
                specialModuleGaps, generalGaps, List.of(), List.of(),
                BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                0, 0, null, List.of());
        }

        public Fulfillment(Long demandId, List<Gap> specialModuleGaps, List<Gap> generalGaps) {
            this(demandId, specialModuleGaps.isEmpty() && generalGaps.isEmpty(), false,
                specialModuleGaps, generalGaps, List.of(), List.of(),
                BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                0, 0, null, List.of());
        }
    }

    public record ContestedResource(
            Long contestedByDemandId,
            String contestedByProduct,
            String contestedByPriority,
            int contestedByOrder,
            String testType,
            BigDecimal contestedManpower) { }

    public record Gap(
            Long demandManpowerDetailId,
            Long demandSpecialModuleId,
            BigDecimal shortage,
            String reasonCode,
            String reason) { }
}
