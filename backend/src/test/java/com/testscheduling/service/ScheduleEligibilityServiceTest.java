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
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ScheduleEligibilityServiceTest {

    private static final LocalDate SCHEDULE_DATE = LocalDate.of(2026, 7, 22);

    @Mock TestDemandRepository demandRepository;
    @Mock DemandManpowerDetailRepository detailRepository;
    @Mock DemandSpecialModuleRepository specialRepository;
    @Mock TestModuleConfigRepository moduleRepository;
    @Mock TestStaffRepository staffRepository;
    @Mock TestStaffModuleRepository staffModuleRepository;
    @Mock ScheduleRepository scheduleRepository;
    @Mock StaffDailyStatusRepository dailyStatusRepository;
    @Mock UserRepository userRepository;

    @InjectMocks ScheduleEligibilityService service;

    @Test
    void rejectsStaffWhoDoesNotKnowSpecialModule() {
        Schedule schedule = specialSchedule();
        stubBaseEligibility("自动化测试");
        when(staffModuleRepository.existsById(new TestStaffModuleId(108L, 11L))).thenReturn(false);

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.validate(schedule, null));

        assertEquals("STAFF_MODULE_NOT_FAMILIAR", error.getErrorCode());
    }

    @Test
    void allowsCrossGroupStaffWhoKnowsModule() {
        Schedule schedule = specialSchedule();
        stubBaseEligibility("自动化测试");
        when(staffModuleRepository.existsById(new TestStaffModuleId(108L, 11L))).thenReturn(true);

        assertDoesNotThrow(() -> service.validate(schedule, null));
    }

    @Test
    void rejectsGeneralScheduleForDifferentTestType() {
        Schedule schedule = generalSchedule();
        stubBaseEligibility("自动化测试");

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.validate(schedule, null));

        assertEquals("STAFF_TEST_TYPE_MISMATCH", error.getErrorCode());
    }

    @Test
    void rejectsConfidentialScheduleWithoutClearance() {
        Schedule schedule = generalSchedule();
        TestDemand demand = stubBaseEligibility("功能测试");
        demand.setConfidential(true);
        User user = new User();
        user.setUsername("T0108");
        user.setConfidentialClearance(false);
        when(userRepository.findByUsername("T0108")).thenReturn(Optional.of(user));

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.validate(schedule, null));

        assertEquals("CONFIDENTIAL_CLEARANCE_REQUIRED", error.getErrorCode());
    }

    @Test
    void rejectsCapacityAboveCoefficient() {
        Schedule schedule = generalSchedule();
        stubBaseEligibility("功能测试");
        when(scheduleRepository.findByStaffIdAndDate(108L, SCHEDULE_DATE))
            .thenReturn(List.of(existingSchedule(900L, 60, 108L, null)));

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.validate(schedule, null));

        assertEquals("STAFF_CAPACITY_EXCEEDED", error.getErrorCode());
    }

    @Test
    void appliesUnavailableDailyStatusShareToCapacity() {
        Schedule schedule = generalSchedule();
        stubBaseEligibility("功能测试");
        StaffDailyStatus status = new StaffDailyStatus();
        status.setStatus(StaffDailyStatus.DailyAvailabilityStatus.OTHER_TASKS);
        status.setPercentage(40.0);
        when(dailyStatusRepository.findByStaffIdAndDate(108L, SCHEDULE_DATE))
            .thenReturn(Optional.of(status));
        when(scheduleRepository.findByStaffIdAndDate(108L, SCHEDULE_DATE))
            .thenReturn(List.of(existingSchedule(900L, 20, 108L, null)));

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.validate(schedule, null));

        assertEquals("STAFF_CAPACITY_EXCEEDED", error.getErrorCode());
    }

    @Test
    void rejectsNewDistinctStaffAboveDeviceCount() {
        Schedule schedule = generalSchedule();
        TestDemand demand = stubBaseEligibility("功能测试");
        demand.setTestDeviceCount(1);
        when(scheduleRepository.findByDemandId(1001L))
            .thenReturn(List.of(existingSchedule(900L, 50, 109L, null)));

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.validate(schedule, null));

        assertEquals("TEST_DEVICE_CAPACITY_EXCEEDED", error.getErrorCode());
    }

    @Test
    void rejectsSpecialModuleBucketOverAllocation() {
        Schedule schedule = specialSchedule();
        stubBaseEligibility("自动化测试");
        when(staffModuleRepository.existsById(new TestStaffModuleId(108L, 11L))).thenReturn(true);
        when(scheduleRepository.findByDemandId(1001L))
            .thenReturn(List.of(existingSchedule(900L, 60, 109L, 501L)));

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.validate(schedule, null));

        assertEquals("SCHEDULE_BUCKET_EXCEEDED", error.getErrorCode());
    }

    @Test
    void rejectsGeneralBucketOverAllocation() {
        Schedule schedule = generalSchedule();
        stubBaseEligibility("功能测试");
        when(scheduleRepository.findByDemandId(1001L))
            .thenReturn(List.of(existingSchedule(900L, 60, 109L, null)));

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.validate(schedule, null));

        assertEquals("SCHEDULE_BUCKET_EXCEEDED", error.getErrorCode());
    }

    @Test
    void excludesEditedScheduleFromCapacityDeviceAndBucketTotals() {
        Schedule schedule = generalSchedule();
        schedule.setId(900L);
        TestDemand demand = stubBaseEligibility("功能测试");
        demand.setTestDeviceCount(1);
        Schedule existing = existingSchedule(900L, 50, 108L, null);
        when(scheduleRepository.findByStaffIdAndDate(108L, SCHEDULE_DATE)).thenReturn(List.of(existing));
        when(scheduleRepository.findByDemandId(1001L)).thenReturn(List.of(existing));

        assertDoesNotThrow(() -> service.validate(schedule, 900L));
    }

    @Test
    void rejectsPercentageThatIsNotPositiveBoundedTenPercentStep() {
        Schedule schedule = generalSchedule();
        schedule.setPercentage(55);
        stubBaseEligibility("功能测试");

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.validate(schedule, null));

        assertEquals("SCHEDULE_PERCENTAGE_INVALID", error.getErrorCode());
    }

    @Test
    void reportsMissingReferencesBeforeInactiveStaff() {
        Schedule schedule = generalSchedule();
        when(demandRepository.findById(1001L)).thenReturn(Optional.empty());
        when(staffRepository.findById(108L)).thenReturn(Optional.empty());

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.validate(schedule, null));

        assertEquals("DEMAND_NOT_FOUND", error.getErrorCode());
    }

    private Schedule specialSchedule() {
        Schedule schedule = generalSchedule();
        schedule.setDemandSpecialModuleId(501L);
        return schedule;
    }

    private Schedule generalSchedule() {
        Schedule schedule = new Schedule();
        schedule.setDemandId(1001L);
        schedule.setStaffId(108L);
        schedule.setDemandManpowerDetailId(301L);
        schedule.setDate(SCHEDULE_DATE);
        schedule.setPercentage(50);
        return schedule;
    }

    private TestDemand stubBaseEligibility(String staffTestType) {
        TestDemand demand = new TestDemand();
        demand.setId(1001L);
        demand.setStartDate(LocalDateTime.of(2026, 7, 20, 0, 0));
        demand.setEndDate(LocalDateTime.of(2026, 7, 31, 0, 0));
        demand.setConfidential(false);

        DemandManpowerDetail detail = new DemandManpowerDetail();
        detail.setId(301L);
        detail.setDemandId(1001L);
        detail.setTestType("功能测试");
        detail.setManpowerDemand(new BigDecimal("2.0"));

        DemandSpecialModule special = new DemandSpecialModule();
        special.setId(501L);
        special.setDemandId(1001L);
        special.setModuleId(11L);
        special.setManpowerDemand(new BigDecimal("1.0"));

        TestModuleConfig module = new TestModuleConfig();
        module.setId(11L);
        module.setModuleName("支付模块");
        module.setTestType("功能测试");

        TestStaff staff = new TestStaff();
        staff.setId(108L);
        staff.setName("张三");
        staff.setEmpNo("T0108");
        staff.setTestType(staffTestType);
        staff.setStatus(TestStaff.StaffStatus.active);
        staff.setCurrentCoefficient(new BigDecimal("1.0"));

        when(demandRepository.findById(1001L)).thenReturn(Optional.of(demand));
        when(detailRepository.findById(301L)).thenReturn(Optional.of(detail));
        when(specialRepository.findById(501L)).thenReturn(Optional.of(special));
        when(specialRepository.findByDemandIdOrderByIdAsc(1001L)).thenReturn(List.of(special));
        when(specialRepository.sumManpowerByDemandIdAndTestType(1001L, "功能测试"))
            .thenReturn(new BigDecimal("1.0"));
        when(moduleRepository.findById(11L)).thenReturn(Optional.of(module));
        when(staffRepository.findById(108L)).thenReturn(Optional.of(staff));
        when(scheduleRepository.findByStaffIdAndDate(108L, SCHEDULE_DATE)).thenReturn(List.of());
        when(scheduleRepository.findByDemandId(1001L)).thenReturn(List.of());
        when(dailyStatusRepository.findByStaffIdAndDate(108L, SCHEDULE_DATE)).thenReturn(Optional.empty());
        return demand;
    }

    private Schedule existingSchedule(Long id, int percentage, Long staffId, Long specialId) {
        Schedule schedule = new Schedule();
        schedule.setId(id);
        schedule.setDemandId(1001L);
        schedule.setStaffId(staffId);
        schedule.setDate(SCHEDULE_DATE);
        schedule.setPercentage(percentage);
        schedule.setDemandManpowerDetailId(301L);
        schedule.setDemandSpecialModuleId(specialId);
        return schedule;
    }
}
