package com.testscheduling.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.testscheduling.dto.DemandCloseResponse;
import com.testscheduling.dto.DemandClosePreviewResponse;
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
import com.testscheduling.repository.TestStaffRepository;
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
import java.util.Objects;
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
    private final ObjectMapper objectMapper;
    private final TestStaffRepository testStaffRepository;

    public TestDemandService(
            TestDemandRepository testDemandRepository,
            DemandManpowerDetailRepository detailRepository,
            DemandSpecialModuleService specialModuleService,
            ScheduleRepository scheduleRepository,
            AuditLogService auditLogService,
            DemandFulfillmentService fulfillmentService,
            FieldConfigService fieldConfigService,
            ObjectMapper objectMapper,
            TestStaffRepository testStaffRepository) {
        this.testDemandRepository = testDemandRepository;
        this.detailRepository = detailRepository;
        this.specialModuleService = specialModuleService;
        this.scheduleRepository = scheduleRepository;
        this.auditLogService = auditLogService;
        this.fulfillmentService = fulfillmentService;
        this.fieldConfigService = fieldConfigService;
        this.objectMapper = objectMapper;
        this.testStaffRepository = testStaffRepository;
    }

    @Transactional(readOnly = true)
    public List<TestDemand> findAll() {
        return enrichWithDetails(testDemandRepository.findAll());
    }

    /**
     * Returns demands filtered by optional criteria, with role-based visibility.
     * <p>
     * Users without a manager role (admin / projectManager / resourceManager /
     * fieldAdmin) see only their own submitted demands. Users with any manager
     * role see all demands.
     */
    @Transactional(readOnly = true)
    public List<TestDemand> findFiltered(
            List<String> roles, String username,
            TestDemand.DemandStatus status, String product, String search) {
        String submittedBy = shouldFilterByOwner(roles) ? username : null;
        return enrichWithDetails(
            testDemandRepository.findFiltered(status, product, search, submittedBy));
    }

    /**
     * Returns demand counts grouped by status, respecting role-based visibility.
     */
    @Transactional(readOnly = true)
    public Map<String, Long> getStatusCounts(List<String> roles, String username) {
        String submittedBy = shouldFilterByOwner(roles) ? username : null;
        List<TestDemand> visible = submittedBy == null
            ? testDemandRepository.findAll()
            : testDemandRepository.findBySubmittedBy(submittedBy);
        Map<String, Long> counts = new LinkedHashMap<>();
        counts.put("all", (long) visible.size());
        for (TestDemand.DemandStatus status : TestDemand.DemandStatus.values()) {
            long count = visible.stream()
                .filter(d -> d.getStatus() == status)
                .count();
            counts.put(status.name(), count);
        }
        return counts;
    }

    /**
     * Returns true if the user should see only their own demands.
     * Users with manager-level roles see all demands.
     */
    private boolean shouldFilterByOwner(List<String> roles) {
        if (roles == null || roles.isEmpty()) {
            return true;
        }
        return roles.stream().noneMatch(role ->
            "admin".equals(role) || "projectManager".equals(role)
                || "resourceManager".equals(role) || "fieldAdmin".equals(role)
                || "testManager".equals(role));
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
            List.of(TestDemand.DemandStatus.pending, TestDemand.DemandStatus.scheduled,
                TestDemand.DemandStatus.revision_pending)));
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

    @Transactional(readOnly = true)
    public DemandClosePreviewResponse previewClose(Long id) {
        TestDemand demand = lockedDemand(id);
        if (demand.getStatus() != TestDemand.DemandStatus.scheduled
                && demand.getStatus() != TestDemand.DemandStatus.pending) {
            throw invalidStatusTransition();
        }

        List<Schedule> allSchedules = scheduleRepository.findByDemandId(id);
        LocalDate today = LocalDate.now();

        BigDecimal pastScheduledManpower = allSchedules.stream()
            .filter(s -> s.getDate() != null && !s.getDate().isAfter(today))
            .map(s -> BigDecimal.valueOf(s.getPercentage() == null ? 0 : s.getPercentage())
                .divide(BigDecimal.valueOf(100)))
            .reduce(BigDecimal.ZERO, BigDecimal::add);

        long futureScheduleCount = allSchedules.stream()
            .filter(s -> s.getDate() != null && !s.getDate().isBefore(today))
            .count();

        BigDecimal demandManpower = demand.getManpowerDemand() != null
            ? demand.getManpowerDemand() : BigDecimal.ZERO;
        boolean manpowerSatisfied = pastScheduledManpower.compareTo(demandManpower) >= 0;

        return new DemandClosePreviewResponse(
            (int) futureScheduleCount, pastScheduledManpower, demandManpower, manpowerSatisfied);
    }

    @Transactional
    public DemandCloseResponse close(Long id) {
        TestDemand demand = lockedDemand(id);
        if (demand.getStatus() == TestDemand.DemandStatus.completed) {
            return new DemandCloseResponse(demand, 0, BigDecimal.ZERO, true, "需求已处于关闭状态");
        }
        if (demand.getStatus() != TestDemand.DemandStatus.scheduled
                && demand.getStatus() != TestDemand.DemandStatus.pending) {
            throw invalidStatusTransition();
        }

        List<Schedule> allSchedules = scheduleRepository.findByDemandId(id);
        LocalDate today = LocalDate.now();

        BigDecimal pastScheduledManpower = allSchedules.stream()
            .filter(s -> s.getDate() != null && !s.getDate().isAfter(today))
            .map(s -> BigDecimal.valueOf(s.getPercentage() == null ? 0 : s.getPercentage())
                .divide(BigDecimal.valueOf(100)))
            .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal demandManpower = demand.getManpowerDemand() != null
            ? demand.getManpowerDemand() : BigDecimal.ZERO;
        boolean manpowerSatisfied = pastScheduledManpower.compareTo(demandManpower) >= 0;

        List<Schedule> futureSchedules = allSchedules.stream()
            .filter(s -> s.getDate() != null && !s.getDate().isBefore(today))
            .toList();
        for (Schedule s : futureSchedules) {
            scheduleRepository.delete(s);
        }

        demand.setStatus(TestDemand.DemandStatus.completed);
        TestDemand saved = testDemandRepository.save(demand);

        String message;
        if (futureSchedules.isEmpty()) {
            message = "测试需求已关闭";
        } else if (manpowerSatisfied) {
            message = String.format("测试需求已关闭，已清理 %d 条排班", futureSchedules.size());
        } else {
            message = String.format("测试需求已关闭。注意：截止今日已排班人力(%s人天)不足需求人力(%s人天)，已清理 %d 条排班",
                pastScheduledManpower.stripTrailingZeros().toPlainString(),
                demandManpower.stripTrailingZeros().toPlainString(),
                futureSchedules.size());
        }

        return new DemandCloseResponse(
            saved, futureSchedules.size(), pastScheduledManpower, manpowerSatisfied, message);
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
        if (demand.getStatus() == TestDemand.DemandStatus.completed) {
            throw new BusinessException("DEMAND_STATUS_TRANSITION_INVALID",
                "已完成的需求不能提交变更");
        }
        if (demand.getStatus() == TestDemand.DemandStatus.revision_pending) {
            throw new BusinessException("DEMAND_STATUS_TRANSITION_INVALID",
                "需求已在变更审批中，请勿重复提交");
        }
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

        // 4. 保存变更前的原始快照
        RevisionDiffResponse.DemandSnapshot originalSnapshot = new RevisionDiffResponse.DemandSnapshot();
        originalSnapshot.setStartDate(demand.getStartDate());
        originalSnapshot.setEndDate(demand.getEndDate());
        originalSnapshot.setProduct(demand.getProduct());
        originalSnapshot.setVersion(demand.getVersion());
        originalSnapshot.setVersionType(demand.getVersionType());
        originalSnapshot.setVersionPhase(demand.getVersionPhase());
        originalSnapshot.setPriority(demand.getPriority());
        originalSnapshot.setConfidential(demand.getConfidential());
        originalSnapshot.setDescription(demand.getDescription());
        originalSnapshot.setTestDeviceCount(demand.getTestDeviceCount());
        originalSnapshot.setManpowerDemand(demand.getManpowerDemand());
        originalSnapshot.setManpowerDetails(new ArrayList<>(demand.getManpowerDetails()));
        originalSnapshot.setSpecialModuleDemands(new ArrayList<>(demand.getSpecialModuleDemands()));

        // 5. 自动删除周期外和超额排班
        List<Schedule> deletedSchedules = deleteExcessSchedules(
            id, request.getStartDate(), request.getEndDate(),
            requestedDetails, requestedSpecials, allSchedules);

        // 5. 更新需求字段
        demand.setStartDate(request.getStartDate());
        demand.setEndDate(request.getEndDate());
        demand.setManpowerDemand(computeTotalManpower(requestedDetails));
        if (request.getProduct() != null) demand.setProduct(request.getProduct());
        if (request.getVersion() != null) demand.setVersion(request.getVersion());
        if (request.getVersionType() != null) demand.setVersionType(request.getVersionType());
        if (request.getVersionPhase() != null) demand.setVersionPhase(request.getVersionPhase());
        if (request.getPriority() != null) demand.setPriority(request.getPriority());
        if (request.getConfidential() != null) demand.setConfidential(request.getConfidential());
        if (request.getDescription() != null) demand.setDescription(request.getDescription());
        if (request.getTestDeviceCount() != null) demand.setTestDeviceCount(request.getTestDeviceCount());

        // 6. 更新人力详情和专项模块
        replaceDetails(id, requestedDetails);
        specialModuleService.replaceForDemand(id, requestedDetails, requestedSpecials);

        // 7. 状态变更为 revision_pending
        demand.setStatus(TestDemand.DemandStatus.revision_pending);
        demand.setSubmittedBy(requireSubmitter(submittedBy));

        // 7.1 保存原始快照和删除的排班信息到数据库
        demand.setRevisionOriginalSnapshot(serializeSnapshot(originalSnapshot));
        demand.setRevisionDeletedSchedules(serializeDeletedSchedules(deletedSchedules));

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

        // 构建变更对比响应
        RevisionDiffResponse response = new RevisionDiffResponse();
        response.setDemandId(id);
        response.setStatus(demand.getStatus());
        response.setSubmittedBy(demand.getSubmittedBy());
        response.setSubmittedAt(demand.getUpdatedAt());

        // 原始快照（从数据库存储的 JSON 反序列化）
        RevisionDiffResponse.DemandSnapshot original =
            deserializeSnapshot(demand.getRevisionOriginalSnapshot());
        response.setOriginal(original);

        // 当前（修改后的）快照
        RevisionDiffResponse.DemandSnapshot modified = new RevisionDiffResponse.DemandSnapshot();
        modified.setStartDate(demand.getStartDate());
        modified.setEndDate(demand.getEndDate());
        modified.setManpowerDemand(demand.getManpowerDemand());
        modified.setManpowerDetails(demand.getManpowerDetails());
        modified.setSpecialModuleDemands(demand.getSpecialModuleDemands());
        response.setModified(modified);

        // 计算变更字段差异
        response.setChanges(computeChanges(original, modified));

        // 反序列化被删除的排班信息
        response.setDeletedSchedules(
            deserializeDeletedSchedules(demand.getRevisionDeletedSchedules()));

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
        if (demand.getSubmittedBy() != null) {
            testStaffRepository.findByEmpNo(demand.getSubmittedBy())
                .ifPresent(staff -> demand.setSubmittedByName(staff.getName()));
        }
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

        // 批量查询提交人姓名
        List<String> empNos = demands.stream()
            .map(TestDemand::getSubmittedBy)
            .filter(Objects::nonNull)
            .distinct()
            .toList();
        Map<String, String> empNameMap = empNos.isEmpty()
            ? Map.of()
            : testStaffRepository.findByEmpNoIn(empNos).stream()
                .collect(Collectors.toMap(
                    com.testscheduling.entity.TestStaff::getEmpNo,
                    com.testscheduling.entity.TestStaff::getName,
                    (a, b) -> a));

        demands.forEach(demand -> {
            applyEnrichment(
                demand,
                detailsByDemand.getOrDefault(demand.getId(), List.of()),
                specialsByDemand.getOrDefault(demand.getId(), List.of()),
                fulfillmentByDemand.get(demand.getId()));
            if (demand.getSubmittedBy() != null) {
                demand.setSubmittedByName(empNameMap.getOrDefault(demand.getSubmittedBy(), demand.getSubmittedBy()));
            }
        });
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

    // ========== 变更快照序列化/反序列化 ==========

    private String serializeSnapshot(RevisionDiffResponse.DemandSnapshot snapshot) {
        try {
            return objectMapper.writeValueAsString(snapshot);
        } catch (JsonProcessingException e) {
            throw new BusinessException("SERIALIZATION_ERROR", "保存变更快照失败");
        }
    }

    private RevisionDiffResponse.DemandSnapshot deserializeSnapshot(String json) {
        if (json == null || json.isBlank()) {
            return new RevisionDiffResponse.DemandSnapshot();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (JsonProcessingException e) {
            return new RevisionDiffResponse.DemandSnapshot();
        }
    }

    private String serializeDeletedSchedules(List<Schedule> deleted) {
        try {
            List<Map<String, Object>> infoList = deleted.stream().map(s -> {
                Map<String, Object> info = new LinkedHashMap<>();
                info.put("id", s.getId());
                info.put("staffId", s.getStaffId());
                info.put("date", s.getDate() != null ? s.getDate().toString() : null);
                info.put("percentage", s.getPercentage());
                info.put("demandManpowerDetailId", s.getDemandManpowerDetailId());
                info.put("demandSpecialModuleId", s.getDemandSpecialModuleId());
                return info;
            }).toList();
            return objectMapper.writeValueAsString(infoList);
        } catch (JsonProcessingException e) {
            return "[]";
        }
    }

    private List<RevisionDiffResponse.DeletedScheduleInfo> deserializeDeletedSchedules(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            List<Map<String, Object>> rawList = objectMapper.readValue(
                json, new TypeReference<>() {});
            return rawList.stream().map(m -> {
                RevisionDiffResponse.DeletedScheduleInfo info = new RevisionDiffResponse.DeletedScheduleInfo();
                info.setId(toLong(m.get("id")));
                // 通过 staffId 查询人员名称
                Long staffId = toLong(m.get("staffId"));
                if (staffId != null) {
                    try {
                        var staff = testStaffRepository.findById(staffId);
                        info.setStaffName(staff.map(s -> s.getName()).orElse("未知"));
                    } catch (Exception e) {
                        info.setStaffName("未知");
                    }
                }
                String dateStr = (String) m.get("date");
                if (dateStr != null) {
                    info.setDate(java.time.LocalDate.parse(dateStr).atStartOfDay());
                }
                info.setPercentage(toInt(m.get("percentage")));
                info.setReason("变更导致排班超出范围或配额");
                return info;
            }).toList();
        } catch (JsonProcessingException e) {
            return List.of();
        }
    }

    private Long toLong(Object value) {
        if (value instanceof Number n) return n.longValue();
        if (value instanceof String s && !s.isBlank()) {
            try { return Long.parseLong(s); } catch (NumberFormatException e) { return null; }
        }
        return null;
    }

    private Integer toInt(Object value) {
        if (value instanceof Number n) return n.intValue();
        if (value instanceof String s && !s.isBlank()) {
            try { return Integer.parseInt(s); } catch (NumberFormatException e) { return null; }
        }
        return null;
    }

    private List<RevisionDiffResponse.FieldChange> computeChanges(
            RevisionDiffResponse.DemandSnapshot original,
            RevisionDiffResponse.DemandSnapshot modified) {
        List<RevisionDiffResponse.FieldChange> changes = new ArrayList<>();

        if (original == null || modified == null) {
            return changes;
        }

        // 比较测试周期
        if (!Objects.equals(original.getStartDate(), modified.getStartDate())) {
            changes.add(new RevisionDiffResponse.FieldChange(
                "测试开始日期",
                original.getStartDate() != null ? original.getStartDate().toLocalDate().toString() : null,
                modified.getStartDate() != null ? modified.getStartDate().toLocalDate().toString() : null));
        }
        if (!Objects.equals(original.getEndDate(), modified.getEndDate())) {
            changes.add(new RevisionDiffResponse.FieldChange(
                "测试结束日期",
                original.getEndDate() != null ? original.getEndDate().toLocalDate().toString() : null,
                modified.getEndDate() != null ? modified.getEndDate().toLocalDate().toString() : null));
        }

        // 比较总人力需求
        if (!Objects.equals(
                normalized(original.getManpowerDemand()),
                normalized(modified.getManpowerDemand()))) {
            changes.add(new RevisionDiffResponse.FieldChange(
                "总人力需求",
                original.getManpowerDemand() + " 人天",
                modified.getManpowerDemand() + " 人天"));
        }

        // 比较各测试类型的人力配额
        Map<String, BigDecimal> originalQuotas = new LinkedHashMap<>();
        if (original.getManpowerDetails() != null) {
            for (DemandManpowerDetail d : original.getManpowerDetails()) {
                originalQuotas.put(d.getTestType(), d.getManpowerDemand());
            }
        }
        Map<String, BigDecimal> modifiedQuotas = new LinkedHashMap<>();
        if (modified.getManpowerDetails() != null) {
            for (DemandManpowerDetail d : modified.getManpowerDetails()) {
                modifiedQuotas.put(d.getTestType(), d.getManpowerDemand());
            }
        }
        java.util.Set<String> allTestTypes = new java.util.LinkedHashSet<>(originalQuotas.keySet());
        allTestTypes.addAll(modifiedQuotas.keySet());
        for (String testType : allTestTypes) {
            BigDecimal oldVal = originalQuotas.get(testType);
            BigDecimal newVal = modifiedQuotas.get(testType);
            if (!Objects.equals(normalized(oldVal), normalized(newVal))) {
                changes.add(new RevisionDiffResponse.FieldChange(
                    testType + " 人力配额",
                    (oldVal != null ? oldVal + " 人天" : "无"),
                    (newVal != null ? newVal + " 人天" : "无")));
            }
        }

        return changes;
    }

}
