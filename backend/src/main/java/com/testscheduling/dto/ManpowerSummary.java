package com.testscheduling.dto;

import java.math.BigDecimal;

public record ManpowerSummary(
    String testType,
    BigDecimal totalManpower,
    BigDecimal specialManpower,
    BigDecimal generalManpower
) {
}
