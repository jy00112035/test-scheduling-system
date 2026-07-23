package com.testscheduling.dto;

import java.time.LocalDate;
import java.util.List;

public class ScheduleRecommendationRequest {
    public enum Mode { FIXED_RANGE, FULL_DEMAND }

    private Mode mode;
    private List<Long> demandIds;
    private DateRange dateRange;
    private List<Long> fixedStaffIds;
    private List<Long> excludedStaffIds;
    private Boolean includeSaturdays = true;
    private Boolean includeSundays = true;
    private Boolean replaceExistingDrafts = false;

    public Mode getMode() { return mode; }
    public void setMode(Mode mode) { this.mode = mode; }
    public List<Long> getDemandIds() { return demandIds; }
    public void setDemandIds(List<Long> demandIds) { this.demandIds = demandIds; }
    public DateRange getDateRange() { return dateRange; }
    public void setDateRange(DateRange dateRange) { this.dateRange = dateRange; }
    public List<Long> getFixedStaffIds() { return fixedStaffIds; }
    public void setFixedStaffIds(List<Long> fixedStaffIds) { this.fixedStaffIds = fixedStaffIds; }
    public List<Long> getExcludedStaffIds() { return excludedStaffIds; }
    public void setExcludedStaffIds(List<Long> excludedStaffIds) { this.excludedStaffIds = excludedStaffIds; }
    public Boolean getIncludeSaturdays() { return includeSaturdays; }
    public void setIncludeSaturdays(Boolean includeSaturdays) { this.includeSaturdays = includeSaturdays; }
    public Boolean getIncludeSundays() { return includeSundays; }
    public void setIncludeSundays(Boolean includeSundays) { this.includeSundays = includeSundays; }
    public Boolean getReplaceExistingDrafts() { return replaceExistingDrafts; }
    public void setReplaceExistingDrafts(Boolean replaceExistingDrafts) { this.replaceExistingDrafts = replaceExistingDrafts; }

    public record DateRange(LocalDate startDate, LocalDate endDate) { }
}
