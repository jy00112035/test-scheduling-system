package com.testscheduling.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import lombok.NoArgsConstructor;
import org.springframework.data.domain.Persistable;

import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(name = "test_staff_module")
@NoArgsConstructor
public class TestStaffModule implements Persistable<TestStaffModuleId> {

    @EmbeddedId
    private TestStaffModuleId id;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Transient
    @JsonIgnore
    private boolean newEntity = true;

    public TestStaffModule(Long staffId, Long moduleId) {
        this.id = new TestStaffModuleId(staffId, moduleId);
    }

    @Override
    public TestStaffModuleId getId() {
        return id;
    }

    public void setId(TestStaffModuleId id) {
        this.id = id;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    @Override
    @JsonIgnore
    public boolean isNew() {
        return newEntity;
    }

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }

    @PostLoad
    @PostPersist
    protected void markNotNew() {
        newEntity = false;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof TestStaffModule that)) {
            return false;
        }
        return Objects.equals(id, that.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }
}
