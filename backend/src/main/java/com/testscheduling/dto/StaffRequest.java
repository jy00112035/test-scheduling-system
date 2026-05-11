package com.testscheduling.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Data
public class StaffRequest {
    private String name;
    private String empNo;
    private LocalDate joinDate;
    private String groupName;
    private String testType;
    private BigDecimal initialCoefficient;
    private BigDecimal currentCoefficient;
    private String status;
    private String role;
    private List<String> roles;
    private String familiarModules;
    private Boolean confidentialClearance;
}
