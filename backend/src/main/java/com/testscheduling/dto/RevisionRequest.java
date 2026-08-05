package com.testscheduling.dto;

import com.testscheduling.entity.DemandManpowerDetail;
import com.testscheduling.entity.DemandSpecialModule;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
public class RevisionRequest {
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
    private List<DemandManpowerDetail> manpowerDetails;
    private List<DemandSpecialModule> specialModuleDemands;
}
