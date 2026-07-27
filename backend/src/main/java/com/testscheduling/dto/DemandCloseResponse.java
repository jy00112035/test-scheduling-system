package com.testscheduling.dto;

import com.testscheduling.entity.TestDemand;

import java.math.BigDecimal;

public record DemandCloseResponse(
    TestDemand demand,
    int deletedScheduleCount,
    BigDecimal pastScheduledManpower,
    boolean manpowerSatisfied,
    String message
) {}
