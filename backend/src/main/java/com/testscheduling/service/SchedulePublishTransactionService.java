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
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Objects;

@Service
public class SchedulePublishTransactionService {

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

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int publishInNewTransaction(Long demandId) {
        TestDemand demand = demandRepository.findByIdForUpdate(demandId)
            .orElseThrow(() -> error("DEMAND_NOT_FOUND", "测试需求不存在"));

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
        schedules.forEach(schedule -> schedule.setPublished(true));
        scheduleRepository.saveAllAndFlush(schedules);
        auditLogService.record("SCHEDULE_PUBLISHED", "SCHEDULE", demandId, null,
            java.util.Map.of("demandId", demandId, "scheduleCount", schedules.size()));
        return schedules.size();
    }

    private void lockModules(List<Schedule> schedules) {
        List<Long> specialIds = schedules.stream().map(Schedule::getDemandSpecialModuleId)
            .filter(Objects::nonNull).distinct().sorted().toList();
        if (!specialIds.isEmpty()) {
            var moduleIds = specialRepository.findByIdIn(specialIds).stream()
                .map(special -> special.getModuleId()).filter(Objects::nonNull)
                .distinct().sorted().toList();
            if (!moduleIds.isEmpty()) moduleRepository.findAllByIdInForUpdate(moduleIds);
        }
    }

    private void lockStaff(List<Schedule> schedules) {
        List<Long> ids = schedules.stream().map(Schedule::getStaffId)
            .filter(Objects::nonNull).distinct().sorted().toList();
        if (!ids.isEmpty()) staffRepository.findAllByIdInForUpdate(ids);
    }

    private BusinessException error(String code, String message) {
        return new BusinessException(code, message);
    }
}
