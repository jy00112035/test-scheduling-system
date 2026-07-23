package com.testscheduling.service;

import com.testscheduling.entity.Schedule;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.DemandSpecialModuleRepository;
import com.testscheduling.repository.ScheduleRepository;
import com.testscheduling.repository.TestDemandRepository;
import com.testscheduling.repository.TestModuleConfigRepository;
import com.testscheduling.repository.TestStaffRepository;
import com.testscheduling.dto.DemandFulfillmentResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Objects;
import java.util.Set;

@Service
public class SchedulePublishTransactionService {
    private static final int LOCK_CHUNK_SIZE = 500;

    private final TestDemandRepository demandRepository;
    private final TestModuleConfigRepository moduleRepository;
    private final DemandSpecialModuleRepository specialRepository;
    private final TestStaffRepository staffRepository;
    private final ScheduleRepository scheduleRepository;
    private final DemandFulfillmentService fulfillmentService;
    private final ScheduleEligibilityService eligibilityService;
    private final AuditLogService auditLogService;

    public SchedulePublishTransactionService(
            TestDemandRepository demandRepository,
            DemandSpecialModuleRepository specialRepository,
            TestModuleConfigRepository moduleRepository,
            TestStaffRepository staffRepository,
            ScheduleRepository scheduleRepository,
            DemandFulfillmentService fulfillmentService,
            ScheduleEligibilityService eligibilityService,
            AuditLogService auditLogService) {
        this.demandRepository = demandRepository;
        this.specialRepository = specialRepository;
        this.moduleRepository = moduleRepository;
        this.staffRepository = staffRepository;
        this.scheduleRepository = scheduleRepository;
        this.fulfillmentService = fulfillmentService;
        this.eligibilityService = eligibilityService;
        this.auditLogService = auditLogService;
    }

    @Transactional(
        propagation = Propagation.REQUIRES_NEW,
        isolation = Isolation.READ_COMMITTED)
    public int publishInNewTransaction(Long demandId) {
        TestDemand demand = demandRepository.findByIdForUpdate(demandId)
            .orElseThrow(() -> error("DEMAND_NOT_FOUND", "测试需求不存在"));
        eligibilityService.requireSchedulable(demand);

        List<Schedule> snapshot = scheduleRepository.findByDemandId(demandId);
        if (snapshot.isEmpty()) {
            throw error("SCHEDULE_NOT_FOUND", "该需求没有可发布的排班");
        }
        lockModules(snapshot);
        lockStaff(snapshot);
        List<Schedule> schedules = scheduleRepository.findByDemandIdForUpdate(demandId);
        if (schedules.isEmpty()) {
            throw error("SCHEDULE_NOT_FOUND", "该需求没有可发布的排班");
        }

        DemandFulfillmentResponse fulfillment = fulfillmentService.calculate(demandId);
        if (fulfillment.requiresHistoricalClassification()) {
            throw error("SCHEDULE_HISTORICAL_CLASSIFICATION_REQUIRED",
                "历史排班尚未完成人力归属，无法发布");
        }
        if (!fulfillment.specialModuleGaps().isEmpty()) {
            DemandFulfillmentResponse.Gap gap = fulfillment.specialModuleGaps().get(0);
            throw error("SPECIAL_MODULE_UNFULFILLED", gap.moduleName() + "仍缺少 "
                + gap.shortage().stripTrailingZeros().toPlainString() + " 人天");
        }
        if (!fulfillment.generalGaps().isEmpty()) {
            throw error("GENERAL_MANPOWER_UNFULFILLED", "通用人力仍缺少 "
                + fulfillment.generalGaps().stream().map(DemandFulfillmentResponse.Gap::shortage)
                    .reduce(BigDecimal.ZERO, BigDecimal::add).stripTrailingZeros().toPlainString()
                + " 人天");
        }
        if (!fulfillment.fullySatisfied()) {
            throw error("GENERAL_MANPOWER_UNFULFILLED", "需求人力尚未满足，无法发布");
        }

        ScheduleEligibilityService.ValidationContext context =
            eligibilityService.prepareContext(schedules);
        for (Schedule schedule : schedules) {
            eligibilityService.validateForPublish(schedule, context);
        }
        List<Schedule> drafts = schedules.stream()
            .filter(schedule -> !Boolean.TRUE.equals(schedule.getPublished())).toList();
        if (drafts.isEmpty()) {
            return schedules.size();
        }
        drafts.forEach(schedule -> schedule.setPublished(true));
        scheduleRepository.saveAllAndFlush(drafts);
        auditLogService.record("SCHEDULE_PUBLISHED", "SCHEDULE", demandId, null,
            java.util.Map.of("demandId", demandId, "scheduleCount", drafts.size()));
        return schedules.size();
    }

    private void lockModules(List<Schedule> schedules) {
        List<Long> specialIds = schedules.stream().map(Schedule::getDemandSpecialModuleId)
            .filter(Objects::nonNull).distinct().sorted().toList();
        if (!specialIds.isEmpty()) {
            List<Long> moduleIds = new ArrayList<>();
            for (List<Long> chunk : chunks(specialIds)) {
                var specials = specialRepository.findByIdIn(chunk);
                Set<Long> found = specials.stream().map(item -> item.getId()).collect(
                    java.util.stream.Collectors.toSet());
                if (found.size() != chunk.size()) {
                    throw error("MODULE_NOT_FOUND", "特殊模块人力明细不存在");
                }
                moduleIds.addAll(specials.stream().map(item -> item.getModuleId())
                    .filter(Objects::nonNull).toList());
            }
            lockModulesById(moduleIds.stream().distinct().sorted().toList());
        }
    }

    private void lockStaff(List<Schedule> schedules) {
        List<Long> ids = schedules.stream().map(Schedule::getStaffId)
            .filter(Objects::nonNull).distinct().sorted().toList();
        for (List<Long> chunk : chunks(ids)) {
            var found = staffRepository.findAllByIdInForUpdate(chunk);
            if (found.stream().map(item -> item.getId()).collect(
                    java.util.stream.Collectors.toSet()).size() != chunk.size()) {
                throw error("STAFF_NOT_FOUND", "测试人员不存在");
            }
        }
    }

    private void lockModulesById(List<Long> ids) {
        for (List<Long> chunk : chunks(ids)) {
            var found = moduleRepository.findAllByIdInForUpdate(chunk);
            if (found.stream().map(item -> item.getId()).collect(
                    java.util.stream.Collectors.toSet()).size() != chunk.size()) {
                throw error("MODULE_NOT_FOUND", "模块不存在");
            }
        }
    }

    private <T> List<List<T>> chunks(Collection<T> values) {
        List<T> source = new ArrayList<>(values);
        List<List<T>> chunks = new ArrayList<>();
        for (int start = 0; start < source.size(); start += LOCK_CHUNK_SIZE) {
            chunks.add(source.subList(start, Math.min(start + LOCK_CHUNK_SIZE, source.size())));
        }
        return chunks;
    }

    private BusinessException error(String code, String message) {
        return new BusinessException(code, message);
    }
}
