package com.testscheduling.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.math.BigDecimal;

@Entity
@Table(name = "demand_manpower_detail")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class DemandManpowerDetail {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long demandId;

    @Column(nullable = false)
    private String testType;

    @Column(precision = 10, scale = 2)
    private BigDecimal manpowerDemand;

    @Column(length = 200)
    private String remark;
}
