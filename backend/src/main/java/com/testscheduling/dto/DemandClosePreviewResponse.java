package com.testscheduling.dto;

import java.math.BigDecimal;

public record DemandClosePreviewResponse(
    int futureScheduleCount,
    BigDecimal pastScheduledManpower,
    BigDecimal demandManpower,
    boolean manpowerSatisfied
) {}
