package com.testscheduling.service;

import com.testscheduling.dto.BatchPublishRequest;
import com.testscheduling.dto.BatchPublishResponse;
import com.testscheduling.exception.BusinessException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;

@Service
public class SchedulePublishService {
    private final SchedulePublishTransactionService transactionService;
    private final AuditLogService auditLogService;

    public SchedulePublishService(
            SchedulePublishTransactionService transactionService,
            AuditLogService auditLogService) {
        this.transactionService = transactionService;
        this.auditLogService = auditLogService;
    }

    public int publishOne(Long demandId) {
        try {
            return transactionService.publishInNewTransaction(demandId);
        } catch (BusinessException error) {
            try {
                auditLogService.record("SCHEDULE_PUBLISH_FAILED", "SCHEDULE", demandId,
                    null, java.util.Map.of("demandId", demandId,
                        "errorCode", error.getErrorCode(), "reason", error.getMessage()));
            } catch (RuntimeException ignored) {
                // Failure telemetry must never replace the original business error.
            }
            throw error;
        }
    }

    public BatchPublishResponse publishBatch(BatchPublishRequest request) {
        validateRequest(request);
        List<BatchPublishResponse.Success> success = new ArrayList<>();
        List<BatchPublishResponse.Failure> failed = new ArrayList<>();
        for (Long demandId : distinctDemandIds(request.demandIds())) {
            try {
                success.add(new BatchPublishResponse.Success(demandId, publishOne(demandId)));
            } catch (BusinessException error) {
                failed.add(new BatchPublishResponse.Failure(
                    demandId, error.getErrorCode(), error.getMessage()));
            }
        }
        return new BatchPublishResponse(success, failed);
    }

    private List<Long> distinctDemandIds(List<Long> demandIds) {
        return new ArrayList<>(new LinkedHashSet<>(demandIds));
    }

    private void validateRequest(BatchPublishRequest request) {
        if (request == null) {
            throw error("BATCH_PUBLISH_REQUEST_REQUIRED", "批量发布请求不能为空");
        }
        List<Long> demandIds = request.demandIds();
        if (demandIds == null || demandIds.isEmpty()) {
            throw error("BATCH_PUBLISH_IDS_REQUIRED", "需求ID列表不能为空");
        }
        if (demandIds.stream().anyMatch(Objects::isNull)) {
            throw error("BATCH_PUBLISH_ID_INVALID", "需求ID列表不能包含空值");
        }
        if (distinctDemandIds(demandIds).size() > 500) {
            throw error("BATCH_PUBLISH_TOO_LARGE", "批量发布最多支持500个不同需求");
        }
    }

    private BusinessException error(String code, String message) {
        return new BusinessException(code, message);
    }
}
