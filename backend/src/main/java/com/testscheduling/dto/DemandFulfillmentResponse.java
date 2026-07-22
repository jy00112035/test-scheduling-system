package com.testscheduling.dto;

import java.math.BigDecimal;
import java.util.List;

public record DemandFulfillmentResponse(
    Long demandId,
    boolean fullySatisfied,
    boolean requiresHistoricalClassification,
    List<Gap> specialModuleGaps,
    List<Gap> generalGaps,
    List<Summary> summary,
    BigDecimal totalRequired,
    BigDecimal totalAllocated,
    BigDecimal totalShortage
) {
    public record Gap(
        Long demandManpowerDetailId,
        Long demandSpecialModuleId,
        Long moduleId,
        String moduleName,
        String testType,
        BigDecimal required,
        BigDecimal allocated,
        BigDecimal shortage
    ) {
    }

    public record Summary(
        Long demandManpowerDetailId,
        String testType,
        BigDecimal required,
        BigDecimal specialRequired,
        BigDecimal generalRequired,
        BigDecimal specialAllocated,
        BigDecimal generalAllocated,
        BigDecimal shortage
    ) {
    }
}
