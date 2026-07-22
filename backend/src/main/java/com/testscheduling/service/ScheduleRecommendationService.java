package com.testscheduling.service;

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

    private ScheduleRecommendationResponse recommendInTransaction(ScheduleRecommendationRequest request) {
        List<Long> ids = request.getDemandIds().stream().distinct().sorted().toList();
        List<TestDemand> lockedDemands = demandRepository.findAllByIdInForUpdate(ids);
        requireAllRows(ids, lockedDemands.stream().map(TestDemand::getId).toList(),
                "DEMAND_NOT_FOUND", "测试需求不存在");
        Map<Long, TestDemand> demandsById = lockedDemands.stream()
                .collect(Collectors.toMap(TestDemand::getId, Function.identity(), (left, right) -> left,
                        LinkedHashMap::new));
        if (Boolean.TRUE.equals(request.getReplaceExistingDrafts())) {
            scheduleRepository.deleteDraftsByDemandIdIn(ids);
        }
        List<TestDemand> demands = new ArrayList<>(demandsById.values());
        demands.sort(demandComparator());
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
        List<Long> lockedStaffIds = new ArrayList<>(staffById.keySet());
        Set<TestStaffModuleId> familiar = fetchChunks(lockedStaffIds,
                staffModuleRepository::findByIdStaffIdInOrderByIdStaffIdAscIdModuleIdAsc)
                .stream().map(TestStaffModule::getId).collect(Collectors.toSet());
        List<String> usernames = staff.stream().map(TestStaff::getEmpNo)
                .filter(Objects::nonNull).distinct().sorted().toList();
        Map<String, User> users = fetchChunks(usernames, userRepository::findByUsernameIn).stream()
                .collect(Collectors.toMap(User::getUsername, Function.identity()));
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
                GapDraft gap = allocate(demand, detail, special,
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
                GapDraft gap = allocate(demand, detail, null, remaining, fixed, staff, familiar,
                        users, allByStaff, statusByDate, generated, request);
                if (gap != null) generalGapsByDemand.computeIfAbsent(demand.getId(), ignored -> new ArrayList<>()).add(gap);
            }
        }
        if (!generated.isEmpty()) validateGenerated(generated);
        List<Schedule> persisted = generated.isEmpty() ? List.of() : scheduleRepository.saveAllAndFlush(generated);
        Map<Long, com.testscheduling.dto.DemandFulfillmentResponse> authoritative =
                fulfillmentService.calculateBatch(demands, detailsByDemand, specialsByDemand);
        List<ScheduleRecommendationResponse.Fulfillment> fulfillment = demands.stream().map(demand -> {
            List<GapDraft> specialGaps = specialGapsByDemand.getOrDefault(demand.getId(), List.of());
            List<GapDraft> generalGaps = generalGapsByDemand.getOrDefault(demand.getId(), List.of());
            com.testscheduling.dto.DemandFulfillmentResponse calculated = authoritative.get(demand.getId());
            return new ScheduleRecommendationResponse.Fulfillment(demand.getId(), calculated.fullySatisfied(),
                    calculated.requiresHistoricalClassification(),
                    toGaps(specialGaps), toGaps(generalGaps),
                    calculated.specialModules(), calculated.summary(),
                    calculated.totalRequired(), calculated.totalAllocated(), calculated.totalShortage());
        }).toList();
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
        List<LocalDate> allocationDates = dates(demand, request);
        for (LocalDate date : allocationDates) {
            while (remaining.compareTo(STEP) >= 0) {
                List<TestStaff> candidates = staff.stream().filter(candidate ->
                        special == null ? Objects.equals(candidate.getTestType(), detail.getTestType())
                                : familiar.contains(new TestStaffModuleId(candidate.getId(), special.getModuleId())))
                        .filter(candidate -> confidentiallyEligible(demand, candidate, users))
                        .sorted(candidateComparator(fixed, allocationDates, date, allByStaff, statuses))
                        .toList();
                sawQualified |= !candidates.isEmpty();
                TestStaff chosen = null;
                for (TestStaff candidate : candidates) {
                    if (available(candidate, date, allByStaff, statuses) < STEP_PERCENT) continue;
                    if (deviceFull(demand, date, candidate, generated, allByStaff)) { sawDevice = true; continue; }
                    chosen = candidate; break;
                }
                if (chosen == null) break;
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

    /** Fixed staff IDs affect priority only after all eligibility filters pass. */
    private Comparator<TestStaff> candidateComparator(Set<Long> fixed, List<LocalDate> dates,
            LocalDate date, Map<Long, List<Schedule>> schedules, Map<String, StaffDailyStatus> statuses) {
        return Comparator.comparing((TestStaff staff) -> !fixed.contains(staff.getId()))
                .thenComparing((left, right) -> Integer.compare(
                        periodRemaining(right, dates, schedules, statuses),
                        periodRemaining(left, dates, schedules, statuses)))
                .thenComparing((left, right) -> Integer.compare(
                        available(right, date, schedules, statuses), available(left, date, schedules, statuses)))
                .thenComparing((left, right) -> Integer.compare(load(left, dates, schedules), load(right, dates, schedules)))
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
}
