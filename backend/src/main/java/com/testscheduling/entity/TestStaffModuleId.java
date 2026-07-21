package com.testscheduling.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.util.Objects;

@Embeddable
public class TestStaffModuleId implements Serializable {

    @Column(name = "staff_id", nullable = false)
    private Long staffId;

    @Column(name = "module_id", nullable = false)
    private Long moduleId;

    public TestStaffModuleId() {
    }

    public TestStaffModuleId(Long staffId, Long moduleId) {
        this.staffId = staffId;
        this.moduleId = moduleId;
    }

    public Long getStaffId() {
        return staffId;
    }

    public void setStaffId(Long staffId) {
        this.staffId = staffId;
    }

    public Long getModuleId() {
        return moduleId;
    }

    public void setModuleId(Long moduleId) {
        this.moduleId = moduleId;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof TestStaffModuleId that)) {
            return false;
        }
        return Objects.equals(staffId, that.staffId)
            && Objects.equals(moduleId, that.moduleId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(staffId, moduleId);
    }
}
