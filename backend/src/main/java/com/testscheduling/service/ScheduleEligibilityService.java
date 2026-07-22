package com.testscheduling.service;

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
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class ScheduleEligibilityService {

    private static final BigDecimal ONE_HUNDRED = new BigDecimal("100");
    private static final int BULK_QUERY_CHUNK_SIZE = 500;

    private final TestDemandRepository demandRepository;
    private final DemandManpowerDetailRepository detailRepository;
    private final DemandSpecialModuleRepository specialRepository;
    private final TestModuleConfigRepository moduleRepository;
    private final TestStaffRepository staffRepository;
    private final TestStaffModuleRepository staffModuleRepository;
    private final ScheduleRepository scheduleRepository;
    private final StaffDailyStatusRepository dailyStatusRepository;
    private final UserRepository userRepository;

    public ScheduleEligibilityService(
            TestDemandRepository demandRepository,
            DemandManpowerDetailRepository detailRepository,
            DemandSpecialModuleRepository specialRepository,
            TestModuleConfigRepository moduleRepository,
            TestStaffRepository staffRepository,
            TestStaffModuleRepository staffModuleRepository,
            ScheduleRepository scheduleRepository,
            StaffDailyStatusRepository dailyStatusRepository,
            UserRepository userRepository) {
        this.demandRepository = demandRepository;
        this.detailRepository = detailRepository;
        this.specialRepository = specialRepository;
        this.moduleRepository = moduleRepository;
        this.staffRepository = staffRepository;
        this.staffModuleRepository = staffModuleRepository;
        this.scheduleRepository = scheduleRepository;
        this.dailyStatusRepository = dailyStatusRepository;
        this.userRepository = userRepository;
    }

    public void validate(Schedule schedule, Long excludedScheduleId) {
        validateIdentifiers(schedule);
        validate(schedule, excludedScheduleId, prepareContext(List.of(schedule)));
    }

    public void validate(
            Schedule schedule, Long excludedScheduleId, ValidationContext context) {
        validateIdentifiers(schedule);
        TestDemand demand = context.demands.get(schedule.getDemandId());
        if (demand == null) {
            throw error("DEMAND_NOT_FOUND", "测试需求不存在");
        }
        TestStaff staff = context.staff.get(schedule.getStaffId());
        if (staff == null) {
            throw error("STAFF_NOT_FOUND", "测试人员不存在");
        }
        DemandManpowerDetail detail = context.details.get(schedule.getDemandManpowerDetailId());
        if (detail == null) {
            throw error("SCHEDULE_DETAIL_NOT_FOUND", "人力明细不存在");
        }
        validateDetailManpower(detail);

        DemandSpecialModule special = null;
        TestModuleConfig module = null;
        if (schedule.getDemandSpecialModuleId() != null) {
            special = context.specials.get(schedule.getDemandSpecialModuleId());
            if (special == null) {
                throw error("SPECIAL_MODULE_NOT_FOUND", "特殊模块人力明细不存在");
            }
            if (special.getModuleId() == null) {
                throw error("MODULE_REQUIRED", "特殊模块ID不能为空");
            }
            module = context.modules.get(special.getModuleId());
            if (module == null) {
                throw error("MODULE_NOT_FOUND", "特殊模块不存在");
            }
        }

        if (staff.getStatus() != TestStaff.StaffStatus.active) {
            throw error("STAFF_NOT_ACTIVE", "仅在职人员可以参与排班");
        }
        validateDate(schedule.getDate(), demand);
        if (!Objects.equals(detail.getDemandId(), demand.getId())) {
            throw error("SCHEDULE_DETAIL_DEMAND_MISMATCH", "人力明细不属于当前需求");
        }
        if (special != null) {
            validateSpecialEligibility(demand, detail, special, module, staff, context);
        } else if (!Objects.equals(detail.getTestType(), staff.getTestType())) {
            throw error("STAFF_TEST_TYPE_MISMATCH", "通用人力必须分配给相同测试类型人员");
        }

        validateConfidentialClearance(demand, staff, context);
        validatePercentage(schedule.getPercentage());
        validateDailyCapacity(schedule, staff, excludedScheduleId, context);
        List<Schedule> demandSchedules = withoutExcluded(context.schedules, excludedScheduleId).stream()
            .filter(existing -> Objects.equals(existing.getDemandId(), demand.getId()))
            .toList();
        validateDeviceCapacity(schedule, demand, demandSchedules);
        validateBucketCapacity(schedule, detail, special, demandSchedules, context);
    }

    public ValidationContext prepareContext(List<Schedule> input) {
        if (input == null || input.isEmpty()) {
            return new ValidationContext();
        }
        if (input.size() == 1) {
            return prepareSingleContext(input.get(0));
        }

        ValidationContext context = new ValidationContext();
        Set<Long> demandIds = input.stream().map(Schedule::getDemandId)
            .filter(Objects::nonNull).collect(Collectors.toSet());
        Set<Long> staffIds = input.stream().map(Schedule::getStaffId)
            .filter(Objects::nonNull).collect(Collectors.toSet());
        Set<Long> detailIds = input.stream().map(Schedule::getDemandManpowerDetailId)
            .filter(Objects::nonNull).collect(Collectors.toSet());
        Set<Long> specialIds = input.stream().map(Schedule::getDemandSpecialModuleId)
            .filter(Objects::nonNull).collect(Collectors.toSet());

        context.addDemands(fetchChunks(sorted(demandIds), demandRepository::findAllById));
        context.addStaff(fetchChunks(sorted(staffIds), staffRepository::findAllById));
        context.addDetails(fetchChunks(sorted(detailIds), detailRepository::findAllById));
        context.addSpecials(fetchChunks(sorted(demandIds),
            specialRepository::findByDemandIdInOrderByDemandIdAscIdAsc));
        Set<Long> moduleIds = context.specials.values().stream()
            .map(DemandSpecialModule::getModuleId).filter(Objects::nonNull).collect(Collectors.toSet());
        context.addModules(fetchChunks(sorted(moduleIds), moduleRepository::findAllById));
        context.addStaffModules(fetchChunks(sorted(staffIds),
            staffModuleRepository::findByIdStaffIdInOrderByIdStaffIdAscIdModuleIdAsc));
        context.addUsers(fetchChunks(context.staff.values().stream()
            .map(TestStaff::getEmpNo).filter(Objects::nonNull).distinct().sorted().toList(),
            userRepository::findByUsernameIn));

        List<Schedule> existing = new ArrayList<>(fetchChunks(sorted(demandIds),
            scheduleRepository::findByDemandIdIn));
        LocalDate start = input.stream().map(Schedule::getDate).filter(Objects::nonNull)
            .min(LocalDate::compareTo).orElse(null);
        LocalDate end = input.stream().map(Schedule::getDate).filter(Objects::nonNull)
            .max(LocalDate::compareTo).orElse(null);
        if (!staffIds.isEmpty() && start != null && end != null) {
            existing.addAll(fetchChunks(sorted(staffIds), chunk ->
                scheduleRepository.findByStaffIdInAndDateBetween(chunk, start, end)));
            context.addStatuses(fetchChunks(sorted(staffIds), chunk ->
                dailyStatusRepository.findByStaffIdInAndDateBetween(chunk, start, end)));
        }
        context.addSchedules(existing);
        context.calculateSpecialDemandTotals();
        return context;
    }

    private ValidationContext prepareSingleContext(Schedule schedule) {
        ValidationContext context = new ValidationContext();
        if (schedule == null) {
            return context;
        }
        if (schedule.getDemandId() != null) {
            demandRepository.findById(schedule.getDemandId()).ifPresent(context::addDemand);
        }
        if (schedule.getStaffId() != null) {
            staffRepository.findById(schedule.getStaffId()).ifPresent(context::addStaffMember);
        }
        if (schedule.getDemandManpowerDetailId() != null) {
            detailRepository.findById(schedule.getDemandManpowerDetailId()).ifPresent(context::addDetail);
        }
        if (schedule.getDemandSpecialModuleId() != null) {
            specialRepository.findById(schedule.getDemandSpecialModuleId()).ifPresent(context::addSpecial);
        }
        context.specials.values().stream().map(DemandSpecialModule::getModuleId)
            .filter(Objects::nonNull).forEach(moduleId ->
                moduleRepository.findById(moduleId).ifPresent(context::addModule));
        TestStaff staff = context.staff.get(schedule.getStaffId());
        if (staff != null && staff.getEmpNo() != null) {
            userRepository.findByUsername(staff.getEmpNo()).ifPresent(context::addUser);
        }
        if (schedule.getStaffId() != null && schedule.getDemandSpecialModuleId() != null) {
            DemandSpecialModule special = context.specials.get(schedule.getDemandSpecialModuleId());
            if (special != null && special.getModuleId() != null
                    && staffModuleRepository.existsById(new TestStaffModuleId(
                        schedule.getStaffId(), special.getModuleId()))) {
                context.staffModuleKeys.add(new TestStaffModuleId(
                    schedule.getStaffId(), special.getModuleId()));
            }
        }
        if (schedule.getDemandId() != null) {
            context.addSchedules(scheduleRepository.findByDemandId(schedule.getDemandId()));
        }
        if (schedule.getStaffId() != null && schedule.getDate() != null) {
            context.addSchedules(scheduleRepository.findByStaffIdAndDate(
                schedule.getStaffId(), schedule.getDate()));
            dailyStatusRepository.findByStaffIdAndDate(schedule.getStaffId(), schedule.getDate())
                .ifPresent(status -> context.statuses.put(
                    new StaffDateKey(schedule.getStaffId(), schedule.getDate()), status));
        }
        DemandManpowerDetail detail = context.details.get(schedule.getDemandManpowerDetailId());
        if (detail != null && detail.getDemandId() != null && detail.getTestType() != null) {
            BigDecimal total = specialRepository.sumManpowerByDemandIdAndTestType(
                detail.getDemandId(), detail.getTestType());
            if (total != null) {
                context.specialDemandTotals.put(
                    new DemandTypeKey(detail.getDemandId(), detail.getTestType()), total);
            }
        }
        context.calculateSpecialDemandTotals();
        return context;
    }

    private void validateIdentifiers(Schedule schedule) {
        if (schedule == null) {
            throw error("SCHEDULE_REQUIRED", "排班信息不能为空");
        }
        if (schedule.getDemandId() == null) {
            throw error("DEMAND_REQUIRED", "需求ID不能为空");
        }
        if (schedule.getStaffId() == null) {
            throw error("STAFF_REQUIRED", "人员ID不能为空");
        }
        if (schedule.getDemandManpowerDetailId() == null) {
            throw error("SCHEDULE_DETAIL_REQUIRED", "排班必须归属人力明细");
        }
    }

    private void validateDetailManpower(DemandManpowerDetail detail) {
        if (detail.getManpowerDemand() == null
                || detail.getManpowerDemand().compareTo(BigDecimal.ZERO) <= 0) {
            throw error("SCHEDULE_DETAIL_MANPOWER_INVALID", "人力明细需求必须为正数");
        }
    }

    private void validateDate(LocalDate date, TestDemand demand) {
        if (date == null || demand.getStartDate() == null || demand.getEndDate() == null
                || date.isBefore(demand.getStartDate().toLocalDate())
                || date.isAfter(demand.getEndDate().toLocalDate())) {
            throw error("SCHEDULE_DATE_OUT_OF_RANGE", "排班日期必须在需求测试周期内");
        }
    }

    private void validateSpecialEligibility(
            TestDemand demand, DemandManpowerDetail detail, DemandSpecialModule special,
            TestModuleConfig module, TestStaff staff, ValidationContext context) {
        if (!Objects.equals(special.getDemandId(), demand.getId())) {
            throw error("SPECIAL_MODULE_DEMAND_MISMATCH", "特殊模块人力明细不属于当前需求");
        }
        if (!Objects.equals(module.getTestType(), detail.getTestType())) {
            throw error("MODULE_GROUP_MISMATCH", "模块所属小组与人力明细不一致");
        }
        if (!context.staffModuleKeys.contains(new TestStaffModuleId(staff.getId(), module.getId()))) {
            throw error("STAFF_MODULE_NOT_FAMILIAR",
                staff.getName() + "不熟悉" + module.getModuleName() + "，无法分配");
        }
    }

    private void validateConfidentialClearance(
            TestDemand demand, TestStaff staff, ValidationContext context) {
        if (!Boolean.TRUE.equals(demand.getConfidential())) {
            return;
        }
        User user = context.users.get(staff.getEmpNo());
        if (user == null || !Boolean.TRUE.equals(user.getConfidentialClearance())) {
            throw error("CONFIDENTIAL_CLEARANCE_REQUIRED",
                staff.getName() + "不具备保密权限，无法参与保密项目测试");
        }
    }

    private void validatePercentage(Integer percentage) {
        if (percentage == null || percentage <= 0 || percentage > 100 || percentage % 10 != 0) {
            throw error("SCHEDULE_PERCENTAGE_INVALID", "投入比例必须为10到100之间的10的倍数");
        }
    }

    private void validateDailyCapacity(
            Schedule schedule, TestStaff staff, Long excludedScheduleId, ValidationContext context) {
        int used = withoutExcluded(context.schedules, excludedScheduleId).stream()
            .filter(existing -> Objects.equals(existing.getStaffId(), staff.getId())
                && Objects.equals(existing.getDate(), schedule.getDate()))
            .map(Schedule::getPercentage).filter(Objects::nonNull)
            .mapToInt(Integer::intValue).sum();
        int available = availablePercentage(staff, schedule.getDate(), context);
        if (used + schedule.getPercentage() > available) {
            throw error("STAFF_CAPACITY_EXCEEDED", staff.getName() + "当日容量不足");
        }
    }

    private int availablePercentage(TestStaff staff, LocalDate date, ValidationContext context) {
        BigDecimal coefficient = Optional.ofNullable(staff.getCurrentCoefficient())
            .orElse(BigDecimal.ONE);
        BigDecimal availabilityFactor = Optional.ofNullable(
                context.statuses.get(new StaffDateKey(staff.getId(), date)))
            .filter(status -> status.getStatus() != StaffDailyStatus.DailyAvailabilityStatus.AVAILABLE)
            .map(StaffDailyStatus::getPercentage).map(BigDecimal::valueOf)
            .map(value -> value.max(BigDecimal.ZERO).min(ONE_HUNDRED))
            .map(unavailable -> BigDecimal.ONE.subtract(unavailable.divide(
                ONE_HUNDRED, 4, RoundingMode.HALF_UP)))
            .orElse(BigDecimal.ONE);
        return coefficient.multiply(ONE_HUNDRED).multiply(availabilityFactor)
            .setScale(0, RoundingMode.FLOOR).intValue();
    }

    private void validateDeviceCapacity(
            Schedule schedule, TestDemand demand, List<Schedule> demandSchedules) {
        Integer deviceCount = demand.getTestDeviceCount();
        if (deviceCount == null || deviceCount <= 0) {
            return;
        }
        Set<Long> scheduledStaff = demandSchedules.stream()
            .filter(existing -> Objects.equals(existing.getDate(), schedule.getDate()))
            .map(Schedule::getStaffId).filter(Objects::nonNull).collect(Collectors.toSet());
        if (!scheduledStaff.contains(schedule.getStaffId()) && scheduledStaff.size() >= deviceCount) {
            throw error("TEST_DEVICE_CAPACITY_EXCEEDED", "当日排班人数超过测试设备数量");
        }
    }

    private void validateBucketCapacity(
            Schedule schedule, DemandManpowerDetail detail, DemandSpecialModule special,
            List<Schedule> demandSchedules, ValidationContext context) {
        BigDecimal allocated;
        BigDecimal limit;
        if (special != null) {
            allocated = allocatedDays(demandSchedules.stream()
                .filter(existing -> Objects.equals(existing.getDemandSpecialModuleId(), special.getId()))
                .toList());
            limit = special.getManpowerDemand();
        } else {
            allocated = allocatedDays(demandSchedules.stream()
                .filter(existing -> Objects.equals(existing.getDemandManpowerDetailId(), detail.getId()))
                .filter(existing -> existing.getDemandSpecialModuleId() == null).toList());
            BigDecimal specialDemand = context.specialDemandTotals.get(
                new DemandTypeKey(detail.getDemandId(), detail.getTestType()));
            limit = detail.getManpowerDemand().subtract(
                Optional.ofNullable(specialDemand).orElse(BigDecimal.ZERO));
        }
        if (limit == null || allocated.add(percentToDays(schedule.getPercentage())).compareTo(limit) > 0) {
            throw error("SCHEDULE_BUCKET_EXCEEDED", "排班超过归属人力明细需求");
        }
    }

    private BigDecimal allocatedDays(List<Schedule> schedules) {
        return schedules.stream().map(Schedule::getPercentage).filter(Objects::nonNull)
            .map(this::percentToDays).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal percentToDays(Integer percentage) {
        return BigDecimal.valueOf(percentage).divide(ONE_HUNDRED, 2, RoundingMode.UNNECESSARY);
    }

    private List<Schedule> withoutExcluded(List<Schedule> schedules, Long excludedScheduleId) {
        return schedules.stream().filter(schedule -> excludedScheduleId == null
            || !Objects.equals(schedule.getId(), excludedScheduleId)).toList();
    }

    private BusinessException error(String code, String message) {
        return new BusinessException(code, message);
    }

    public static final class ValidationContext {
        private final Map<Long, TestDemand> demands = new HashMap<>();
        private final Map<Long, TestStaff> staff = new HashMap<>();
        private final Map<Long, DemandManpowerDetail> details = new HashMap<>();
        private final Map<Long, DemandSpecialModule> specials = new HashMap<>();
        private final Map<Long, TestModuleConfig> modules = new HashMap<>();
        private final Map<String, User> users = new HashMap<>();
        private final Set<TestStaffModuleId> staffModuleKeys = new java.util.HashSet<>();
        private final Map<StaffDateKey, StaffDailyStatus> statuses = new HashMap<>();
        private final Map<DemandTypeKey, BigDecimal> specialDemandTotals = new HashMap<>();
        private final Map<Long, Schedule> scheduleById = new LinkedHashMap<>();
        private final List<Schedule> schedules = new ArrayList<>();

        private void addDemand(TestDemand value) { demands.put(value.getId(), value); }
        private void addDemands(Iterable<TestDemand> values) { values.forEach(this::addDemand); }
        private void addStaffMember(TestStaff value) { staff.put(value.getId(), value); }
        private void addStaff(Iterable<TestStaff> values) { values.forEach(this::addStaffMember); }
        private void addDetail(DemandManpowerDetail value) { details.put(value.getId(), value); }
        private void addDetails(Iterable<DemandManpowerDetail> values) { values.forEach(this::addDetail); }
        private void addSpecial(DemandSpecialModule value) { specials.put(value.getId(), value); }
        private void addSpecials(Iterable<DemandSpecialModule> values) { values.forEach(this::addSpecial); }
        private void addModule(TestModuleConfig value) { modules.put(value.getId(), value); }
        private void addModules(Iterable<TestModuleConfig> values) { values.forEach(this::addModule); }
        private void addUser(User value) { users.put(value.getUsername(), value); }
        private void addUsers(Iterable<User> values) { values.forEach(this::addUser); }
        private void addStaffModules(Iterable<TestStaffModule> values) {
            values.forEach(value -> staffModuleKeys.add(value.getId()));
        }
        private void addStatus(StaffDailyStatus value) {
            statuses.put(new StaffDateKey(value.getStaffId(), value.getDate()), value);
        }
        private void addStatuses(Iterable<StaffDailyStatus> values) { values.forEach(this::addStatus); }
        private void addSchedules(Iterable<Schedule> values) {
            values.forEach(value -> {
                if (value.getId() == null || !scheduleById.containsKey(value.getId())) {
                    schedules.add(value);
                    if (value.getId() != null) {
                        scheduleById.put(value.getId(), value);
                    }
                }
            });
        }
        private void calculateSpecialDemandTotals() {
            for (DemandSpecialModule special : specials.values()) {
                TestModuleConfig module = modules.get(special.getModuleId());
                if (module != null && special.getManpowerDemand() != null) {
                    DemandTypeKey key = new DemandTypeKey(special.getDemandId(), module.getTestType());
                    specialDemandTotals.merge(key, special.getManpowerDemand(), BigDecimal::add);
                }
            }
        }
        public void addSchedule(Schedule schedule) { schedules.add(schedule); }
    }

    private List<Long> sorted(Collection<Long> values) {
        return values.stream().filter(Objects::nonNull).distinct().sorted().toList();
    }

    private <I, O> List<O> fetchChunks(List<I> values, Function<List<I>, List<O>> query) {
        if (values.isEmpty()) return List.of();
        List<O> result = new ArrayList<>();
        for (int start = 0; start < values.size(); start += BULK_QUERY_CHUNK_SIZE) {
            int end = Math.min(start + BULK_QUERY_CHUNK_SIZE, values.size());
            result.addAll(query.apply(new ArrayList<>(values.subList(start, end))));
        }
        return result;
    }

    private record StaffDateKey(Long staffId, LocalDate date) { }
    private record DemandTypeKey(Long demandId, String testType) { }
}
