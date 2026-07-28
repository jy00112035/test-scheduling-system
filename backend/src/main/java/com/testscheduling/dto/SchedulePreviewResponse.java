package com.testscheduling.dto;

import java.math.BigDecimal;
import java.util.List;

public record SchedulePreviewResponse(
        List<DemandPreview> demandPreviews,
        List<GlobalWarning> globalWarnings,
        List<Long> sortOrder,
        BigDecimal totalStaffCapacity,
        BigDecimal totalDemandManpower) {

    public record DemandPreview(
            Long demandId,
            String product,
            String version,
            String priority,
            String endDate,
            BigDecimal totalManpower,
            BigDecimal estimatedAllocation,
            BigDecimal estimatedShortage,
            boolean estimatedFulfilled,
            List<CompetingDemand> competingDemands) { }

    public record CompetingDemand(
            Long demandId,
            String product,
            String priority,
            String testType,
            BigDecimal contestedManpower,
            String reason) { }

    public record GlobalWarning(
            String testType,
            BigDecimal totalRequired,
            BigDecimal totalAvailable,
            BigDecimal shortage,
            List<Long> affectedDemandIds) { }
}
