package com.testscheduling.service;

import com.testscheduling.dto.SchedulePreviewRequest;
import com.testscheduling.dto.SchedulePreviewResponse;
import com.testscheduling.dto.ScheduleRecommendationRequest;
import com.testscheduling.dto.ScheduleRecommendationResponse;
import com.testscheduling.entity.DemandManpowerDetail;
import com.testscheduling.entity.DemandSpecialModule;
import com.testscheduling.entity.Schedule;
import com.testscheduling.entity.StaffDailyStatus;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.entity.TestStaffModule;
import com.testscheduling.entity.TestStaffModuleId;
import com.testscheduling.entity.User;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.DemandManpowerDetailRepository;
import com.testscheduling.repository.DemandSpecialModuleRepository;
import com.testscheduling.repository.ScheduleRepository;
import com.testscheduling.repository.StaffDailyStatusRepository;
import com.testscheduling.repository.TestDemandRepository;
import com.testscheduling.repository.TestModuleConfigRepository;
import com.testscheduling.repository.TestStaffModuleRepository;
import com.testscheduling.repository.TestStaffRepository;
import com.testscheduling.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import jakarta.persistence.PessimisticLockException;
import org.hibernate.exception.LockAcquisitionException;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.concurrent.atomic.AtomicReference;

@Service
public class ScheduleRecommendationService {
    /** Maximum distinct demand IDs in one recommendation transaction. */
    static final int MAX_RECOMMENDATION_DEMANDS = 500;
    /** Keeps every derived IN query below common database parameter limits. */
    static final int BULK_QUERY_CHUNK_SIZE = 500;
    private static final BigDecimal STEP = new BigDecimal("0.1");
    private static final int STEP_PERCENT = 10;

    private final TestDemandRepository demandRepository;
    private final DemandManpowerDetailRepository detailRepository;
    private final DemandSpecialModuleRepository specialRepository;
    private final TestModuleConfigRepository moduleRepository;
    private final TestStaffRepository staffRepository;
    private final TestStaffModuleRepository staffModuleRepository;
    private final ScheduleRepository scheduleRepository;
    private final StaffDailyStatusRepository statusRepository;
    private final UserRepository userRepository;
    private final ScheduleEligibilityService eligibilityService;
    private final DemandFulfillmentService fulfillmentService;
    private final TransactionTemplate transactionTemplate;

    @Autowired
    public ScheduleRecommendationService(TestDemandRepository demandRepository,
            DemandManpowerDetailRepository detailRepository,
            DemandSpecialModuleRepository specialRepository,
            TestModuleConfigRepository moduleRepository,
            TestStaffRepository staffRepository,
            TestStaffModuleRepository staffModuleRepository,
            ScheduleRepository scheduleRepository,
            StaffDailyStatusRepository statusRepository,
            UserRepository userRepository,
            ScheduleEligibilityService eligibilityService,
            DemandFulfillmentService fulfillmentService,
            PlatformTransactionManager transactionManager) {
        this.demandRepository = demandRepository;
        this.detailRepository = detailRepository;
        this.specialRepository = specialRepository;
        this.moduleRepository = moduleRepository;
        this.staffRepository = staffRepository;
        this.staffModuleRepository = staffModuleRepository;
        this.scheduleRepository = scheduleRepository;
        this.statusRepository = statusRepository;
        this.userRepository = userRepository;
        this.eligibilityService = eligibilityService;
        this.fulfillmentService = fulfillmentService;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.transactionTemplate.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
    }

    public ScheduleRecommendationResponse recommend(ScheduleRecommendationRequest request) {
        validateRequest(request);
        AtomicReference<RuntimeException> concurrencyFailure = new AtomicReference<>();
        try {
            ScheduleRecommendationResponse result = transactionTemplate.execute(status -> {
                try {
                    return recommendInTransaction(request);
                } catch (RuntimeException error) {
                    if (hasConcurrencyCause(error)) {
                        concurrencyFailure.set(error);
                        status.setRollbackOnly();
                        throw new RecommendationConcurrencySignal();
                    }
                    throw error;
                }
            });
            if (concurrencyFailure.get() != null) throw dataChangedRetry();
            return result;
        } catch (RuntimeException error) {
            if (concurrencyFailure.get() != null || hasConcurrencyCause(error)) {
                throw dataChangedRetry();
            }
            throw error;
        }
    }

    @Transactional(readOnly = true)
    public SchedulePreviewResponse preview(SchedulePreviewRequest request) {
        List<Long> ids = request.getDemandIds().stream().distinct().sorted().toList();
        if (ids.isEmpty()) throw error("DEMAND_REQUIRED", "需求ID不能为空");
        List<TestDemand> demands = demandRepository.findAllById(ids);
        if (demands.size() != ids.size()) throw error("DEMAND_NOT_FOUND", "测试需求不存在");
        demands.forEach(eligibilityService::requireSchedulable);
        Map<Long, TestDemand> demandsById = demands.stream()
                .collect(Collectors.toMap(TestDemand::getId, Function.identity(), (a, b) -> a, LinkedHashMap::new));
        List<TestDemand> ordered = new ArrayList<>(demandsById.values());
        if (request.getDemandOrder() != null && !request.getDemandOrder().isEmpty()) {
            ordered.sort(demandOrderComparator(request.getDemandOrder()));
        } else {
            ordered.sort(demandComparator());
        }
        List<Long> sortOrder = ordered.stream().map(TestDemand::getId).toList();

        // Build date bounds
        LocalDate start, end;
        if (request.getMode() == SchedulePreviewRequest.Mode.FIXED_RANGE
                && request.getDateRange() != null) {
            start = request.getDateRange().startDate();
            end = request.getDateRange().endDate();
        } else {
            start = demands.stream()
                    .filter(d -> d.getStartDate() != null)
                    .map(d -> d.getStartDate().toLocalDate())
                    .min(LocalDate::compareTo).orElse(LocalDate.now());
            end = demands.stream()
                    .filter(d -> d.getEndDate() != null)
                    .map(d -> d.getEndDate().toLocalDate())
                    .max(LocalDate::compareTo).orElse(LocalDate.now().plusDays(30));
        }
        List<LocalDate> workingDays = new ArrayList<>();
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            int dow = d.getDayOfWeek().getValue();
            if (dow == 6 && !Boolean.TRUE.equals(request.getIncludeSaturdays())) continue;
            if (dow == 7 && !Boolean.TRUE.equals(request.getIncludeSundays())) continue;
            workingDays.add(d);
        }
        int totalDays = workingDays.size();
        if (totalDays == 0) {
            return new SchedulePreviewResponse(
                    ordered.stream().map(d -> new SchedulePreviewResponse.DemandPreview(
                            d.getId(), d.getProduct(), d.getVersion(), d.getPriority(),
                            d.getEndDate() != null ? d.getEndDate().toString() : null,
                            d.getManpowerDemand() != null ? d.getManpowerDemand() : BigDecimal.ZERO,
                            BigDecimal.ZERO, d.getManpowerDemand() != null ? d.getManpowerDemand() : BigDecimal.ZERO,
                            false, List.of())).toList(),
                    List.of(), sortOrder, BigDecimal.ZERO, BigDecimal.ZERO);
        }

