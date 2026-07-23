package com.testscheduling.service;

import com.testscheduling.dto.DemandFulfillmentResponse;
import com.testscheduling.entity.DemandManpowerDetail;
import com.testscheduling.entity.DemandSpecialModule;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.DemandManpowerDetailRepository;
import com.testscheduling.repository.ScheduleRepository;
import com.testscheduling.repository.TestDemandRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class TestDemandService {

    private static final String SPECIAL_AUDIT_ACTION = "DEMAND_SPECIAL_MODULE_CHANGED";
    private static final String AUDIT_ENTITY_TYPE = "TEST_DEMAND";

    private final TestDemandRepository testDemandRepository;
    private final DemandManpowerDetailRepository detailRepository;
    private final DemandSpecialModuleService specialModuleService;
    private final ScheduleRepository scheduleRepository;
    private final AuditLogService auditLogService;
    private final DemandFulfillmentService fulfillmentService;

    public TestDemandService(
            TestDemandRepository testDemandRepository,
            DemandManpowerDetailRepository detailRepository,
            DemandSpecialModuleService specialModuleService,
            ScheduleRepository scheduleRepository,
            AuditLogService auditLogService,
            DemandFulfillmentService fulfillmentService) {
        this.testDemandRepository = testDemandRepository;
        this.detailRepository = detailRepository;
        this.specialModuleService = specialModuleService;
        this.scheduleRepository = scheduleRepository;
        this.auditLogService = auditLogService;
        this.fulfillmentService = fulfillmentService;
    }

    @Transactional(readOnly = true)
    public List<TestDemand> findAll() {
        return enrichWithDetails(testDemandRepository.findAll());
    }

    @Transactional(readOnly = true)
    public TestDemand findById(Long id) {
        TestDemand demand = testDemandRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("测试需求不存在"));
        return enrichWithDetails(demand);
    }

    @Transactional(readOnly = true)
    public List<TestDemand> findByStatus(TestDemand.DemandStatus status) {
        return enrichWithDetails(testDemandRepository.findByStatus(status));
    }

    @Transactional(readOnly = true)
    public List<TestDemand> findPendingAndScheduled() {
        return enrichWithDetails(testDemandRepository.findByStatusIn(
            List.of(TestDemand.DemandStatus.pending, TestDemand.DemandStatus.scheduled)));
    }

    @Transactional
    public TestDemand create(TestDemand demand, String submittedBy) {
        List<DemandManpowerDetail> requestedDetails = detailList(demand.getManpowerDetails());
        List<DemandSpecialModule> requestedSpecials = specialList(demand.getSpecialModuleDemands());
        specialModuleService.validateNew(requestedDetails, requestedSpecials);
        demand.setManpowerDemand(computeTotalManpower(requestedDetails));
        demand.setStatus(TestDemand.DemandStatus.submitted);
        demand.setSubmittedBy(requireSubmitter(submittedBy));

        TestDemand saved = testDemandRepository.save(demand);
        replaceDetails(saved.getId(), requestedDetails);
        List<DemandSpecialModule> after = specialModuleService.replaceForDemand(
            saved.getId(), requestedDetails, requestedSpecials);
        auditSpecialChange(saved.getId(), List.of(), after);
        return enrichWithDetails(saved);
    }

    @Transactional
    public TestDemand update(Long id, TestDemand demand) {
        TestDemand existing = lockedDemand(id);
        List<DemandManpowerDetail> beforeDetails = existing.getManpowerDetails();
        List<DemandSpecialModule> beforeSpecials = existing.getSpecialModuleDemands();
        boolean detailsProvided = demand.getManpowerDetails() != null;
        boolean specialsProvided = demand.getSpecialModuleDemands() != null;
        List<DemandManpowerDetail> requestedDetails = detailsProvided
            ? detailList(demand.getManpowerDetails())
            : beforeDetails;
        List<DemandSpecialModule> requestedSpecials = specialsProvided
            ? demand.getSpecialModuleDemands()
            : beforeSpecials;

        boolean quotasLocked = checkScheduledStructureLock(
            id, beforeDetails, beforeSpecials, requestedDetails, requestedSpecials);
        if (!quotasLocked && (detailsProvided || specialsProvided)) {
            specialModuleService.validateReplacement(id, requestedDetails, requestedSpecials);
        }

        copyEditableFields(existing, demand);
        if (detailsProvided) {
            existing.setManpowerDemand(computeTotalManpower(requestedDetails));
        }
        TestDemand saved = testDemandRepository.save(existing);

        List<DemandSpecialModule> after = beforeSpecials;
        if (!quotasLocked) {
            if (detailsProvided) {
                replaceDetails(id, requestedDetails);
            }
            if (specialsProvided) {
                after = specialModuleService.replaceForDemand(
                    id, requestedDetails, requestedSpecials);
            }
        }
        auditSpecialChange(id, beforeSpecials, after);
        return enrichWithDetails(saved);
    }

    @Transactional
    public void delete(Long id) {
        lockedDemand(id);
        if (scheduleRepository.existsByDemandId(id)) {
            throw immutableScheduledDemand();
        }
        specialModuleService.deleteForDemand(id);
        detailRepository.deleteByDemandId(id);
        detailRepository.flush();
        testDemandRepository.deleteById(id);
    }

    @Transactional
    public TestDemand close(Long id) {
        TestDemand demand = lockedDemand(id);
        if (demand.getStatus() == TestDemand.DemandStatus.completed) {
            return demand;
        }
        requireStatus(demand, TestDemand.DemandStatus.scheduled);
        demand.setStatus(TestDemand.DemandStatus.completed);
        return testDemandRepository.save(demand);
    }

    @Transactional(readOnly = true)
    public List<TestDemand> findPendingApproval() {
        return enrichWithDetails(
            testDemandRepository.findByStatus(TestDemand.DemandStatus.submitted));
    }

    @Transactional
    public TestDemand approveDemand(Long id) {
        TestDemand demand = lockedDemand(id);
        requireStatus(demand, TestDemand.DemandStatus.submitted);
        demand.setStatus(TestDemand.DemandStatus.pending);
        return testDemandRepository.save(demand);
    }

    @Transactional
    public void rejectDemand(Long id) {
        TestDemand demand = lockedDemand(id);
        requireStatus(demand, TestDemand.DemandStatus.submitted);
        demand.setStatus(TestDemand.DemandStatus.rejected);
        testDemandRepository.save(demand);
    }

    @Transactional
    public TestDemand resubmitDemand(Long id, String submittedBy) {
        TestDemand demand = lockedDemand(id);
        requireStatus(demand, TestDemand.DemandStatus.rejected);
        demand.setStatus(TestDemand.DemandStatus.submitted);
        demand.setSubmittedBy(requireSubmitter(submittedBy));
        return testDemandRepository.save(demand);
    }

    @Transactional
    public void batchApproveDemands(List<Long> ids) {
        for (Long id : ids.stream().sorted().toList()) {
            approveDemand(id);
        }
    }

    @Transactional
    public TestDemand approveWithChanges(Long id, TestDemand modifiedDemand) {
        TestDemand demand = lockedDemand(id);
        requireStatus(demand, TestDemand.DemandStatus.submitted);

        List<DemandManpowerDetail> beforeDetails = demand.getManpowerDetails();
        List<DemandSpecialModule> beforeSpecials = demand.getSpecialModuleDemands();
        boolean detailsProvided = modifiedDemand.getManpowerDetails() != null;
        boolean specialsProvided = modifiedDemand.getSpecialModuleDemands() != null;
        List<DemandManpowerDetail> requestedDetails = detailsProvided
            ? modifiedDemand.getManpowerDetails()
            : beforeDetails;
        List<DemandSpecialModule> requestedSpecials = specialsProvided
            ? modifiedDemand.getSpecialModuleDemands()
            : beforeSpecials;
        boolean quotasLocked = checkScheduledStructureLock(
            id, beforeDetails, beforeSpecials, requestedDetails, requestedSpecials);
        if (!quotasLocked && (detailsProvided || specialsProvided)) {
            specialModuleService.validateReplacement(id, requestedDetails, requestedSpecials);
        }

        demand.setStartDate(modifiedDemand.getStartDate());
        demand.setEndDate(modifiedDemand.getEndDate());
        if (modifiedDemand.getPriority() != null) {
            demand.setPriority(modifiedDemand.getPriority());
        }
        if (modifiedDemand.getTestDeviceCount() != null) {
            demand.setTestDeviceCount(modifiedDemand.getTestDeviceCount());
        }
        if (detailsProvided) {
            demand.setManpowerDemand(computeTotalManpower(requestedDetails));
        }
        demand.setStatus(TestDemand.DemandStatus.pending);

        TestDemand saved = testDemandRepository.save(demand);
        List<DemandSpecialModule> after = beforeSpecials;
        if (!quotasLocked) {
            if (detailsProvided) {
                replaceDetails(id, requestedDetails);
            }
            if (specialsProvided) {
                after = specialModuleService.replaceForDemand(
                    id, requestedDetails, requestedSpecials);
            }
        }
        auditSpecialChange(id, beforeSpecials, after);
        return enrichWithDetails(saved);
    }

    @Transactional
    public TestDemand updatePriority(Long id, String priority) {
        TestDemand demand = lockedDemand(id);
        demand.setPriority(priority);
        return testDemandRepository.save(demand);
    }

    @Transactional
    public void batchRejectDemands(List<Long> ids) {
        for (Long id : ids.stream().sorted().toList()) {
            rejectDemand(id);
        }
    }

    private void copyEditableFields(TestDemand target, TestDemand source) {
        target.setProduct(source.getProduct());
        target.setVersion(source.getVersion());
        target.setStartDate(source.getStartDate());
        target.setEndDate(source.getEndDate());
        target.setVersionType(source.getVersionType());
        target.setVersionPhase(source.getVersionPhase());
        target.setDescription(source.getDescription());
        target.setConfidential(source.getConfidential());
        target.setPriority(source.getPriority());
        target.setTestDeviceCount(source.getTestDeviceCount());
    }

    private String requireSubmitter(String submittedBy) {
        if (submittedBy == null || submittedBy.isBlank()) {
            throw new BusinessException("UNAUTHENTICATED", "未登录或登录已过期");
        }
        return submittedBy;
    }

    private void requireStatus(TestDemand demand, TestDemand.DemandStatus required) {
        if (demand.getStatus() != required) {
            throw new BusinessException("DEMAND_STATUS_TRANSITION_INVALID",
                "当前需求状态不允许执行该操作");
        }
    }

    private TestDemand lockedDemand(Long id) {
        if (id == null) {
            throw new BusinessException("DEMAND_NOT_FOUND", "测试需求不存在");
        }
        TestDemand demand = testDemandRepository.findByIdForUpdate(id)
            .orElseThrow(() -> new BusinessException("DEMAND_NOT_FOUND", "测试需求不存在"));
        return enrichWithDetails(demand);
    }

    private void replaceDetails(Long demandId, List<DemandManpowerDetail> details) {
        detailRepository.deleteByDemandId(demandId);
        detailRepository.flush();
        if (details.isEmpty()) {
            return;
        }
        List<DemandManpowerDetail> replacements = details.stream()
            .map(source -> {
                DemandManpowerDetail target = new DemandManpowerDetail();
                target.setDemandId(demandId);
                target.setTestType(source.getTestType());
                target.setManpowerDemand(source.getManpowerDemand());
                target.setRemark(source.getRemark());
                return target;
            })
            .toList();
        detailRepository.saveAll(replacements);
    }

    private BigDecimal computeTotalManpower(List<DemandManpowerDetail> details) {
        return details.stream()
            .map(detail -> detail.getManpowerDemand() == null
                ? BigDecimal.ZERO
                : detail.getManpowerDemand())
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private TestDemand enrichWithDetails(TestDemand demand) {
        if (demand == null) {
            return null;
        }
        List<DemandManpowerDetail> details = detailRepository.findByDemandId(demand.getId());
        List<DemandSpecialModule> specials = specialModuleService.findByDemandId(demand.getId());
        applyEnrichment(demand, details, specials, fulfillmentService.calculate(demand));
        return demand;
    }

    private List<TestDemand> enrichWithDetails(List<TestDemand> demands) {
        if (demands.isEmpty()) {
            return demands;
        }
        List<Long> demandIds = demands.stream().map(TestDemand::getId).toList();
        Map<Long, List<DemandManpowerDetail>> detailsByDemand = BulkQuerySupport
            .fetchChunks(demandIds, detailRepository::findByDemandIdIn).stream()
            .collect(java.util.stream.Collectors.groupingBy(
                DemandManpowerDetail::getDemandId,
                LinkedHashMap::new,
                java.util.stream.Collectors.toList()));
        Map<Long, List<DemandSpecialModule>> specialsByDemand =
            specialModuleService.findByDemandIds(demandIds);
        Map<Long, DemandFulfillmentResponse> fulfillmentByDemand = fulfillmentService.calculateBatch(
            demands, detailsByDemand, specialsByDemand);
        demands.forEach(demand -> applyEnrichment(
            demand,
            detailsByDemand.getOrDefault(demand.getId(), List.of()),
            specialsByDemand.getOrDefault(demand.getId(), List.of()),
            fulfillmentByDemand.get(demand.getId())));
        return demands;
    }

    private void applyEnrichment(
            TestDemand demand,
            List<DemandManpowerDetail> details,
            List<DemandSpecialModule> specials,
            DemandFulfillmentResponse fulfillment) {
        demand.setManpowerDetails(details);
        demand.setSpecialModuleDemands(specials);
        demand.setManpowerSummary(specialModuleService.summarize(details, specials));
        if (fulfillment == null) {
            throw new IllegalStateException("需求人力满足状态缺失");
        }
        Map<Long, DemandFulfillmentResponse.SpecialModuleSummary> specialSummaryById =
            fulfillment.specialModules().stream().collect(java.util.stream.Collectors.toMap(
                DemandFulfillmentResponse.SpecialModuleSummary::demandSpecialModuleId,
                java.util.function.Function.identity()));
        for (DemandSpecialModule special : specials) {
            DemandFulfillmentResponse.SpecialModuleSummary summary = specialSummaryById.get(special.getId());
            if (summary == null) {
                throw new IllegalStateException("特殊模块人力满足状态缺失: " + special.getId());
            }
            special.setAllocatedManpower(summary.allocated());
            special.setRemainingManpower(summary.remaining());
        }
        demand.setManpowerFullySatisfied(fulfillment.fullySatisfied());
        demand.setRequiresHistoricalClassification(fulfillment.requiresHistoricalClassification());
    }

    private boolean quotasChanged(
            List<DemandManpowerDetail> beforeDetails,
            List<DemandSpecialModule> beforeSpecials,
            List<DemandManpowerDetail> afterDetails,
            List<DemandSpecialModule> afterSpecials) {
        return !detailQuotas(beforeDetails).equals(detailQuotas(afterDetails))
            || !specialQuotas(beforeSpecials).equals(specialQuotas(afterSpecials));
    }

    private boolean checkScheduledStructureLock(
            Long demandId,
            List<DemandManpowerDetail> beforeDetails,
            List<DemandSpecialModule> beforeSpecials,
            List<DemandManpowerDetail> requestedDetails,
            List<DemandSpecialModule> requestedSpecials) {
        boolean hasSchedules = scheduleRepository.existsByDemandId(demandId);
        if (hasSchedules && quotasChanged(
                beforeDetails, beforeSpecials, requestedDetails, requestedSpecials)) {
            throw immutableScheduledDemand();
        }
        return hasSchedules;
    }

    private List<QuotaValue> detailQuotas(List<DemandManpowerDetail> details) {
        return detailList(details).stream()
            .map(detail -> new QuotaValue(
                detail.getTestType(), normalized(detail.getManpowerDemand())))
            .sorted(Comparator.comparing(QuotaValue::key, Comparator.nullsFirst(String::compareTo))
                .thenComparing(QuotaValue::amount, Comparator.nullsFirst(BigDecimal::compareTo)))
            .toList();
    }

    private List<QuotaValue> specialQuotas(List<DemandSpecialModule> specials) {
        return specialList(specials).stream()
            .map(special -> new QuotaValue(
                String.valueOf(special.getModuleId()), normalized(special.getManpowerDemand())))
            .sorted(Comparator.comparing(QuotaValue::key)
                .thenComparing(QuotaValue::amount, Comparator.nullsFirst(BigDecimal::compareTo)))
            .toList();
    }

    private BigDecimal normalized(BigDecimal value) {
        return value == null ? null : value.stripTrailingZeros();
    }

    private BusinessException immutableScheduledDemand() {
        return new BusinessException(
            "DEMAND_WITH_SCHEDULE_IMMUTABLE", "已有排班的需求不能修改或删除人力结构");
    }

    private void auditSpecialChange(
            Long demandId,
            List<DemandSpecialModule> before,
            List<DemandSpecialModule> after) {
        auditLogService.record(
            SPECIAL_AUDIT_ACTION,
            AUDIT_ENTITY_TYPE,
            demandId,
            auditValues(before),
            auditValues(after));
    }

    private List<SpecialModuleAuditValue> auditValues(List<DemandSpecialModule> values) {
        return specialList(values).stream()
            .map(value -> new SpecialModuleAuditValue(
                value.getModuleId(), value.getManpowerDemand()))
            .toList();
    }

    private List<DemandManpowerDetail> detailList(List<DemandManpowerDetail> details) {
        return details == null ? Collections.emptyList() : new ArrayList<>(details);
    }

    private List<DemandSpecialModule> specialList(List<DemandSpecialModule> specials) {
        return specials == null ? Collections.emptyList() : new ArrayList<>(specials);
    }

    private record QuotaValue(String key, BigDecimal amount) {
    }

    private record SpecialModuleAuditValue(Long moduleId, BigDecimal manpowerDemand) {
    }
}
