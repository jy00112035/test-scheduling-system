package com.testscheduling.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class GanttViewItem {
    private Long demandId;
    private String product;
    private String version;
    private String versionType;
    private String versionPhase;
    private LocalDateTime startDate;
    private LocalDateTime endDate;
    private String status;
    private BigDecimal manpowerDemand;
    private Double allocatedDays;
    private Double remainingDays;
    private Long daysToEnd;
    private String priority;
    private Boolean confidential;
    private Integer riskScore;
    private List<String> riskFactors;
    private Double progressPercentage;
}
