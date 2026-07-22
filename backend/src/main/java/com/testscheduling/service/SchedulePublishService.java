package com.testscheduling.service;

import com.testscheduling.dto.BatchPublishRequest;
import com.testscheduling.dto.BatchPublishResponse;
import com.testscheduling.exception.BusinessException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

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
        List<BatchPublishResponse.Success> success = new ArrayList<>();
        List<BatchPublishResponse.Failure> failed = new ArrayList<>();
        for (Long demandId : new LinkedHashSet<>(request.demandIds())) {
            try {
                success.add(new BatchPublishResponse.Success(demandId, publishOne(demandId)));
            } catch (BusinessException error) {
                failed.add(new BatchPublishResponse.Failure(
                    demandId, error.getErrorCode(), error.getMessage()));
            }
        }
        return new BatchPublishResponse(success, failed);
    }
}
