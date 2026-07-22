package com.testscheduling.service;

import com.testscheduling.dto.BatchPublishRequest;
import com.testscheduling.dto.BatchPublishResponse;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.entity.Schedule;
import com.testscheduling.entity.DemandSpecialModule;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.repository.DemandSpecialModuleRepository;
import com.testscheduling.repository.ScheduleRepository;
import com.testscheduling.repository.TestModuleConfigRepository;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class SchedulePublishService {
    private final SchedulePublishTransactionService transactionService;
    private final AuditLogService auditLogService;
    private final ScheduleRepository scheduleRepository;
    private final DemandSpecialModuleRepository specialRepository;
    private final TestModuleConfigRepository moduleRepository;

    @Autowired
    public SchedulePublishService(
            SchedulePublishTransactionService transactionService,
            AuditLogService auditLogService,
            ScheduleRepository scheduleRepository,
            DemandSpecialModuleRepository specialRepository,
            TestModuleConfigRepository moduleRepository) {
        this.transactionService = transactionService;
        this.auditLogService = auditLogService;
        this.scheduleRepository = scheduleRepository;
        this.specialRepository = specialRepository;
        this.moduleRepository = moduleRepository;
    }

    public SchedulePublishService(
            SchedulePublishTransactionService transactionService,
            AuditLogService auditLogService) {
        this(transactionService, auditLogService, null, null, null);
    }

    public int publishOne(Long demandId) {
        try {
            return transactionService.publishInNewTransaction(demandId);
        } catch (BusinessException error) {
            try {
                auditLogService.record("SCHEDULE_PUBLISH_FAILED", "SCHEDULE", demandId,
                    null, failureSnapshot(demandId, error));
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
        if (demandIds.stream().anyMatch(id -> id <= 0)) {
            throw error("BATCH_PUBLISH_ID_INVALID", "需求ID必须为正数");
        }
        if (distinctDemandIds(demandIds).size() > 500) {
            throw error("BATCH_PUBLISH_TOO_LARGE", "批量发布最多支持500个不同需求");
        }
    }

    private Object failureSnapshot(Long demandId, BusinessException error) {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("demandId", demandId);
        snapshot.put("errorCode", error.getErrorCode());
        snapshot.put("reason", error.getMessage());
        List<Map<String, Object>> scheduleSnapshots = new ArrayList<>();
        snapshot.put("schedules", scheduleSnapshots);
        try {
            if (scheduleRepository == null) {
                return immutableSnapshot(snapshot, scheduleSnapshots);
            }
            List<Schedule> schedules = scheduleRepository.findByDemandId(demandId);
            Set<Long> specialIds = schedules.stream()
                .map(Schedule::getDemandSpecialModuleId).filter(Objects::nonNull)
                .collect(Collectors.toSet());
            Map<Long, DemandSpecialModule> specials = specialRepository == null
                ? Map.of() : specialRepository.findByIdIn(specialIds).stream()
                    .collect(Collectors.toMap(DemandSpecialModule::getId, Function.identity()));
            Set<Long> moduleIds = specials.values().stream().map(DemandSpecialModule::getModuleId)
                .filter(Objects::nonNull).collect(Collectors.toSet());
            Map<Long, TestModuleConfig> modules = moduleRepository == null
                ? Map.of() : moduleRepository.findAllById(moduleIds).stream()
                    .collect(Collectors.toMap(TestModuleConfig::getId, Function.identity()));
            for (Schedule schedule : schedules) {
                DemandSpecialModule special = specials.get(schedule.getDemandSpecialModuleId());
                TestModuleConfig module = special == null ? null : modules.get(special.getModuleId());
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("scheduleId", schedule.getId());
                row.put("staffId", schedule.getStaffId());
                row.put("demandManpowerDetailId", schedule.getDemandManpowerDetailId());
                row.put("demandSpecialModuleId", schedule.getDemandSpecialModuleId());
                row.put("moduleId", special == null ? null : special.getModuleId());
                row.put("moduleName", module == null ? null : module.getModuleName());
                scheduleSnapshots.add(Collections.unmodifiableMap(row));
            }
        } catch (RuntimeException ignored) {
            scheduleSnapshots.clear();
        }
        return immutableSnapshot(snapshot, scheduleSnapshots);
    }

    private Map<String, Object> immutableSnapshot(
            Map<String, Object> snapshot, List<Map<String, Object>> rows) {
        snapshot.put("schedules", Collections.unmodifiableList(new ArrayList<>(rows)));
        return Collections.unmodifiableMap(new LinkedHashMap<>(snapshot));
    }

    private BusinessException error(String code, String message) {
        return new BusinessException(code, message);
    }
}
