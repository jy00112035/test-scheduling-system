package com.testscheduling.dto;

import com.testscheduling.entity.DemandManpowerDetail;
import com.testscheduling.entity.DemandSpecialModule;
import com.testscheduling.entity.TestDemand;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class RevisionDiffResponse {
    private Long demandId;
    private TestDemand.DemandStatus status;
    private DemandSnapshot original;
    private DemandSnapshot modified;
    private List<FieldChange> changes;
    private List<DeletedScheduleInfo> deletedSchedules;
    private String submittedBy;
    private LocalDateTime submittedAt;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DemandSnapshot {
        private LocalDateTime startDate;
        private LocalDateTime endDate;
        private String product;
        private String version;
        private String versionType;
        private String versionPhase;
        private String priority;
        private Boolean confidential;
        private String description;
        private Integer testDeviceCount;
        private BigDecimal manpowerDemand;
        private List<DemandManpowerDetail> manpowerDetails;
        private List<DemandSpecialModule> specialModuleDemands;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FieldChange {
        private String field;
        private Object oldValue;
        private Object newValue;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DeletedScheduleInfo {
        private Long id;
        private String staffName;
        private LocalDateTime date;
        private Integer percentage;
        private String reason;
    }
}
