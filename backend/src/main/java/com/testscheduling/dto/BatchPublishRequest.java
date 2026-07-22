package com.testscheduling.dto;

import com.testscheduling.exception.BusinessException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public record BatchPublishRequest(
    @NotNull @NotEmpty List<@Valid @NotNull Long> demandIds) {

    public static final int MAX_DEMANDS = 500;

    public BatchPublishRequest {
        if (demandIds == null || demandIds.isEmpty()) {
            throw new BusinessException("BATCH_PUBLISH_IDS_REQUIRED", "需求ID列表不能为空");
        }
        if (demandIds.size() > MAX_DEMANDS) {
            throw new BusinessException("BATCH_PUBLISH_TOO_LARGE", "批量发布最多支持500个需求");
        }
        if (demandIds.stream().anyMatch(id -> id == null)) {
            throw new BusinessException("BATCH_PUBLISH_ID_INVALID", "需求ID列表不能包含空值");
        }
        demandIds = List.copyOf(demandIds);
    }
}