        // Load staff and details
        List<DemandManpowerDetail> details = detailRepository.findByDemandIdIn(ids);
        Map<Long, List<DemandManpowerDetail>> detailsByDemand = details.stream()
                .collect(Collectors.groupingBy(DemandManpowerDetail::getDemandId));
        List<TestStaff> activeStaff = staffRepository.findByStatus(TestStaff.StaffStatus.active);
        Set<Long> excluded = request.getExcludedStaffIds() == null ? Set.of()
                : new HashSet<>(request.getExcludedStaffIds());
        List<TestStaff> staff = activeStaff.stream()
                .filter(s -> !excluded.contains(s.getId()))
                .sorted(Comparator.comparing(TestStaff::getId, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();

        // 加载 User 用于角色过滤
        {
            List<String> roleFilterUsernames = staff.stream().map(TestStaff::getEmpNo)
                    .filter(Objects::nonNull).distinct().sorted().toList();
            Map<String, User> roleFilterUsers = fetchChunks(roleFilterUsernames, userRepository::findByUsernameIn)
                    .stream().collect(Collectors.toMap(User::getUsername, Function.identity()));
            // 仅保留角色为"测试执行人员"的人员
            staff = filterByTestExecutorRole(staff, roleFilterUsers);
        }

        // Calculate total capacity by test type
        Map<String, BigDecimal> poolByType = new HashMap<>();
        Map<String, Integer> headcountByType = new HashMap<>();
        for (TestStaff s : staff) {
            String tt = s.getTestType();
            if (tt == null || tt.isEmpty()) continue;
            BigDecimal coeff = s.getCurrentCoefficient() != null ? s.getCurrentCoefficient() : BigDecimal.ONE;
            poolByType.merge(tt, coeff.multiply(BigDecimal.valueOf(totalDays)), BigDecimal::add);
            headcountByType.merge(tt, 1, Integer::sum);
        }
        BigDecimal totalStaffCapacity = poolByType.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);

        // Estimate per demand
        List<SchedulePreviewResponse.DemandPreview> previews = new ArrayList<>();
        BigDecimal totalDemandManpower = BigDecimal.ZERO;
        for (int i = 0; i < ordered.size(); i++) {
            TestDemand demand = ordered.get(i);
            List<DemandManpowerDetail> demandDetails = detailsByDemand.getOrDefault(demand.getId(), List.of());
            BigDecimal dmTotal = demand.getManpowerDemand() != null ? demand.getManpowerDemand() : BigDecimal.ZERO;
            totalDemandManpower = totalDemandManpower.add(dmTotal);
            BigDecimal estimatedAllocation = BigDecimal.ZERO;
            BigDecimal estimatedShortage = BigDecimal.ZERO;
            List<SchedulePreviewResponse.CompetingDemand> competing = new ArrayList<>();

            for (DemandManpowerDetail detail : demandDetails) {
                String tt = detail.getTestType();
                BigDecimal needed = detail.getManpowerDemand() != null ? detail.getManpowerDemand() : BigDecimal.ZERO;
                BigDecimal pool = poolByType.getOrDefault(tt, BigDecimal.ZERO);
                BigDecimal taken = needed.min(pool);
                estimatedAllocation = estimatedAllocation.add(taken);
                poolByType.put(tt, pool.subtract(taken));
                if (taken.compareTo(needed) < 0) {
                    BigDecimal shortfall = needed.subtract(taken);
                    estimatedShortage = estimatedShortage.add(shortfall);
                    // Find earlier demands that consumed this test type
                    for (int j = 0; j < i; j++) {
                        TestDemand earlier = ordered.get(j);
                        List<DemandManpowerDetail> earlierDetails = detailsByDemand.getOrDefault(earlier.getId(), List.of());
                        BigDecimal earlierTook = earlierDetails.stream()
                                .filter(ed -> tt.equals(ed.getTestType()))
                                .map(ed -> ed.getManpowerDemand() != null ? ed.getManpowerDemand() : BigDecimal.ZERO)
                                .reduce(BigDecimal.ZERO, BigDecimal::add)
                                .min(shortfall);
                        if (earlierTook.signum() > 0) {
                            competing.add(new SchedulePreviewResponse.CompetingDemand(
                                    earlier.getId(), earlier.getProduct(), earlier.getPriority(),
                                    tt, earlierTook,
                                    earlier.getProduct() + "(#" + (j + 1) + "，"+ earlier.getPriority() +"优先级)优先处理，占用了" + tt + "人员" + earlierTook + "人天"));
                        }
                    }
                }
            }
            boolean fulfilled = estimatedShortage.signum() <= 0;
            previews.add(new SchedulePreviewResponse.DemandPreview(
                    demand.getId(), demand.getProduct(), demand.getVersion(),
                    demand.getPriority(),
                    demand.getEndDate() != null ? demand.getEndDate().toString() : null,
                    dmTotal, estimatedAllocation, estimatedShortage, fulfilled, competing));
        }

        // Global warnings: test types with total shortage
        List<SchedulePreviewResponse.GlobalWarning> warnings = new ArrayList<>();
        for (String tt : headcountByType.keySet()) {
            BigDecimal total = details.stream()
                    .filter(d -> tt.equals(d.getTestType()))
                    .map(d -> d.getManpowerDemand() != null ? d.getManpowerDemand() : BigDecimal.ZERO)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal avail = BigDecimal.valueOf(headcountByType.getOrDefault(tt, 0))
                    .multiply(BigDecimal.valueOf(totalDays));
            if (total.compareTo(avail) > 0) {
                warnings.add(new SchedulePreviewResponse.GlobalWarning(
                        tt, total, avail, total.subtract(avail),
                        ordered.stream().filter(d -> detailsByDemand.getOrDefault(d.getId(), List.of())
                                .stream().anyMatch(dt -> tt.equals(dt.getTestType())))
                                .map(TestDemand::getId).toList()));
            }
        }

        return new SchedulePreviewResponse(previews, warnings, sortOrder, totalStaffCapacity, totalDemandManpower);
    }

