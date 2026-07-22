package com.testscheduling.service;

import com.testscheduling.entity.DemandManpowerDetail;
import com.testscheduling.entity.DemandSpecialModule;
import com.testscheduling.entity.Schedule;
import com.testscheduling.entity.StaffDailyStatus;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.entity.TestStaff;
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
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class ScheduleEligibilityService {

    private static final BigDecimal ONE_HUNDRED = new BigDecimal("100");

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
        if (schedule == null) {
            throw error("SCHEDULE_REQUIRED", "排班信息不能为空");
        }

        TestDemand demand = demandRepository.findById(schedule.getDemandId())
            .orElseThrow(() -> error("DEMAND_NOT_FOUND", "测试需求不存在"));
        TestStaff staff = staffRepository.findById(schedule.getStaffId())
            .orElseThrow(() -> error("STAFF_NOT_FOUND", "测试人员不存在"));
        if (schedule.getDemandManpowerDetailId() == null) {
            throw error("SCHEDULE_DETAIL_REQUIRED", "排班必须归属人力明细");
        }
        DemandManpowerDetail detail = detailRepository.findById(schedule.getDemandManpowerDetailId())
            .orElseThrow(() -> error("SCHEDULE_DETAIL_NOT_FOUND", "人力明细不存在"));

        DemandSpecialModule special = null;
        TestModuleConfig module = null;
        if (schedule.getDemandSpecialModuleId() != null) {
            special = specialRepository.findById(schedule.getDemandSpecialModuleId())
                .orElseThrow(() -> error("SCHEDULE_DETAIL_NOT_FOUND", "特殊模块人力明细不存在"));
            module = moduleRepository.findById(special.getModuleId())
                .orElseThrow(() -> error("MODULE_NOT_FOUND", "特殊模块不存在"));
        }

        if (staff.getStatus() != TestStaff.StaffStatus.active) {
            throw error("STAFF_NOT_ACTIVE", "仅在职人员可以参与排班");
        }
        validateDate(schedule.getDate(), demand);

        if (!Objects.equals(detail.getDemandId(), demand.getId())) {
            throw error("SCHEDULE_DETAIL_DEMAND_MISMATCH", "人力明细不属于当前需求");
        }

        if (special != null) {
            validateSpecialEligibility(demand, detail, special, module, staff);
        } else if (!Objects.equals(detail.getTestType(), staff.getTestType())) {
            throw error("STAFF_TEST_TYPE_MISMATCH", "通用人力必须分配给相同测试类型人员");
        }

        validateConfidentialClearance(demand, staff);
        validatePercentage(schedule.getPercentage());
        validateDailyCapacity(schedule, staff, excludedScheduleId);

        List<Schedule> demandSchedules = withoutExcluded(
            scheduleRepository.findByDemandId(demand.getId()), excludedScheduleId);
        validateDeviceCapacity(schedule, demand, demandSchedules);
        validateBucketCapacity(schedule, detail, special, demandSchedules);
    }

    private void validateDate(LocalDate date, TestDemand demand) {
        if (date == null || demand.getStartDate() == null || demand.getEndDate() == null
                || date.isBefore(demand.getStartDate().toLocalDate())
                || date.isAfter(demand.getEndDate().toLocalDate())) {
            throw error("SCHEDULE_DATE_OUT_OF_RANGE", "排班日期必须在需求测试周期内");
        }
    }

    private void validateSpecialEligibility(
            TestDemand demand,
            DemandManpowerDetail detail,
            DemandSpecialModule special,
            TestModuleConfig module,
            TestStaff staff) {
        if (!Objects.equals(special.getDemandId(), demand.getId())) {
            throw error("SPECIAL_MODULE_DEMAND_MISMATCH", "特殊模块人力明细不属于当前需求");
        }
        if (!Objects.equals(module.getTestType(), detail.getTestType())) {
            throw error("MODULE_GROUP_MISMATCH", "模块所属小组与人力明细不一致");
        }
        if (!staffModuleRepository.existsById(new TestStaffModuleId(staff.getId(), module.getId()))) {
            throw error("STAFF_MODULE_NOT_FAMILIAR",
                staff.getName() + "不熟悉" + module.getModuleName() + "，无法分配");
        }
    }

    private void validateConfidentialClearance(TestDemand demand, TestStaff staff) {
        if (!Boolean.TRUE.equals(demand.getConfidential())) {
            return;
        }
        User user = userRepository.findByUsername(staff.getEmpNo()).orElse(null);
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

    private void validateDailyCapacity(Schedule schedule, TestStaff staff, Long excludedScheduleId) {
        int used = withoutExcluded(scheduleRepository.findByStaffIdAndDate(
                staff.getId(), schedule.getDate()), excludedScheduleId).stream()
            .map(Schedule::getPercentage)
            .filter(Objects::nonNull)
            .mapToInt(Integer::intValue)
            .sum();
        int available = availablePercentage(staff, schedule.getDate());
        if (used + schedule.getPercentage() > available) {
            throw error("STAFF_CAPACITY_EXCEEDED", staff.getName() + "当日容量不足");
        }
    }

    private int availablePercentage(TestStaff staff, LocalDate date) {
        BigDecimal coefficient = Optional.ofNullable(staff.getCurrentCoefficient())
            .orElse(BigDecimal.ONE);
        BigDecimal availabilityFactor = dailyStatusRepository.findByStaffIdAndDate(staff.getId(), date)
            .filter(status -> status.getStatus() != StaffDailyStatus.DailyAvailabilityStatus.AVAILABLE)
            .map(StaffDailyStatus::getPercentage)
            .map(BigDecimal::valueOf)
            .map(value -> value.max(BigDecimal.ZERO).min(ONE_HUNDRED))
            .map(unavailable -> BigDecimal.ONE.subtract(unavailable.divide(
                ONE_HUNDRED, 4, RoundingMode.HALF_UP)))
            .orElse(BigDecimal.ONE);
        return coefficient.multiply(ONE_HUNDRED)
            .multiply(availabilityFactor)
            .setScale(0, RoundingMode.FLOOR)
            .intValue();
    }

    private void validateDeviceCapacity(
            Schedule schedule, TestDemand demand, List<Schedule> demandSchedules) {
        Integer deviceCount = demand.getTestDeviceCount();
        if (deviceCount == null || deviceCount <= 0) {
            return;
        }
        Set<Long> scheduledStaff = demandSchedules.stream()
            .filter(existing -> Objects.equals(existing.getDate(), schedule.getDate()))
            .map(Schedule::getStaffId)
            .filter(Objects::nonNull)
            .collect(Collectors.toSet());
        if (!scheduledStaff.contains(schedule.getStaffId()) && scheduledStaff.size() >= deviceCount) {
            throw error("TEST_DEVICE_CAPACITY_EXCEEDED", "当日排班人数超过测试设备数量");
        }
    }

    private void validateBucketCapacity(
            Schedule schedule,
            DemandManpowerDetail detail,
            DemandSpecialModule special,
            List<Schedule> demandSchedules) {
        BigDecimal allocated;
        BigDecimal limit;
        if (special != null) {
            allocated = allocatedDays(demandSchedules.stream()
                .filter(existing -> Objects.equals(
                    existing.getDemandSpecialModuleId(), special.getId()))
                .toList());
            limit = special.getManpowerDemand();
        } else {
            allocated = allocatedDays(demandSchedules.stream()
                .filter(existing -> Objects.equals(
                    existing.getDemandManpowerDetailId(), detail.getId()))
                .filter(existing -> existing.getDemandSpecialModuleId() == null)
                .toList());
            BigDecimal specialDemand = specialRepository.sumManpowerByDemandIdAndTestType(
                detail.getDemandId(), detail.getTestType());
            limit = detail.getManpowerDemand().subtract(
                Optional.ofNullable(specialDemand).orElse(BigDecimal.ZERO));
        }
        if (limit == null || allocated.add(percentToDays(schedule.getPercentage())).compareTo(limit) > 0) {
            throw error("SCHEDULE_BUCKET_EXCEEDED", "排班超过归属人力明细需求");
        }
    }

    private BigDecimal allocatedDays(List<Schedule> schedules) {
        return schedules.stream()
            .map(Schedule::getPercentage)
            .filter(Objects::nonNull)
            .map(this::percentToDays)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal percentToDays(Integer percentage) {
        return BigDecimal.valueOf(percentage).divide(ONE_HUNDRED, 2, RoundingMode.UNNECESSARY);
    }

    private List<Schedule> withoutExcluded(List<Schedule> schedules, Long excludedScheduleId) {
        if (schedules == null || schedules.isEmpty()) {
            return List.of();
        }
        return schedules.stream()
            .filter(schedule -> excludedScheduleId == null
                || !Objects.equals(schedule.getId(), excludedScheduleId))
            .toList();
    }

    private BusinessException error(String code, String message) {
        return new BusinessException(code, message);
    }
}
