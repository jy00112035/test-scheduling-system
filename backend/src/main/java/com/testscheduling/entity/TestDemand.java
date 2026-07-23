package com.testscheduling.entity;

import com.testscheduling.dto.ManpowerSummary;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Entity
@Table(name = "test_demand")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TestDemand {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String product;

    private String version;

    private LocalDateTime startDate;

    private LocalDateTime endDate;

    @Column(precision = 10, scale = 2)
    private BigDecimal manpowerDemand;

    @Column(nullable = false)
    private String versionType;

    private String versionPhase;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Enumerated(EnumType.STRING)
    private DemandStatus status = DemandStatus.submitted;

    private String submittedBy;

    @Column
    private Boolean confidential = false;

    @Column
    private String priority;

    @Column
    private Integer testDeviceCount;

    @Transient
    private List<DemandManpowerDetail> manpowerDetails;

    @Transient
    private List<DemandSpecialModule> specialModuleDemands;

    @Transient
    private List<ManpowerSummary> manpowerSummary;

    @Transient
    private Boolean manpowerFullySatisfied;

    @Transient
    private Boolean requiresHistoricalClassification;

    @Version
    @Column(name = "lock_version")
    private Long lockVersion;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public enum DemandStatus {
        submitted, pending, scheduled, completed, rejected, revision_pending
    }

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
