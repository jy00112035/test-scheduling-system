package com.testscheduling.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "test_staff_module")
@Data
@NoArgsConstructor
public class TestStaffModule {

    @EmbeddedId
    private TestStaffModuleId id;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    public TestStaffModule(Long staffId, Long moduleId) {
        this.id = new TestStaffModuleId(staffId, moduleId);
    }

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
