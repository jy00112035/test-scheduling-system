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
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
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
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class ScheduleRecommendationService {
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

    public ScheduleRecommendationService(TestDemandRepository demandRepository,
            DemandManpowerDetailRepository detailRepository,
            DemandSpecialModuleRepository specialRepository,
            TestModuleConfigRepository moduleRepository,
            TestStaffRepository staffRepository,
            TestStaffModuleRepository staffModuleRepository,
            ScheduleRepository scheduleRepository,
            StaffDailyStatusRepository statusRepository,
            UserRepository userRepository,
            ScheduleEligibilityService eligibilityService) {
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
    }

    @Transactional
    public ScheduleRecommendationResponse recommend(ScheduleRecommendationRequest request) {
        validateRequest(request);
        List<Long> ids = request.getDemandIds().stream().distinct().sorted().toList();
        Map<Long, TestDemand> demandsById = new LinkedHashMap<>();
        for (Long id : ids) {
            demandsById.put(id, demandRepository.findByIdForUpdate(id)
                    .orElseThrow(() -> error("DEMAND_NOT_FOUND", "测试需求不存在")));
        }
        try {
            if (Boolean.TRUE.equals(request.getReplaceExistingDrafts())) {
                ids.forEach(scheduleRepository::deleteByDemandIdAndPublishedFalse);
            }
            List<TestDemand> demands = new ArrayList<>(demandsById.values());
            demands.sort(demandComparator());
            List<DemandManpowerDetail> details = detailRepository.findByDemandIdIn(ids);
            List<DemandSpecialModule> specials = specialRepository.findByDemandIdInOrderByDemandIdAscIdAsc(ids);
            Map<Long, List<DemandManpowerDetail>> detailsByDemand = details.stream()
                    .collect(Collectors.groupingBy(DemandManpowerDetail::getDemandId));
            Map<Long, List<DemandSpecialModule>> specialsByDemand = specials.stream()
                    .collect(Collectors.groupingBy(DemandSpecialModule::getDemandId));
            Map<Long, TestModuleConfig> modules = moduleRepository.findAllById(specials.stream()
                    .map(DemandSpecialModule::getModuleId).filter(Objects::nonNull).distinct().toList())
                    .stream().collect(Collectors.toMap(TestModuleConfig::getId, Function.identity()));

            List<Schedule> existing = scheduleRepository.findByDemandIdIn(ids).stream()
                    .filter(s -> !Boolean.TRUE.equals(request.getReplaceExistingDrafts())
                            || Boolean.TRUE.equals(s.getPublished()))
                    .collect(Collectors.toCollection(ArrayList::new));
            List<TestStaff> staff = staffRepository.findByStatus(TestStaff.StaffStatus.active);
            Set<Long> excluded = ids(request.getExcludedStaffIds());
            Set<Long> fixed = ids(request.getFixedStaffIds());
            staff = staff.stream().filter(s -> !excluded.contains(s.getId())).toList();
            Map<Long, TestStaff> staffById = staff.stream().collect(Collectors.toMap(TestStaff::getId, Function.identity()));
            Set<TestStaffModuleId> familiar = staffModuleRepository
                    .findByIdStaffIdInOrderByIdStaffIdAscIdModuleIdAsc(new ArrayList<>(staffById.keySet()))
                    .stream().map(TestStaffModule::getId).collect(Collectors.toSet());
            Map<String, User> users = userRepository.findByUsernameIn(staff.stream().map(TestStaff::getEmpNo)
                    .filter(Objects::nonNull).toList()).stream()
                    .collect(Collectors.toMap(User::getUsername, Function.identity()));
            DateBounds bounds = bounds(request, demands);
            Map<Long, List<Schedule>> allByStaff = new HashMap<>();
            if (bounds.start != null) {
                scheduleRepository.findByStaffIdInAndDateBetween(new ArrayList<>(staffById.keySet()), bounds.start, bounds.end)
                        .forEach(s -> allByStaff.computeIfAbsent(s.getStaffId(), ignored -> new ArrayList<>()).add(s));
            }
            staff.stream().map(TestStaff::getId).sorted().forEach(staffId ->
                    staffRepository.findByIdForUpdate(staffId)
                            .orElseThrow(() -> error("STAFF_NOT_FOUND", "测试人员不存在")));
            List<StaffDailyStatus> statuses = bounds.start == null ? List.of()
                    : statusRepository.findByStaffIdInAndDateBetween(new ArrayList<>(staffById.keySet()), bounds.start, bounds.end);
            Map<String, StaffDailyStatus> statusByDate = statuses.stream().collect(Collectors.toMap(
                    s -> key(s.getStaffId(), s.getDate()), Function.identity(), (a, b) -> a));
            List<Schedule> generated = new ArrayList<>();
            List<ScheduleRecommendationResponse.Fulfillment> fulfillment = new ArrayList<>();
            for (TestDemand demand : demands) {
                List<DemandManpowerDetail> demandDetails = detailsByDemand.getOrDefault(demand.getId(), List.of());
                List<DemandSpecialModule> demandSpecials = specialsByDemand.getOrDefault(demand.getId(), List.of());
                List<GapDraft> specialGaps = new ArrayList<>();
                List<GapDraft> generalGaps = new ArrayList<>();
                for (DemandSpecialModule special : demandSpecials.stream()
                        .sorted(Comparator.comparing((DemandSpecialModule special) -> remainingSpecial(special, existing, generated),
                                Comparator.reverseOrder()).thenComparing(DemandSpecialModule::getId))
                        .toList()) {
                    DemandManpowerDetail detail = demandDetails.stream().filter(d ->
                            Objects.equals(d.getTestType(), module(special, modules).getTestType())).findFirst().orElse(null);
                    BigDecimal remaining = remainingSpecial(special, existing, generated);
                    GapDraft gap = allocate(demand, detail, special, remaining, fixed, staff,
                            familiar, users, allByStaff, statusByDate, generated, request);
                    if (gap != null) specialGaps.add(gap);
                }
                for (DemandManpowerDetail detail : demandDetails) {
                    BigDecimal specialTotal = demandSpecials.stream().filter(s ->
                            Objects.equals(module(s, modules).getTestType(), detail.getTestType()))
                            .map(DemandSpecialModule::getManpowerDemand).reduce(BigDecimal.ZERO, BigDecimal::add);
                    BigDecimal remaining = value(detail.getManpowerDemand()).subtract(specialTotal)
                            .subtract(allocated(detail.getId(), null, existing, generated));
                    GapDraft gap = allocate(demand, detail, null, remaining, fixed, staff,
                            familiar, users, allByStaff, statusByDate, generated, request);
                    if (gap != null) generalGaps.add(gap);
                }
                fulfillment.add(new ScheduleRecommendationResponse.Fulfillment(demand.getId(),
                        toGaps(specialGaps), toGaps(generalGaps)));
            }
            if (!generated.isEmpty()) validateGenerated(generated, existing);
            List<Schedule> persisted = generated.isEmpty() ? List.of() : scheduleRepository.saveAll(generated);
            return new ScheduleRecommendationResponse(persisted, fulfillment);
        } catch (OptimisticLockingFailureException e) {
            throw error("DATA_CHANGED_RETRY", "排班数据已变化，请刷新后重试");
        }
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
        for (LocalDate date : dates(demand, request)) {
            while (remaining.compareTo(STEP) >= 0) {
                List<TestStaff> candidates = staff.stream().filter(candidate ->
                        special == null ? Objects.equals(candidate.getTestType(), detail.getTestType())
                                : familiar.contains(new TestStaffModuleId(candidate.getId(), special.getModuleId())))
                        .filter(candidate -> confidentiallyEligible(demand, candidate, users))
                        .sorted(Comparator.comparing((TestStaff s) -> !fixed.contains(s.getId()))
                                .thenComparing(TestStaff::getId)).toList();
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

    private void validateGenerated(List<Schedule> generated, List<Schedule> existing) {
        ScheduleEligibilityService.ValidationContext context = eligibilityService.prepareContext(generated);
        existing.forEach(context::addSchedule);
        for (Schedule schedule : generated) {
            eligibilityService.validate(schedule, null, context);
            context.addSchedule(schedule);
        }
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
        BigDecimal factor = status == null || status.getStatus() == StaffDailyStatus.DailyAvailabilityStatus.AVAILABLE
                ? BigDecimal.ONE : BigDecimal.ONE.subtract(BigDecimal.valueOf(status.getPercentage()).divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP));
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
        if (request.getMode() == ScheduleRecommendationRequest.Mode.FIXED_RANGE
                && (request.getDateRange() == null || request.getDateRange().startDate() == null
                || request.getDateRange().endDate() == null || request.getDateRange().startDate().isAfter(request.getDateRange().endDate())))
            throw error("INVALID_DATE_RANGE", "指定日期范围无效");
    }

    private Set<Long> ids(List<Long> values) { return values == null ? Set.of() : new HashSet<>(values); }
    private BigDecimal value(BigDecimal value) { return value == null ? BigDecimal.ZERO : value; }
    private String key(Long staffId, LocalDate date) { return staffId + ":" + date; }
    private List<ScheduleRecommendationResponse.Gap> toGaps(List<GapDraft> gaps) { return gaps.stream().map(g ->
            new ScheduleRecommendationResponse.Gap(g.detailId, g.specialId, g.shortage, g.code, reason(g.code))).toList(); }
    private String reason(String code) { return switch (code) { case "NO_QUALIFIED_STAFF" -> "没有符合条件的人员"; case "DEVICE_LIMIT_REACHED" -> "超过测试设备限制"; default -> "可用人力容量不足"; }; }
    private BusinessException error(String code, String message) { return new BusinessException(code, message); }
    private record DateBounds(LocalDate start, LocalDate end) { }
    private record GapDraft(Long detailId, Long specialId, BigDecimal shortage, String code) { }
}
