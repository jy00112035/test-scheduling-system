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
    private List<DemandManpowerDetail> manpowerDetails;
    private List<DemandSpecialModule> specialModuleDemands;
}
