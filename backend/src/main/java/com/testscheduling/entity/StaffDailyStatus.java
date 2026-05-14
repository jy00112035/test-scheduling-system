package com.testscheduling.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.time.LocalDate;

@Entity
@Table(name = "staff_daily_status", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"staffId", "date"})
})
@Data
@NoArgsConstructor
@AllArgsConstructor
public class StaffDailyStatus {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long staffId;

    @Column(nullable = false)
    private LocalDate date;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private DailyAvailabilityStatus status;

    @Column
    private Double percentage = 100.0;

    public enum DailyAvailabilityStatus {
        AVAILABLE,
        OTHER_TASKS,
        SECONDED,
        ON_LEAVE
    }
}
