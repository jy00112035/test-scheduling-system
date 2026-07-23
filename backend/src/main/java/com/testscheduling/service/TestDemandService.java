package com.testscheduling.service;

import com.testscheduling.dto.DemandFulfillmentResponse;
import com.testscheduling.dto.RevisionDiffResponse;
import com.testscheduling.dto.RevisionRequest;
import com.testscheduling.entity.DemandManpowerDetail;
import com.testscheduling.entity.DemandSpecialModule;
import com.testscheduling.entity.Schedule;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.DemandManpowerDetailRepository;
import com.testscheduling.repository.ScheduleRepository;
import com.testscheduling.repository.TestDemandRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

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
    private final FieldConfigService fieldConfigService;

    public TestDemandService(
            TestDemandRepository testDemandRepository,
            DemandManpowerDetailRepository detailRepository,
            DemandSpecialModuleService specialModuleService,
            ScheduleRepository scheduleRepository,
            AuditLogService auditLogService,
            DemandFulfillmentService fulfillmentService,
            FieldConfigService fieldConfigService) {
        this.testDemandRepository = testDemandRepository;
        this.detailRepository = detailRepository;
        this.specialModuleService = specialModuleService;
        this.scheduleRepository = scheduleRepository;
        this.auditLogService = auditLogService;
        this.fulfillmentService = fulfillmentService;
        this.fieldConfigService = fieldConfigService;
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
        requireStatus(existing, TestDemand.DemandStatus.rejected);
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
        TestDemand demand = lockedDemand(id);
        if (demand.getStatus() != TestDemand.DemandStatus.submitted
                && demand.getStatus() != TestDemand.DemandStatus.rejected) {
            throw invalidStatusTransition();
        }
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

    // ========== 需求变更审批相关方法 ==========

    @Transactional
    public TestDemand submitRevision(Long id, RevisionRequest request, String submittedBy) {
        TestDemand demand = lockedDemand(id);

        // 1. 验证状态：只能编辑 pending 或 scheduled 状态
        if (demand.getStatus() != TestDemand.DemandStatus.pending
                && demand.getStatus() != TestDemand.DemandStatus.scheduled) {
            throw new BusinessException("DEMAND_STATUS_TRANSITION_INVALID",
                "只能编辑待排期或已排期的需求");
        }

        // 2. 获取所有排班记录
        List<Schedule> allSchedules = scheduleRepository.findByDemandId(id);
        LocalDate today = LocalDate.now();

        // 3. 验证新人力配额 >= 已使用人力（过去排班）
        List<DemandManpowerDetail> requestedDetails = detailList(request.getManpowerDetails());
        List<DemandSpecialModule> requestedSpecials = specialList(request.getSpecialModuleDemands());

        // 验证功能测试类型的人力
        for (DemandManpowerDetail newDetail : requestedDetails) {
            BigDecimal usedManpower = allSchedules.stream()
                .filter(s -> s.getDate().isBefore(today))
                .filter(s -> newDetail.getId() != null
                    && newDetail.getId().equals(s.getDemandManpowerDetailId()))
                .map(s -> BigDecimal.valueOf(s.getPercentage()).divide(BigDecimal.valueOf(100)))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

            if (newDetail.getManpowerDemand() != null
                    && newDetail.getManpowerDemand().compareTo(usedManpower) < 0) {
                throw new BusinessException("MANPOWER_DEMAND_INVALID",
                    String.format("%s 人力配额不能低于已使用的人力 %s 人天",
                        newDetail.getTestType(), usedManpower));
            }
        }

        // 验证专项模块的人力
        for (DemandSpecialModule newModule : requestedSpecials) {
            BigDecimal usedManpower = allSchedules.stream()
                .filter(s -> s.getDate().isBefore(today))
                .filter(s -> s.getDemandSpecialModuleId() != null
                    && s.getDemandSpecialModuleId().equals(newModule.getId()))
                .map(s -> BigDecimal.valueOf(s.getPercentage()).divide(BigDecimal.valueOf(100)))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

            if (newModule.getManpowerDemand() != null
                    && newModule.getManpowerDemand().compareTo(usedManpower) < 0) {
                throw new BusinessException("MANPOWER_DEMAND_INVALID",
                    "专项模块人力配额不能低于已使用的人力");
            }
        }

        // 4. 自动删除周期外和超额排班
        List<Schedule> deletedSchedules = deleteExcessSchedules(
            id, request.getStartDate(), request.getEndDate(),
            requestedDetails, requestedSpecials, allSchedules);

        // 5. 更新需求字段
        demand.setStartDate(request.getStartDate());
        demand.setEndDate(request.getEndDate());
        demand.setManpowerDemand(computeTotalManpower(requestedDetails));

        // 6. 更新人力详情和专项模块
        replaceDetails(id, requestedDetails);
        specialModuleService.replaceForDemand(id, requestedDetails, requestedSpecials);

        // 7. 状态变更为 revision_pending
        demand.setStatus(TestDemand.DemandStatus.revision_pending);
        demand.setSubmittedBy(requireSubmitter(submittedBy));

        TestDemand saved = testDemandRepository.save(demand);

        // 8. 记录审计日志
        auditLogService.record(
            "DEMAND_REVISION_SUBMITTED",
            AUDIT_ENTITY_TYPE,
            id,
            null,
            Map.of(
                "submittedBy", submittedBy,
                "deletedScheduleCount", deletedSchedules.size(),
                "newStartDate", request.getStartDate() != null ? request.getStartDate().toString() : null,
                "newEndDate", request.getEndDate() != null ? request.getEndDate().toString() : null
            ));

        return enrichWithDetails(saved);
    }

    @Transactional
    public List<Schedule> deleteExcessSchedules(
            Long demandId,
            LocalDateTime newStartDate,
            LocalDateTime newEndDate,
            List<DemandManpowerDetail> newDetails,
            List<DemandSpecialModule> newSpecials,
            List<Schedule> allSchedules) {

        LocalDate start = newStartDate != null ? newStartDate.toLocalDate() : LocalDate.MIN;
        LocalDate end = newEndDate != null ? newEndDate.toLocalDate() : LocalDate.MAX;
        LocalDate today = LocalDate.now();

        List<Schedule> toDelete = new ArrayList<>();

        // 1. 删除周期外排班（只删除未来的排班，过去的排班保留）
        for (Schedule s : allSchedules) {
            if (s.getDate().isAfter(today)) {
                if (s.getDate().isBefore(start) || s.getDate().isAfter(end)) {
                    toDelete.add(s);
                }
            }
        }

        // 2. 删除超额排班（按日期从后往前删除）
        // 按 detailId 分组计算已排班数量
        Map<Long, BigDecimal> allocatedByDetailId = allSchedules.stream()
            .filter(s -> s.getDemandManpowerDetailId() != null)
            .filter(s -> !toDelete.contains(s))
            .collect(Collectors.groupingBy(
                Schedule::getDemandManpowerDetailId,
                Collectors.reducing(
                    BigDecimal.ZERO,
                    s -> BigDecimal.valueOf(s.getPercentage()).divide(BigDecimal.valueOf(100)),
                    BigDecimal::add)));

        for (DemandManpowerDetail newDetail : newDetails) {
            if (newDetail.getId() == null) continue;

            BigDecimal allocated = allocatedByDetailId.getOrDefault(newDetail.getId(), BigDecimal.ZERO);
            BigDecimal quota = newDetail.getManpowerDemand() != null
                ? newDetail.getManpowerDemand() : BigDecimal.ZERO;
            BigDecimal excess = allocated.subtract(quota);

            if (excess.compareTo(BigDecimal.ZERO) <= 0) continue;

            // 按日期从后往前排序，优先删除最远的排班
            List<Schedule> detailSchedules = allSchedules.stream()
                .filter(s -> newDetail.getId().equals(s.getDemandManpowerDetailId()))
                .filter(s -> s.getDate().isAfter(today))  // 只删除未来的
                .filter(s -> !toDelete.contains(s))
                .sorted((a, b) -> b.getDate().compareTo(a.getDate()))
                .toList();

            for (Schedule s : detailSchedules) {
                if (excess.compareTo(BigDecimal.ZERO) <= 0) break;

                BigDecimal scheduleManpower = BigDecimal.valueOf(s.getPercentage())
                    .divide(BigDecimal.valueOf(100));
                toDelete.add(s);
                excess = excess.subtract(scheduleManpower);
            }
        }

        // 3. 按专项模块删除超额排班
        Map<Long, BigDecimal> allocatedBySpecialId = allSchedules.stream()
            .filter(s -> s.getDemandSpecialModuleId() != null)
            .filter(s -> !toDelete.contains(s))
            .collect(Collectors.groupingBy(
                Schedule::getDemandSpecialModuleId,
                Collectors.reducing(
                    BigDecimal.ZERO,
                    s -> BigDecimal.valueOf(s.getPercentage()).divide(BigDecimal.valueOf(100)),
                    BigDecimal::add)));

        for (DemandSpecialModule newSpecial : newSpecials) {
            if (newSpecial.getId() == null) continue;

            BigDecimal allocated = allocatedBySpecialId.getOrDefault(newSpecial.getId(), BigDecimal.ZERO);
            BigDecimal quota = newSpecial.getManpowerDemand() != null
                ? newSpecial.getManpowerDemand() : BigDecimal.ZERO;
            BigDecimal excess = allocated.subtract(quota);

            if (excess.compareTo(BigDecimal.ZERO) <= 0) continue;

            List<Schedule> specialSchedules = allSchedules.stream()
                .filter(s -> newSpecial.getId().equals(s.getDemandSpecialModuleId()))
                .filter(s -> s.getDate().isAfter(today))
                .filter(s -> !toDelete.contains(s))
                .sorted((a, b) -> b.getDate().compareTo(a.getDate()))
                .toList();

            for (Schedule s : specialSchedules) {
                if (excess.compareTo(BigDecimal.ZERO) <= 0) break;

                BigDecimal scheduleManpower = BigDecimal.valueOf(s.getPercentage())
                    .divide(BigDecimal.valueOf(100));
                toDelete.add(s);
                excess = excess.subtract(scheduleManpower);
            }
        }

        // 4. 执行删除
        for (Schedule s : toDelete) {
            scheduleRepository.delete(s);
        }

        return toDelete;
    }

    @Transactional(readOnly = true)
    public RevisionDiffResponse getRevisionDiff(Long id) {
        TestDemand demand = findById(id);

        if (demand.getStatus() != TestDemand.DemandStatus.revision_pending) {
            throw new BusinessException("DEMAND_NOT_IN_REVISION",
                "需求不在变更审批状态");
        }

        // 获取当前排班（用于显示已删除的排班）
        List<Schedule> currentSchedules = scheduleRepository.findByDemandId(id);

        // 构建变更对比响应
        RevisionDiffResponse response = new RevisionDiffResponse();
        response.setDemandId(id);
        response.setStatus(demand.getStatus());
        response.setSubmittedBy(demand.getSubmittedBy());
        response.setSubmittedAt(demand.getUpdatedAt());

        // 原始快照（从审计日志或数据库历史中获取，这里简化处理）
        RevisionDiffResponse.DemandSnapshot modified = new RevisionDiffResponse.DemandSnapshot();
        modified.setStartDate(demand.getStartDate());
        modified.setEndDate(demand.getEndDate());
        modified.setManpowerDemand(demand.getManpowerDemand());
        modified.setManpowerDetails(demand.getManpowerDetails());
        modified.setSpecialModuleDemands(demand.getSpecialModuleDemands());
        response.setModified(modified);

        return response;
    }

    @Transactional
    public TestDemand approveRevision(Long id) {
        TestDemand demand = lockedDemand(id);
        requireStatus(demand, TestDemand.DemandStatus.revision_pending);

        // 检查是否还有排班，决定状态
        boolean hasSchedules = scheduleRepository.existsByDemandId(id);
        demand.setStatus(hasSchedules
            ? TestDemand.DemandStatus.scheduled
            : TestDemand.DemandStatus.pending);

        return testDemandRepository.save(demand);
    }

    @Transactional
    public void rejectRevision(Long id) {
        TestDemand demand = lockedDemand(id);
        requireStatus(demand, TestDemand.DemandStatus.revision_pending);
        demand.setStatus(TestDemand.DemandStatus.rejected);
        testDemandRepository.save(demand);
    }

    @Transactional
    public TestDemand approveRevisionWithChanges(Long id, RevisionRequest request) {
        TestDemand demand = lockedDemand(id);
        requireStatus(demand, TestDemand.DemandStatus.revision_pending);

        // 应用修改
        if (request.getStartDate() != null) {
            demand.setStartDate(request.getStartDate());
        }
        if (request.getEndDate() != null) {
            demand.setEndDate(request.getEndDate());
        }

        List<DemandManpowerDetail> requestedDetails = detailList(request.getManpowerDetails());
        List<DemandSpecialModule> requestedSpecials = specialList(request.getSpecialModuleDemands());

        if (!requestedDetails.isEmpty()) {
            demand.setManpowerDemand(computeTotalManpower(requestedDetails));
            replaceDetails(id, requestedDetails);
        }
        if (!requestedSpecials.isEmpty()) {
            specialModuleService.replaceForDemand(id, requestedDetails, requestedSpecials);
        }

        // 检查是否还有排班，决定状态
        boolean hasSchedules = scheduleRepository.existsByDemandId(id);
        demand.setStatus(hasSchedules
            ? TestDemand.DemandStatus.scheduled
            : TestDemand.DemandStatus.pending);

        return testDemandRepository.save(demand);
    }

    @Transactional(readOnly = true)
    public List<TestDemand> findRevisionPendingApproval() {
        return enrichWithDetails(
            testDemandRepository.findByStatus(TestDemand.DemandStatus.revision_pending));
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
            throw invalidStatusTransition();
        }
    }

    private BusinessException invalidStatusTransition() {
        return new BusinessException("DEMAND_STATUS_TRANSITION_INVALID",
            "当前需求状态不允许执行该操作");
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
        fieldConfigService.validateTestTypeOptionsForDemandWrite(details);
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
