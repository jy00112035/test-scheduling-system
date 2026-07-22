package com.testscheduling.dto;

import com.testscheduling.exception.BusinessException;

public enum ScheduleDeleteScope {
    DRAFT_ONLY,
    ALL;

    public static ScheduleDeleteScope fromApiValue(String value) {
        if ("draft_only".equalsIgnoreCase(value)) {
            return DRAFT_ONLY;
        }
        if ("all".equalsIgnoreCase(value)) {
            return ALL;
        }
        throw new BusinessException(
            "SCHEDULE_DELETE_SCOPE_INVALID", "排班清理范围只支持draft_only或all");
    }
}