    private ScheduleRecommendationResponse recommendInTransaction(ScheduleRecommendationRequest request) {
        List<Long> ids = request.getDemandIds().stream().distinct().sorted().toList();
        List<TestDemand> lockedDemands = demandRepository.findAllByIdInForUpdate(ids);
        requireAllRows(ids, lockedDemands.stream().map(TestDemand::getId).toList(),
                "DEMAND_NOT_FOUND", "测试需求不存在");
        lockedDemands.forEach(eligibilityService::requireSchedulable);
        Map<Long, TestDemand> demandsById = lockedDemands.stream()
                .collect(Collectors.toMap(TestDemand::getId, Function.identity(), (left, right) -> left,
                        LinkedHashMap::new));
        if (Boolean.TRUE.equals(request.getReplaceExistingDrafts())) {
            scheduleRepository.deleteDraftsByDemandIdIn(ids);
        }
        List<TestDemand> demands = new ArrayList<>(demandsById.values());
        if (request.getDemandOrder() != null && !request.getDemandOrder().isEmpty()) {
            demands.sort(demandOrderComparator(request.getDemandOrder()));
        } else {
            demands.sort(demandComparator());
        }
        // Demand-scoped reads are bounded by MAX_RECOMMENDATION_DEMANDS.
        List<DemandManpowerDetail> details = detailRepository.findByDemandIdIn(ids);
        List<DemandSpecialModule> specials = specialRepository.findByDemandIdInOrderByDemandIdAscIdAsc(ids);
        Map<Long, List<DemandManpowerDetail>> detailsByDemand = details.stream()
                .collect(Collectors.groupingBy(DemandManpowerDetail::getDemandId));
        detailsByDemand.replaceAll((demandId, rows) -> orderDetails(rows));
        Map<Long, List<DemandSpecialModule>> specialsByDemand = specials.stream()
                .collect(Collectors.groupingBy(DemandSpecialModule::getDemandId));
        List<Long> moduleIds = specials.stream().map(DemandSpecialModule::getModuleId)
                .filter(Objects::nonNull).distinct().sorted().toList();
        List<TestModuleConfig> lockedModules = fetchChunks(moduleIds, moduleRepository::findAllByIdInForUpdate);
        requireAllRows(moduleIds, lockedModules.stream().map(TestModuleConfig::getId).toList(),
                "MODULE_NOT_FOUND", "特殊模块不存在");
        Map<Long, TestModuleConfig> modules = lockedModules.stream()
                .collect(Collectors.toMap(TestModuleConfig::getId, Function.identity()));
        validateSpecialStructure(demands, detailsByDemand, specialsByDemand, modules);

        List<Schedule> existing = scheduleRepository.findByDemandIdIn(ids).stream()
                .filter(s -> !Boolean.TRUE.equals(request.getReplaceExistingDrafts())
                        || Boolean.TRUE.equals(s.getPublished()))
                .collect(Collectors.toCollection(ArrayList::new));
        List<TestStaff> activeSnapshot = staffRepository.findByStatus(TestStaff.StaffStatus.active);
        Set<Long> excluded = ids(request.getExcludedStaffIds());
        Set<Long> fixed = ids(request.getFixedStaffIds());
        List<Long> staffIds = activeSnapshot.stream().map(TestStaff::getId)
                .filter(Objects::nonNull).filter(id -> !excluded.contains(id)).distinct().sorted().toList();
        List<TestStaff> staff = fetchChunks(staffIds, staffRepository::findAllByIdInForUpdate);
        requireAllRows(staffIds, staff.stream().map(TestStaff::getId).toList(),
                "STAFF_NOT_FOUND", "测试人员不存在");
        staff = staff.stream().filter(s -> s.getStatus() == TestStaff.StaffStatus.active)
                .sorted(Comparator.comparing(TestStaff::getId, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
        Map<Long, TestStaff> staffById = staff.stream().collect(Collectors.toMap(TestStaff::getId, Function.identity()));
        List<Long> lockedStaffIds;
        List<String> usernames = staff.stream().map(TestStaff::getEmpNo)
                .filter(Objects::nonNull).distinct().sorted().toList();
        Map<String, User> users = fetchChunks(usernames, userRepository::findByUsernameIn).stream()
                .collect(Collectors.toMap(User::getUsername, Function.identity()));
        // 仅保留角色为"测试执行人员"的人员（多角色排除）
        staff = filterByTestExecutorRole(staff, users);
        staffById = staff.stream().collect(Collectors.toMap(TestStaff::getId, Function.identity()));
        lockedStaffIds = new ArrayList<>(staffById.keySet());
        Set<TestStaffModuleId> familiar = fetchChunks(lockedStaffIds,
                staffModuleRepository::findByIdStaffIdInOrderByIdStaffIdAscIdModuleIdAsc)
                .stream().map(TestStaffModule::getId).collect(Collectors.toSet());
        DateBounds bounds = bounds(request, demands);
        Map<Long, List<Schedule>> allByStaff = new HashMap<>();
        if (bounds.start != null) {
            fetchChunks(lockedStaffIds, chunk -> scheduleRepository.findByStaffIdInAndDateBetween(
                    chunk, bounds.start, bounds.end))
                    .forEach(s -> allByStaff.computeIfAbsent(s.getStaffId(), ignored -> new ArrayList<>()).add(s));
        }
        List<StaffDailyStatus> statuses = bounds.start == null ? List.of()
                : fetchChunks(lockedStaffIds, chunk -> statusRepository.findByStaffIdInAndDateBetween(
                        chunk, bounds.start, bounds.end));
        Map<String, StaffDailyStatus> statusByDate = statuses.stream().collect(Collectors.toMap(
                s -> key(s.getStaffId(), s.getDate()), Function.identity(), (a, b) -> a));
        List<Schedule> generated = new ArrayList<>();
        Map<Long, List<GapDraft>> specialGapsByDemand = new HashMap<>();
        Map<Long, List<GapDraft>> generalGapsByDemand = new HashMap<>();

        // Phase 1 is global so general work from an earlier demand cannot consume a
        // candidate needed by a later demand's special module bucket.
        for (TestDemand demand : demands) {
            List<DemandManpowerDetail> demandDetails = detailsByDemand.getOrDefault(demand.getId(), List.of());
            List<DemandSpecialModule> demandSpecials = sortedSpecials(
                    specialsByDemand.getOrDefault(demand.getId(), List.of()), existing, generated);
            for (DemandSpecialModule special : demandSpecials) {
                DemandManpowerDetail detail = demandDetails.stream().filter(d ->
                        Objects.equals(d.getTestType(), module(special, modules).getTestType())).findFirst().orElseThrow();
                GapDraft gap = request.getAllocationStrategy() == ScheduleRecommendationRequest.AllocationStrategy.CONCENTRATE
                        ? allocatePersonFirst(demand, detail, special,
                                remainingSpecial(special, existing, generated), fixed, staff, familiar, users,
                                allByStaff, statusByDate, generated, request)
                        : allocate(demand, detail, special,
                                remainingSpecial(special, existing, generated), fixed, staff, familiar, users,
                                allByStaff, statusByDate, generated, request);
                if (gap != null) specialGapsByDemand.computeIfAbsent(demand.getId(), ignored -> new ArrayList<>()).add(gap);
            }
        }
        // Phase 2 handles all general buckets only after every special bucket ran.
        for (TestDemand demand : demands) {
            List<DemandManpowerDetail> demandDetails = detailsByDemand.getOrDefault(demand.getId(), List.of());
            List<DemandSpecialModule> demandSpecials = specialsByDemand.getOrDefault(demand.getId(), List.of());
            for (DemandManpowerDetail detail : demandDetails) {
                BigDecimal specialTotal = demandSpecials.stream().filter(s ->
                        Objects.equals(module(s, modules).getTestType(), detail.getTestType()))
                        .map(DemandSpecialModule::getManpowerDemand).reduce(BigDecimal.ZERO, BigDecimal::add);
                BigDecimal remaining = value(detail.getManpowerDemand()).subtract(specialTotal)
                        .subtract(allocated(detail.getId(), null, existing, generated));
                GapDraft gap = request.getAllocationStrategy() == ScheduleRecommendationRequest.AllocationStrategy.CONCENTRATE
                        ? allocatePersonFirst(demand, detail, null, remaining, fixed, staff, familiar,
                                users, allByStaff, statusByDate, generated, request)
                        : allocate(demand, detail, null, remaining, fixed, staff, familiar,
                                users, allByStaff, statusByDate, generated, request);
                if (gap != null) generalGapsByDemand.computeIfAbsent(demand.getId(), ignored -> new ArrayList<>()).add(gap);
            }
        }
        if (!generated.isEmpty()) validateGenerated(generated);
        List<Schedule> persisted = generated.isEmpty() ? List.of() : scheduleRepository.saveAllAndFlush(generated);
        Map<Long, com.testscheduling.dto.DemandFulfillmentResponse> authoritative =
                fulfillmentService.calculateBatch(demands, detailsByDemand, specialsByDemand);
        // Build per-demand per-testType allocation map from generated schedules
        Map<Long, Map<String, BigDecimal>> allocatedByType = buildAllocatedByType(
                generated, detailsByDemand);
        int totalDemands = demands.size();
        List<ScheduleRecommendationResponse.Fulfillment> fulfillment = new ArrayList<>();
        for (int i = 0; i < demands.size(); i++) {
            TestDemand demand = demands.get(i);
            int processOrder = i + 1;
            List<GapDraft> specialGaps = specialGapsByDemand.getOrDefault(demand.getId(), List.of());
            List<GapDraft> generalGaps = generalGapsByDemand.getOrDefault(demand.getId(), List.of());
            com.testscheduling.dto.DemandFulfillmentResponse calculated = authoritative.get(demand.getId());
            List<ScheduleRecommendationResponse.ContestedResource> contestedResources = List.of();
            if (!calculated.fullySatisfied()) {
                contestedResources = computeContestedResources(
                        demand, i, demands, detailsByDemand, allocatedByType);
            }
            fulfillment.add(new ScheduleRecommendationResponse.Fulfillment(
                    demand.getId(), calculated.fullySatisfied(),
                    calculated.requiresHistoricalClassification(),
                    toGaps(specialGaps), toGaps(generalGaps),
                    calculated.specialModules(), calculated.summary(),
                    calculated.totalRequired(), calculated.totalAllocated(), calculated.totalShortage(),
                    processOrder, totalDemands, demand.getPriority(), contestedResources));
        }
        return new ScheduleRecommendationResponse(persisted, fulfillment);
    }

    private GapDraft allocate(TestDemand demand, DemandManpowerDetail detail, DemandSpecialModule special,
            BigDecimal remaining, Set<Long> fixed, List<TestStaff> staff,
            Set<TestStaffModuleId> familiar, Map<String, User> users, Map<Long, List<Schedule>> allByStaff,
            Map<String, StaffDailyStatus> statuses, List<Schedule> generated,
            ScheduleRecommendationRequest request) {
        if (remaining.signum() <= 0) return null;
        if (dates(demand, request).isEmpty()) {
            return new GapDraft(detail == null ? null : detail.getId(), special == null ? null : special.getId(),
                    remaining, "INSUFFICIENT_CAPACITY");
        }
        boolean sawQualified = false;
        boolean sawDevice = false;
        String preferredLocation = request.getDemandOfficePreferences() != null
                ? request.getDemandOfficePreferences().get(demand.getId()) : null;
        List<LocalDate> allocationDates = dates(demand, request);
        for (LocalDate date : allocationDates) {
            while (remaining.compareTo(STEP) >= 0) {
                List<TestStaff> candidates = staff.stream().filter(candidate ->
                        special == null ? Objects.equals(candidate.getTestType(), detail.getTestType())
                                : familiar.contains(new TestStaffModuleId(candidate.getId(), special.getModuleId())))
                        .filter(candidate -> confidentiallyEligible(demand, candidate, users))
                        .sorted(candidateComparator(fixed, allocationDates, date, allByStaff, statuses, preferredLocation))
                        .toList();
                sawQualified |= !candidates.isEmpty();
                TestStaff chosen = null;
                for (TestStaff candidate : candidates) {
                    if (available(candidate, date, allByStaff, statuses) < STEP_PERCENT) continue;
                    if (deviceFull(demand, date, candidate, generated, allByStaff)) { sawDevice = true; continue; }
                    chosen = candidate; break;
                }
                if (chosen == null) {
                    // --- 诊断日志：记录 break 原因 ---
                    long skipAvail = 0, skipDevice = 0, passThrough = 0;
                    for (TestStaff candidate : candidates) {
                        if (available(candidate, date, allByStaff, statuses) < STEP_PERCENT)
                            skipAvail++;
                        else if (deviceFull(demand, date, candidate, generated, allByStaff))
                            skipDevice++;
                        else
                            passThrough++;
                    }
                    System.out.printf("[ALLOCATE-DIAG] demand=%d(%s) detail=%d date=%s remaining=%s candidates=%d skipAvail=%d skipDevice=%d pass=%d%n",
                            demand.getId(), demand.getProduct(),
                            detail != null ? detail.getId() : -1,
                            date, remaining.toPlainString(),
                            candidates.size(), skipAvail, skipDevice, passThrough);
                    // --- 诊断日志结束 ---
                    break;
                }
                int allocation = Math.min(100, Math.min(available(chosen, date, allByStaff, statuses),
                        remaining.multiply(BigDecimal.valueOf(100)).setScale(0, RoundingMode.FLOOR).intValue()));
                allocation = allocation - allocation % STEP_PERCENT;
                if (allocation < STEP_PERCENT) break;
                Schedule schedule = draft(demand, detail, special, chosen, date, allocation);
                generated.add(schedule);
                allByStaff.computeIfAbsent(chosen.getId(), ignored -> new ArrayList<>()).add(schedule);
                remaining = remaining.subtract(BigDecimal.valueOf(allocation)
                        .divide(BigDecimal.valueOf(100), 2, RoundingMode.UNNECESSARY));
            }
        }
        if (remaining.signum() <= 0) return null;
        String code = sawDevice ? "DEVICE_LIMIT_REACHED" : sawQualified ? "INSUFFICIENT_CAPACITY" : "NO_QUALIFIED_STAFF";
        return new GapDraft(detail == null ? null : detail.getId(), special == null ? null : special.getId(), remaining, code);
    }

    /**
     * Person-first allocation: iterate candidates (outer) then dates (inner).
     * Prefers staff with highest existing load, filling each to capacity before moving on.
     */
    private GapDraft allocatePersonFirst(TestDemand demand, DemandManpowerDetail detail,
            DemandSpecialModule special, BigDecimal remaining, Set<Long> fixed, List<TestStaff> staff,
            Set<TestStaffModuleId> familiar, Map<String, User> users, Map<Long, List<Schedule>> allByStaff,
            Map<String, StaffDailyStatus> statuses, List<Schedule> generated,
            ScheduleRecommendationRequest request) {
        if (remaining.signum() <= 0) return null;
        List<LocalDate> allocationDates = dates(demand, request);
        if (allocationDates.isEmpty()) {
            return new GapDraft(detail == null ? null : detail.getId(), special == null ? null : special.getId(),
                    remaining, "INSUFFICIENT_CAPACITY");
        }
        String preferredLocation = request.getDemandOfficePreferences() != null
                ? request.getDemandOfficePreferences().get(demand.getId()) : null;
        boolean sawQualified = false;
        boolean sawDevice = false;
        List<TestStaff> candidates = staff.stream().filter(candidate ->
                        special == null ? Objects.equals(candidate.getTestType(), detail.getTestType())
                                : familiar.contains(new TestStaffModuleId(candidate.getId(), special.getModuleId())))
                .filter(candidate -> confidentiallyEligible(demand, candidate, users))
                .sorted(candidateComparatorConcentrate(fixed, allocationDates, allByStaff, statuses, preferredLocation))
                .toList();
        sawQualified |= !candidates.isEmpty();
        for (TestStaff candidate : candidates) {
            if (remaining.compareTo(STEP) < 0) break;
            for (LocalDate date : allocationDates) {
                if (remaining.compareTo(STEP) < 0) break;
                if (available(candidate, date, allByStaff, statuses) < STEP_PERCENT) continue;
                if (deviceFull(demand, date, candidate, generated, allByStaff)) { sawDevice = true; continue; }
                int allocation = Math.min(100, Math.min(available(candidate, date, allByStaff, statuses),
                        remaining.multiply(BigDecimal.valueOf(100)).setScale(0, RoundingMode.FLOOR).intValue()));
                allocation = allocation - allocation % STEP_PERCENT;
                if (allocation < STEP_PERCENT) continue;
                Schedule schedule = draft(demand, detail, special, candidate, date, allocation);
                generated.add(schedule);
                allByStaff.computeIfAbsent(candidate.getId(), ignored -> new ArrayList<>()).add(schedule);
                remaining = remaining.subtract(BigDecimal.valueOf(allocation)
                        .divide(BigDecimal.valueOf(100), 2, RoundingMode.UNNECESSARY));
            }
        }
        if (remaining.signum() <= 0) return null;
        String code = sawDevice ? "DEVICE_LIMIT_REACHED" : sawQualified ? "INSUFFICIENT_CAPACITY" : "NO_QUALIFIED_STAFF";
        return new GapDraft(detail == null ? null : detail.getId(), special == null ? null : special.getId(), remaining, code);
    }

    /** Fixed staff IDs affect priority only after all eligibility filters pass.
     *  Office location preference: staff with same office location get priority.
     *  Per-date availability: staff with partial assignments today (less remaining)
     *  are filled first before completely idle staff; staff already at full capacity
     *  today are deprioritized to avoid wasted comparisons. */
    private Comparator<TestStaff> candidateComparator(Set<Long> fixed, List<LocalDate> dates,
            LocalDate date, Map<Long, List<Schedule>> schedules, Map<String, StaffDailyStatus> statuses,
            String preferredLocation) {
        return Comparator.comparing((TestStaff staff) -> !fixed.contains(staff.getId()))
                .thenComparing((TestStaff staff) -> preferredLocation != null
                        && !Objects.equals(staff.getOfficeLocation(), preferredLocation))
                .thenComparing((TestStaff staff) ->
                        available(staff, date, schedules, statuses) < STEP_PERCENT ? 1 : 0)
                .thenComparing((left, right) -> Integer.compare(
                        available(left, date, schedules, statuses), available(right, date, schedules, statuses)))
                .thenComparing((left, right) -> Integer.compare(
                        periodRemaining(right, dates, schedules, statuses),
                        periodRemaining(left, dates, schedules, statuses)))
                .thenComparing((left, right) -> Integer.compare(load(left, dates, schedules), load(right, dates, schedules)))
                .thenComparing(TestStaff::getId, Comparator.nullsLast(Comparator.naturalOrder()));
    }

    /** Concentrate strategy: prefer staff with highest existing load and least remaining
     *  period capacity to fill partially-booked staff first. */
    private Comparator<TestStaff> candidateComparatorConcentrate(Set<Long> fixed,
            List<LocalDate> dates, Map<Long, List<Schedule>> schedules,
            Map<String, StaffDailyStatus> statuses, String preferredLocation) {
        return Comparator.comparing((TestStaff staff) -> !fixed.contains(staff.getId()))
                .thenComparing((TestStaff staff) -> preferredLocation != null
                        && !Objects.equals(staff.getOfficeLocation(), preferredLocation))
                .thenComparing((left, right) -> Integer.compare(
                        periodRemaining(left, dates, schedules, statuses),
                        periodRemaining(right, dates, schedules, statuses)))
                .thenComparing((left, right) -> Integer.compare(
                        load(right, dates, schedules), load(left, dates, schedules)))
                .thenComparing(TestStaff::getId, Comparator.nullsLast(Comparator.naturalOrder()));
    }

    private int periodRemaining(TestStaff staff, List<LocalDate> dates,
            Map<Long, List<Schedule>> schedules, Map<String, StaffDailyStatus> statuses) {
        return dates.stream().mapToInt(date -> Math.max(0, available(staff, date, schedules, statuses))).sum();
    }

    private int load(TestStaff staff, List<LocalDate> dates, Map<Long, List<Schedule>> schedules) {
        Set<LocalDate> dateSet = new HashSet<>(dates);
        return schedules.getOrDefault(staff.getId(), List.of()).stream()
                .filter(schedule -> dateSet.contains(schedule.getDate()))
                .map(Schedule::getPercentage).filter(Objects::nonNull).mapToInt(Integer::intValue).sum();
    }

    private void validateGenerated(List<Schedule> generated) {
        ScheduleEligibilityService.ValidationContext context = eligibilityService.prepareContext(generated);
        for (Schedule schedule : generated) {
            eligibilityService.validate(schedule, null, context);
            context.addSchedule(schedule);
        }
    }

    private List<DemandSpecialModule> sortedSpecials(List<DemandSpecialModule> specials,
            List<Schedule> existing, List<Schedule> generated) {
        Map<Long, BigDecimal> remaining = specials.stream().collect(Collectors.toMap(
                DemandSpecialModule::getId,
                special -> remainingSpecial(special, existing, generated)));
        return orderSpecials(specials, remaining);
    }

    static List<DemandManpowerDetail> orderDetails(List<DemandManpowerDetail> details) {
        return details.stream().sorted(Comparator
                .comparing(DemandManpowerDetail::getTestType, Comparator.nullsFirst(Comparator.naturalOrder()))
                .thenComparing(DemandManpowerDetail::getId, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
    }

    static List<DemandSpecialModule> orderSpecials(List<DemandSpecialModule> specials,
            Map<Long, BigDecimal> remainingById) {
        return specials.stream().sorted(Comparator
                .comparing((DemandSpecialModule special) -> remainingById.getOrDefault(
                        special.getId(), BigDecimal.ZERO), Comparator.reverseOrder())
                .thenComparing(DemandSpecialModule::getId, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
    }

    private void validateSpecialStructure(List<TestDemand> demands,
            Map<Long, List<DemandManpowerDetail>> detailsByDemand,
            Map<Long, List<DemandSpecialModule>> specialsByDemand,
            Map<Long, TestModuleConfig> modules) {
        for (TestDemand demand : demands) {
            List<DemandManpowerDetail> details = detailsByDemand.getOrDefault(demand.getId(), List.of());
            for (DemandSpecialModule special : specialsByDemand.getOrDefault(demand.getId(), List.of())) {
                TestModuleConfig module = module(special, modules);
                boolean matchingDetail = details.stream().anyMatch(detail ->
                        Objects.equals(detail.getTestType(), module.getTestType()));
                if (!matchingDetail) {
                    throw error("DEMAND_MANPOWER_STRUCTURE_INVALID",
                            "特殊模块所属测试类型不在需求人力明细中");
                }
            }
        }
    }

    private BusinessException dataChangedRetry() {
        return error("DATA_CHANGED_RETRY", "排班数据已变化，请刷新后重试");
    }

    private static final class RecommendationConcurrencySignal extends RuntimeException {
        private static final long serialVersionUID = 1L;
    }

    private boolean hasConcurrencyCause(Throwable error) {
        Throwable current = error;
        while (current != null) {
            if (current instanceof ConcurrencyFailureException) return true;
            if (current instanceof PessimisticLockException
                    || current instanceof LockAcquisitionException) return true;
            if (current instanceof SQLException sql && "50200".equals(sql.getSQLState())) return true;
            current = current.getCause();
        }
        return false;
    }

    private Schedule draft(TestDemand demand, DemandManpowerDetail detail, DemandSpecialModule special,
            TestStaff staff, LocalDate date, int allocation) {
        Schedule schedule = new Schedule();
        schedule.setDemandId(demand.getId());
        schedule.setStaffId(staff.getId());
        schedule.setDate(date);
        schedule.setPercentage(allocation);
        schedule.setDemandManpowerDetailId(detail.getId());
        schedule.setDemandSpecialModuleId(special == null ? null : special.getId());
        schedule.setProduct(demand.getProduct());
        schedule.setVersion(demand.getVersion());
        schedule.setVersionType(demand.getVersionType());
        schedule.setTestManager(demand.getSubmittedBy());
        schedule.setPublished(false);
        return schedule;
    }

    private BigDecimal remainingSpecial(DemandSpecialModule special, List<Schedule> existing, List<Schedule> generated) {
        return value(special.getManpowerDemand()).subtract(allocated(special.getId(), special.getId(), existing, generated));
    }

    private BigDecimal allocated(Long detailId, Long specialId, List<Schedule> existing, List<Schedule> generated) {
        return java.util.stream.Stream.concat(existing.stream(), generated.stream()).filter(s ->
                specialId == null ? Objects.equals(detailId, s.getDemandManpowerDetailId()) && s.getDemandSpecialModuleId() == null
                        : Objects.equals(specialId, s.getDemandSpecialModuleId()))
                .map(Schedule::getPercentage).filter(Objects::nonNull)
                .map(p -> BigDecimal.valueOf(p).divide(BigDecimal.valueOf(100), 2, RoundingMode.UNNECESSARY))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private int available(TestStaff staff, LocalDate date, Map<Long, List<Schedule>> schedules,
            Map<String, StaffDailyStatus> statuses) {
        BigDecimal coefficient = staff.getCurrentCoefficient() == null ? BigDecimal.ONE : staff.getCurrentCoefficient();
        StaffDailyStatus status = statuses.get(key(staff.getId(), date));
        BigDecimal unavailable = Optional.ofNullable(status)
                .filter(value -> value.getStatus() != StaffDailyStatus.DailyAvailabilityStatus.AVAILABLE)
                .map(StaffDailyStatus::getPercentage).map(value -> value == null ? BigDecimal.ZERO : BigDecimal.valueOf(value))
                .orElse(BigDecimal.ZERO).max(BigDecimal.ZERO).min(BigDecimal.valueOf(100));
        BigDecimal factor = BigDecimal.ONE.subtract(unavailable.divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP));
        int total = schedules.getOrDefault(staff.getId(), List.of()).stream().filter(s -> date.equals(s.getDate()))
                .map(Schedule::getPercentage).filter(Objects::nonNull).mapToInt(Integer::intValue).sum();
        return coefficient.multiply(BigDecimal.valueOf(100)).multiply(factor).setScale(0, RoundingMode.FLOOR).intValue() - total;
    }

    private boolean deviceFull(TestDemand demand, LocalDate date, TestStaff candidate, List<Schedule> generated,
            Map<Long, List<Schedule>> allByStaff) {
        if (demand.getTestDeviceCount() == null || demand.getTestDeviceCount() <= 0) return false;
        Set<Long> staffIds = new HashSet<>();
        allByStaff.values().stream().flatMap(Collection::stream).filter(s -> demand.getId().equals(s.getDemandId()) && date.equals(s.getDate()))
                .forEach(s -> staffIds.add(s.getStaffId()));
        generated.stream().filter(s -> demand.getId().equals(s.getDemandId()) && date.equals(s.getDate()))
                .forEach(s -> staffIds.add(s.getStaffId()));
        return !staffIds.contains(candidate.getId()) && staffIds.size() >= demand.getTestDeviceCount();
    }

    private boolean confidentiallyEligible(TestDemand demand, TestStaff staff, Map<String, User> users) {
        return !Boolean.TRUE.equals(demand.getConfidential()) || (users.get(staff.getEmpNo()) != null
                && Boolean.TRUE.equals(users.get(staff.getEmpNo()).getConfidentialClearance()));
    }

    private List<LocalDate> dates(TestDemand demand, ScheduleRecommendationRequest request) {
        if (demand.getStartDate() == null || demand.getEndDate() == null
                || demand.getStartDate().toLocalDate().isAfter(demand.getEndDate().toLocalDate())) return List.of();
        LocalDate demandStart = demand.getStartDate().toLocalDate();
        LocalDate demandEnd = demand.getEndDate().toLocalDate();
        DateBounds requested = request.getMode() == ScheduleRecommendationRequest.Mode.FIXED_RANGE
                ? new DateBounds(request.getDateRange().startDate(), request.getDateRange().endDate())
                : new DateBounds(demandStart, demandEnd);
        DateBounds bounds = new DateBounds(requested.start.isAfter(demandStart) ? requested.start : demandStart,
                requested.end.isBefore(demandEnd) ? requested.end : demandEnd);
        if (bounds.start.isAfter(bounds.end)) return List.of();
        List<LocalDate> dates = new ArrayList<>();
        for (LocalDate date = bounds.start; !date.isAfter(bounds.end); date = date.plusDays(1)) {
            if (date.getDayOfWeek().getValue() == 6 && !Boolean.TRUE.equals(request.getIncludeSaturdays())) continue;
            if (date.getDayOfWeek().getValue() == 7 && !Boolean.TRUE.equals(request.getIncludeSundays())) continue;
            dates.add(date);
        }
        return dates;
    }

    private DateBounds bounds(ScheduleRecommendationRequest request, List<TestDemand> demands) {
        if (request.getMode() == ScheduleRecommendationRequest.Mode.FIXED_RANGE) {
            return new DateBounds(request.getDateRange().startDate(), request.getDateRange().endDate());
        }
        if (demands.stream().anyMatch(d -> d.getStartDate() == null || d.getEndDate() == null
                || d.getStartDate().toLocalDate().isAfter(d.getEndDate().toLocalDate())))
            throw error("INVALID_DATE_RANGE", "需求测试周期无效");
        return new DateBounds(demands.stream().map(d -> d.getStartDate().toLocalDate()).min(LocalDate::compareTo).orElse(null),
                demands.stream().map(d -> d.getEndDate().toLocalDate()).max(LocalDate::compareTo).orElse(null));
    }

    private TestModuleConfig module(DemandSpecialModule special, Map<Long, TestModuleConfig> modules) {
        TestModuleConfig module = modules.get(special.getModuleId());
        if (module == null) throw error("MODULE_NOT_FOUND", "特殊模块不存在");
        return module;
    }

    private Comparator<TestDemand> demandComparator() {
        return Comparator.comparingInt((TestDemand d) -> priority(d.getPriority())).reversed()
                .thenComparing(TestDemand::getEndDate, Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(TestDemand::getCreatedAt, Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(TestDemand::getId);
    }

    private Comparator<TestDemand> demandOrderComparator(List<Long> order) {
        Map<Long, Integer> rank = new HashMap<>();
        for (int i = 0; i < order.size(); i++) rank.put(order.get(i), i);
        return (a, b) -> {
            int ra = rank.getOrDefault(a.getId(), Integer.MAX_VALUE);
            int rb = rank.getOrDefault(b.getId(), Integer.MAX_VALUE);
            return Integer.compare(ra, rb);
        };
    }

    private Map<Long, Map<String, BigDecimal>> buildAllocatedByType(
            List<Schedule> schedules,
            Map<Long, List<DemandManpowerDetail>> detailsByDemand) {
        Map<Long, Map<String, BigDecimal>> result = new HashMap<>();
        for (Schedule s : schedules) {
            if (s.getPercentage() == null || s.getPercentage() <= 0) continue;
            Long demandId = s.getDemandId();
            List<DemandManpowerDetail> details = detailsByDemand.getOrDefault(demandId, List.of());
            String testType = details.stream()
                    .filter(d -> Objects.equals(d.getId(), s.getDemandManpowerDetailId()))
                    .findFirst().map(DemandManpowerDetail::getTestType).orElse(null);
            if (testType == null) continue;
            BigDecimal amount = BigDecimal.valueOf(s.getPercentage())
                    .divide(BigDecimal.valueOf(100), 2, RoundingMode.UNNECESSARY);
            result.computeIfAbsent(demandId, ignored -> new HashMap<>())
                    .merge(testType, amount, BigDecimal::add);
        }
        return result;
    }

    private List<ScheduleRecommendationResponse.ContestedResource> computeContestedResources(
            TestDemand demand, int index, List<TestDemand> allDemands,
            Map<Long, List<DemandManpowerDetail>> detailsByDemand,
            Map<Long, Map<String, BigDecimal>> allocatedByType) {
        List<ScheduleRecommendationResponse.ContestedResource> contested = new ArrayList<>();
        List<DemandManpowerDetail> myDetails = detailsByDemand.getOrDefault(demand.getId(), List.of());
        Set<String> myTypes = myDetails.stream().map(DemandManpowerDetail::getTestType)
                .filter(Objects::nonNull).collect(Collectors.toSet());
        for (int j = 0; j < index; j++) {
            TestDemand earlier = allDemands.get(j);
            Map<String, BigDecimal> earlierAlloc = allocatedByType.getOrDefault(earlier.getId(), Map.of());
            for (String testType : myTypes) {
                BigDecimal taken = earlierAlloc.getOrDefault(testType, BigDecimal.ZERO);
                if (taken.signum() > 0) {
                    contested.add(new ScheduleRecommendationResponse.ContestedResource(
                            earlier.getId(), earlier.getProduct(), earlier.getPriority(),
                            j + 1, testType, taken));
                }
            }
        }
        return contested;
    }

    private int priority(String priority) {
        if (priority == null) return 0;
        return switch (priority.toLowerCase()) { case "urgent", "high", "p0", "p1", "高" -> 3; case "medium", "p2", "中" -> 2; default -> 1; };
    }

    private void validateRequest(ScheduleRecommendationRequest request) {
        if (request == null || request.getMode() == null || request.getDemandIds() == null || request.getDemandIds().isEmpty())
            throw error("DEMAND_REQUIRED", "需求ID不能为空");
        if (request.getDemandIds().stream().anyMatch(Objects::isNull))
            throw error("DEMAND_REQUIRED", "需求ID不能为空");
        if (request.getFixedStaffIds() != null && request.getFixedStaffIds().stream().anyMatch(Objects::isNull))
            throw error("STAFF_REQUIRED", "人员ID不能为空");
        if (request.getExcludedStaffIds() != null && request.getExcludedStaffIds().stream().anyMatch(Objects::isNull))
            throw error("STAFF_REQUIRED", "人员ID不能为空");
        if (request.getMode() == ScheduleRecommendationRequest.Mode.FIXED_RANGE
                && (request.getDateRange() == null || request.getDateRange().startDate() == null
                || request.getDateRange().endDate() == null || request.getDateRange().startDate().isAfter(request.getDateRange().endDate())))
            throw error("INVALID_DATE_RANGE", "指定日期范围无效");
        if (request.getDemandIds().stream().distinct().count() > MAX_RECOMMENDATION_DEMANDS)
            throw error("RECOMMENDATION_SCOPE_TOO_LARGE", "一次推荐最多处理500个不同测试需求");
    }

    private Set<Long> ids(List<Long> values) { return values == null ? Set.of() : new HashSet<>(values); }
    private <I, O> List<O> fetchChunks(List<I> values, Function<List<I>, List<O>> query) {
        if (values.isEmpty()) return List.of();
        List<O> result = new ArrayList<>();
        for (int start = 0; start < values.size(); start += BULK_QUERY_CHUNK_SIZE) {
            int end = Math.min(start + BULK_QUERY_CHUNK_SIZE, values.size());
            result.addAll(query.apply(new ArrayList<>(values.subList(start, end))));
        }
        return result;
    }
    private void requireAllRows(List<Long> requested, List<Long> returned, String code, String message) {
        Set<Long> expected = new HashSet<>(requested);
        Set<Long> actual = new HashSet<>(returned);
        if (expected.size() != actual.size() || !expected.equals(actual)) throw error(code, message);
    }
    private BigDecimal value(BigDecimal value) { return value == null ? BigDecimal.ZERO : value; }
    private String key(Long staffId, LocalDate date) { return staffId + ":" + date; }
    private List<ScheduleRecommendationResponse.Gap> toGaps(List<GapDraft> gaps) { return gaps.stream().map(g ->
            new ScheduleRecommendationResponse.Gap(g.detailId, g.specialId, g.shortage, g.code, reason(g.code))).toList(); }
    private String reason(String code) { return switch (code) { case "NO_QUALIFIED_STAFF" -> "没有符合条件的人员"; case "DEVICE_LIMIT_REACHED" -> "超过测试设备限制"; default -> "可用人力容量不足"; }; }
    private BusinessException error(String code, String message) { return new BusinessException(code, message); }
    private record DateBounds(LocalDate start, LocalDate end) { }
    private record GapDraft(Long detailId, Long specialId, BigDecimal shortage, String code) { }

    private List<TestStaff> filterByTestExecutorRole(List<TestStaff> staff, Map<String, User> users) {
        return staff.stream().filter(s -> {
            User user = users.get(s.getEmpNo());
            if (user == null || user.getRoles() == null) return false;
            List<String> roles = user.getRoles();
            return roles.size() == 1 && "testExecutor".equals(roles.get(0));
        }).toList();
    }
}
