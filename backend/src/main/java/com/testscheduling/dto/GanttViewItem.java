package com.testscheduling.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
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
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate scheduleStartDate;  // 排班实际开始日期
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate scheduleEndDate;    // 排班实际结束日期
    private Boolean scheduleExceedsDemand; // 排班是否超出测试周期
    private List<DailySchedule> dailySchedules; // 每日排班详情

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DailySchedule {
        @JsonFormat(pattern = "yyyy-MM-dd")
        private LocalDate date;
        private Integer totalPercentage;  // 当天总排班百分比
        private Integer staffCount;       // 当天排班人数
    }
}
