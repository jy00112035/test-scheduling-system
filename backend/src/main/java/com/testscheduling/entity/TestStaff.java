package com.testscheduling.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Entity
@Table(name = "test_staff")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TestStaff {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, unique = true)
    private String empNo;

    private LocalDate joinDate;

    private String groupName;

    @Column(name = "office_location")
    private String officeLocation;

    private String testType;

    @Column(precision = 3, scale = 2)
    private BigDecimal initialCoefficient;

    @Column(precision = 3, scale = 2)
    private BigDecimal currentCoefficient;

    @Enumerated(EnumType.STRING)
    private StaffStatus status = StaffStatus.active;

    @Version
    @Column(name = "lock_version", nullable = false)
    private Long lockVersion;

    @Transient
    private String role;

    @Transient
    private List<String> roles;

    @Transient
    private List<TestModuleConfig> familiarModules;

    @Transient
    private String legacyFamiliarModules;

    @Transient
    private Boolean confidentialClearance;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public enum StaffStatus {
        active, leave, resigned
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
