package com.testscheduling.service;

import com.testscheduling.dto.ScheduleRecommendationRequest;
import com.testscheduling.dto.ScheduleRecommendationResponse;
import com.testscheduling.entity.DemandManpowerDetail;
import com.testscheduling.entity.DemandSpecialModule;
import com.testscheduling.entity.Schedule;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.entity.TestStaffModule;
import com.testscheduling.entity.TestStaffModuleId;
import com.testscheduling.entity.StaffDailyStatus;
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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doAnswer;

@SpringBootTest
@Transactional
class ScheduleRecommendationServiceTest {

    @Autowired ScheduleRecommendationService service;
    @Autowired TestDemandRepository demandRepository;
    @Autowired DemandManpowerDetailRepository detailRepository;
    @Autowired TestModuleConfigRepository moduleRepository;
    @Autowired DemandSpecialModuleRepository specialRepository;
    @Autowired ScheduleRepository scheduleRepository;
    @Autowired StaffDailyStatusRepository statusRepository;
    @Autowired TestStaffRepository staffRepository;
    @Autowired TestStaffModuleRepository staffModuleRepository;
    @Autowired UserRepository userRepository;
    @SpyBean ScheduleEligibilityService eligibilitySpy;

    @Test
    void allocatesSpecialBeforeGeneralAndAllowsCrossGroupFamiliarStaff() {
        TestModuleConfig module = module("支付模块 Task7", "功能测试 Task7");
        TestDemand demand = demand();
        DemandManpowerDetail detail = detail(demand.getId(), "功能测试 Task7", "2.0");
        DemandSpecialModule special = special(demand.getId(), module.getId(), "1.0");
        TestStaff specialStaff = staff("跨组人员", "自动化测试");
        TestStaff generalStaff = staff("功能人员 Task7", "功能测试 Task7");
        TestStaff unqualified = staff("不合格人员 Task7", "功能测试 Task7");
        TestStaffModule relation = new TestStaffModule();
        relation.setId(new TestStaffModuleId(specialStaff.getId(), module.getId()));
        staffModuleRepository.save(relation);

        ScheduleRecommendationResponse result = service.recommend(request(demand.getId()));

        assertEquals(2, result.generatedSchedules().size());
        Schedule specialSchedule = result.generatedSchedules().get(0);
        assertEquals(specialStaff.getId(), specialSchedule.getStaffId());
        assertEquals(detail.getId(), specialSchedule.getDemandManpowerDetailId());
        assertEquals(special.getId(), specialSchedule.getDemandSpecialModuleId());
        assertNotNull(specialSchedule.getProduct());
        assertEquals("v1", specialSchedule.getVersion());
        assertEquals("维护", specialSchedule.getVersionType());
        assertEquals("测试经理", specialSchedule.getTestManager());
        assertEquals(false, specialSchedule.getPublished());
        assertEquals(0, result.fulfillment().get(0).specialModuleGaps().size());
        assertEquals(0, result.fulfillment().get(0).generalGaps().size());
        assertTrue(result.fulfillment().get(0).fullySatisfied());
        assertEquals(generalStaff.getId(), result.generatedSchedules().get(1).getStaffId());
        assertNull(result.generatedSchedules().get(1).getDemandSpecialModuleId());
        assertEquals(0, result.generatedSchedules().stream()
                .filter(schedule -> unqualified.getId().equals(schedule.getStaffId())).count());
    }

    @Test
    void reportsSpecialGapAndContinuesGeneralAllocationWhenModuleStaffIsUnavailable() {
        TestModuleConfig module = module("消息模块 Task7", "功能测试 Gap7");
        TestDemand demand = demand();
        DemandManpowerDetail detail = detail(demand.getId(), "功能测试 Gap7", "2.0");
        DemandSpecialModule special = special(demand.getId(), module.getId(), "1.0");
        TestStaff generalStaff = staff("通用人员 Gap7", "功能测试 Gap7");

        ScheduleRecommendationResponse result = service.recommend(request(demand.getId()));

        assertEquals(1, result.generatedSchedules().size());
        assertEquals(generalStaff.getId(), result.generatedSchedules().get(0).getStaffId());
        assertEquals("NO_QUALIFIED_STAFF", result.fulfillment().get(0)
                .specialModuleGaps().get(0).reasonCode());
        assertEquals(special.getId(), result.fulfillment().get(0).specialModuleGaps().get(0)
                .demandSpecialModuleId());
        assertEquals(0, result.fulfillment().get(0).generalGaps().size());
        assertEquals(detail.getId(), result.generatedSchedules().get(0).getDemandManpowerDetailId());
        ScheduleRecommendationResponse.Fulfillment fulfillment = result.fulfillment().getFirst();
        assertEquals(0, new BigDecimal("2.0").compareTo(fulfillment.totalRequired()));
        assertEquals(0, new BigDecimal("1.0").compareTo(fulfillment.totalAllocated()));
        assertEquals(0, new BigDecimal("1.0").compareTo(fulfillment.totalShortage()));
        assertEquals(0, new BigDecimal("0.0").compareTo(
            fulfillment.specialModules().getFirst().allocated()));
        assertEquals(0, new BigDecimal("1.0").compareTo(
            fulfillment.specialModules().getFirst().remaining()));
        assertEquals(0, new BigDecimal("1.0").compareTo(
            fulfillment.summary().getFirst().specialRemaining()));
        assertEquals(0, new BigDecimal("0.0").compareTo(
            fulfillment.summary().getFirst().generalRemaining()));
    }

    @Test
    void fixedRangeRequiresAnAscendingDateRange() {
        ScheduleRecommendationRequest request = new ScheduleRecommendationRequest();
        request.setMode(ScheduleRecommendationRequest.Mode.FIXED_RANGE);
        request.setDemandIds(List.of(999L));
        request.setDateRange(new ScheduleRecommendationRequest.DateRange(
                LocalDate.of(2026, 7, 23), LocalDate.of(2026, 7, 22)));

        BusinessException error = assertThrows(BusinessException.class, () -> service.recommend(request));

        assertEquals("INVALID_DATE_RANGE", error.getErrorCode());
    }

    @Test
    void retainedDraftIsCountedOnceDuringFinalEligibilityValidation() {
        TestDemand demand = demand();
        DemandManpowerDetail detail = detail(demand.getId(), "保留草稿 Task7", "1.0");
        TestStaff generalStaff = staff("保留草稿人员 Task7", "保留草稿 Task7");
        Schedule retained = new Schedule();
        retained.setDemandId(demand.getId());
        retained.setStaffId(generalStaff.getId());
        retained.setDate(LocalDate.of(2026, 7, 22));
        retained.setPercentage(50);
        retained.setDemandManpowerDetailId(detail.getId());
        retained.setPublished(false);
        scheduleRepository.save(retained);

        ScheduleRecommendationResponse result = service.recommend(request(demand.getId()));

        assertEquals(1, result.generatedSchedules().size());
        assertEquals(50, result.generatedSchedules().get(0).getPercentage());
        assertTrue(result.fulfillment().get(0).fullySatisfied());
    }

    @Test
    void allSpecialBucketsRunBeforeAnyGeneralBucketAcrossDemands() {
        TestModuleConfig module = module("全局优先模块 Task7", "全局优先组 Task7");
        TestDemand demandA = demand();
        DemandManpowerDetail detailA = detail(demandA.getId(), "全局优先组 Task7", "1.0");
        TestDemand demandB = demand();
        DemandManpowerDetail detailB = detail(demandB.getId(), "全局优先组 Task7", "1.0");
        DemandSpecialModule specialB = special(demandB.getId(), module.getId(), "1.0");
        TestStaff sharedStaff = staff("全局优先人员 Task7", "全局优先组 Task7");
        TestStaffModule relation = new TestStaffModule();
        relation.setId(new TestStaffModuleId(sharedStaff.getId(), module.getId()));
        staffModuleRepository.save(relation);

        ScheduleRecommendationRequest request = request(demandA.getId(), demandB.getId());
        ScheduleRecommendationResponse result = service.recommend(request);

        assertEquals(specialB.getId(), result.generatedSchedules().get(0).getDemandSpecialModuleId());
        assertEquals(detailB.getId(), result.generatedSchedules().get(0).getDemandManpowerDetailId());
        assertEquals(List.of(demandA.getId(), demandB.getId()), result.fulfillment().stream()
                .map(ScheduleRecommendationResponse.Fulfillment::demandId).toList());
        assertEquals(1, result.fulfillment().get(0).generalGaps().size());
        assertEquals(0, result.fulfillment().get(1).specialModuleGaps().size());
    }

    @Test
    void fixedRangeIntersectsDemandAndFullDemandIgnoresSuppliedRange() {
        TestDemand demand = demand(LocalDate.of(2026, 7, 22), LocalDate.of(2026, 7, 23));
        DemandManpowerDetail detail = detail(demand.getId(), "日期模式 Task7", "2.0");
        TestStaff staff = staff("日期模式人员 Task7", "日期模式 Task7");

        ScheduleRecommendationRequest fixed = request(demand.getId());
        fixed.setMode(ScheduleRecommendationRequest.Mode.FIXED_RANGE);
        fixed.setDateRange(new ScheduleRecommendationRequest.DateRange(
                LocalDate.of(2026, 7, 21), LocalDate.of(2026, 7, 22)));
        ScheduleRecommendationResponse fixedResult = service.recommend(fixed);
        assertEquals(LocalDate.of(2026, 7, 22), fixedResult.generatedSchedules().get(0).getDate());
        assertEquals(1, fixedResult.fulfillment().get(0).generalGaps().size());

        ScheduleRecommendationRequest full = request(demand.getId());
        full.setDateRange(new ScheduleRecommendationRequest.DateRange(
                LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 1)));
        full.setReplaceExistingDrafts(true);
        ScheduleRecommendationResponse fullResult = service.recommend(full);
        assertEquals(2, fullResult.generatedSchedules().size());
        assertEquals(List.of(LocalDate.of(2026, 7, 22), LocalDate.of(2026, 7, 23)),
                fullResult.generatedSchedules().stream().map(Schedule::getDate).toList());
        assertEquals(detail.getId(), fullResult.generatedSchedules().get(0).getDemandManpowerDetailId());
        assertEquals(staff.getId(), fullResult.generatedSchedules().get(0).getStaffId());
    }

    @Test
    void weekendSwitchesPreventWeekendAllocation() {
        TestDemand demand = demand(LocalDate.of(2026, 7, 25), LocalDate.of(2026, 7, 25));
        detail(demand.getId(), "周末 Task7", "1.0");
        staff("周末人员 Task7", "周末 Task7");
        ScheduleRecommendationRequest request = request(demand.getId());
        request.setIncludeSaturdays(false);

        ScheduleRecommendationResponse result = service.recommend(request);

        assertEquals(0, result.generatedSchedules().size());
        assertEquals("INSUFFICIENT_CAPACITY", result.fulfillment().get(0).generalGaps().get(0).reasonCode());
    }

    @Test
    void sundaySwitchPreventsSundayAllocation() {
        TestDemand demand = demand(LocalDate.of(2026, 7, 26), LocalDate.of(2026, 7, 26));
        detail(demand.getId(), "周日 Task7", "1.0");
        staff("周日人员 Task7", "周日 Task7");
        ScheduleRecommendationRequest request = request(demand.getId());
        request.setIncludeSundays(false);

        ScheduleRecommendationResponse result = service.recommend(request);

        assertEquals(0, result.generatedSchedules().size());
        assertEquals("INSUFFICIENT_CAPACITY", result.fulfillment().get(0).generalGaps().get(0).reasonCode());
    }

    @Test
    void reportsDeviceLimitAndCoefficientCapacity() {
        TestDemand demand = demand();
        detail(demand.getId(), "设备 Task7", "2.0");
        staff("设备人员一 Task7", "设备 Task7");
        staff("设备人员二 Task7", "设备 Task7");
        demand.setTestDeviceCount(1);
        demandRepository.save(demand);
        ScheduleRecommendationResponse deviceResult = service.recommend(request(demand.getId()));
        assertEquals("DEVICE_LIMIT_REACHED", deviceResult.fulfillment().get(0).generalGaps().get(0).reasonCode());

        TestDemand coefficientDemand = demand();
        detail(coefficientDemand.getId(), "系数 Task7", "1.0");
        TestStaff halfStaff = staff("系数人员 Task7", "系数 Task7");
        halfStaff.setCurrentCoefficient(new BigDecimal("0.5"));
        staffRepository.save(halfStaff);
        ScheduleRecommendationResponse coefficientResult = service.recommend(request(coefficientDemand.getId()));
        assertEquals(50, coefficientResult.generatedSchedules().get(0).getPercentage());
        assertEquals("INSUFFICIENT_CAPACITY", coefficientResult.fulfillment().get(0).generalGaps().get(0).reasonCode());
    }

    @Test
    void appliesDailyStatusCapacityAndFixedExcludedRules() {
        TestDemand demand = demand();
        detail(demand.getId(), "状态 Task7", "1.0");
        TestStaff excluded = staff("状态排除人员 Task7", "状态 Task7");
        TestStaff allowed = staff("状态可用人员 Task7", "状态 Task7");
        StaffDailyStatus status = new StaffDailyStatus();
        status.setStaffId(allowed.getId());
        status.setDate(LocalDate.of(2026, 7, 22));
        status.setStatus(StaffDailyStatus.DailyAvailabilityStatus.OTHER_TASKS);
        status.setPercentage(50.0);
        statusRepository.save(status);
        ScheduleRecommendationRequest request = request(demand.getId());
        request.setFixedStaffIds(List.of(excluded.getId()));
        request.setExcludedStaffIds(List.of(excluded.getId()));
        ScheduleRecommendationResponse result = service.recommend(request);
        assertEquals(allowed.getId(), result.generatedSchedules().get(0).getStaffId());
        assertEquals(50, result.generatedSchedules().get(0).getPercentage());
    }

    @Test
    void replacementDeletesDraftsOnlyAndPreservesPublishedRows() {
        TestDemand demand = demand();
        DemandManpowerDetail detail = detail(demand.getId(), "替换 Task7", "1.0");
        TestStaff staff = staff("替换人员 Task7", "替换 Task7");
        Schedule draft = persistedSchedule(demand, detail, staff, 20, false);
        Schedule published = persistedSchedule(demand, detail, staff, 20, true);
        scheduleRepository.saveAll(List.of(draft, published));

        ScheduleRecommendationRequest request = request(demand.getId());
        request.setReplaceExistingDrafts(true);
        ScheduleRecommendationResponse result = service.recommend(request);

        assertEquals(1, result.generatedSchedules().size());
        assertEquals(80, result.generatedSchedules().get(0).getPercentage());
        List<Schedule> rows = scheduleRepository.findByDemandId(demand.getId());
        assertEquals(2, rows.size());
        assertTrue(rows.stream().anyMatch(row -> Boolean.TRUE.equals(row.getPublished())
                && row.getPercentage() == 20));
        assertTrue(rows.stream().noneMatch(row -> row.getId().equals(draft.getId())));
    }

    @Test
    void invalidDemandStatusIsRejectedBeforeExistingDraftReplacement() {
        TestDemand demand = demand();
        demand.setStatus(TestDemand.DemandStatus.rejected);
        demandRepository.saveAndFlush(demand);
        DemandManpowerDetail detail = detail(demand.getId(), "状态拒绝 Task7", "1.0");
        TestStaff staff = staff("状态拒绝人员 Task7", "状态拒绝 Task7");
        Schedule draft = persistedSchedule(demand, detail, staff, 50, false);
        draft = scheduleRepository.saveAndFlush(draft);
        ScheduleRecommendationRequest request = request(demand.getId());
        request.setReplaceExistingDrafts(true);

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.recommend(request));

        assertEquals("DEMAND_NOT_SCHEDULABLE", error.getErrorCode());
        assertTrue(scheduleRepository.existsById(draft.getId()));
    }

    @Test
    void rejectsSpecialStructureBeforeAllocation() {
        TestModuleConfig module = module("结构模块 Task7", "结构组 Task7");
        TestDemand demand = demand();
        special(demand.getId(), module.getId(), "1.0");

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.recommend(request(demand.getId())));

        assertEquals("DEMAND_MANPOWER_STRUCTURE_INVALID", error.getErrorCode());
        assertEquals(0, scheduleRepository.findByDemandId(demand.getId()).size());
    }

    @Test
    void laterFinalEligibilityFailureRollsBackAllGeneratedDrafts() {
        TestDemand demand = demand();
        detail(demand.getId(), "回滚 Task7", "2.0");
        staff("回滚人员一 Task7", "回滚 Task7");
        staff("回滚人员二 Task7", "回滚 Task7");
        AtomicInteger validations = new AtomicInteger();
        doAnswer(invocation -> {
            if (validations.incrementAndGet() == 2) {
                throw new BusinessException("SCHEDULE_PERCENTAGE_INVALID", "测试验证失败");
            }
            return invocation.callRealMethod();
        }).when(eligibilitySpy).validate(any(Schedule.class), isNull(), any(
                ScheduleEligibilityService.ValidationContext.class));

        assertThrows(BusinessException.class, () -> service.recommend(request(demand.getId())));

        assertEquals(0, scheduleRepository.findByDemandId(demand.getId()).size());
    }

    @Test
    void repeatsRecommendationWithSameRepositoryStateDeterministically() {
        TestDemand demand = demand();
        detail(demand.getId(), "稳定 Task7", "2.0");
        TestStaff first = staff("稳定人员一 Task7", "稳定 Task7");
        TestStaff second = staff("稳定人员二 Task7", "稳定 Task7");
        ScheduleRecommendationRequest request = request(demand.getId());
        request.setReplaceExistingDrafts(true);

        ScheduleRecommendationResponse firstResult = service.recommend(request);
        ScheduleRecommendationResponse secondResult = service.recommend(request);

        assertEquals(firstResult.generatedSchedules().stream().map(Schedule::getStaffId).toList(),
                secondResult.generatedSchedules().stream().map(Schedule::getStaffId).toList());
        assertEquals(List.of(first.getId(), second.getId()), firstResult.generatedSchedules().stream()
                .map(Schedule::getStaffId).toList());
    }

    @Test
    void excludesInactiveStaffFromCandidates() {
        TestDemand demand = demand();
        detail(demand.getId(), "在职 Task7", "1.0");
        TestStaff inactive = staff("离职人员 Task7", "在职 Task7");
        inactive.setStatus(TestStaff.StaffStatus.leave);
        staffRepository.save(inactive);

        ScheduleRecommendationResponse result = service.recommend(request(demand.getId()));

        assertEquals(0, result.generatedSchedules().size());
        assertEquals("NO_QUALIFIED_STAFF", result.fulfillment().get(0).generalGaps().get(0).reasonCode());
    }

    @Test
    void fixedEligibleStaffWinsButFixedIneligibleStaffDoesNotBypassModuleRules() {
        TestDemand generalDemand = demand();
        detail(generalDemand.getId(), "固定优先 Task7", "1.0");
        staff("固定普通 Task7", "固定优先 Task7");
        TestStaff fixed = staff("固定人员 Task7", "固定优先 Task7");
        ScheduleRecommendationRequest generalRequest = request(generalDemand.getId());
        generalRequest.setFixedStaffIds(List.of(fixed.getId()));
        ScheduleRecommendationResponse generalResult = service.recommend(generalRequest);
        assertEquals(fixed.getId(), generalResult.generatedSchedules().get(0).getStaffId());

        TestModuleConfig module = module("固定模块 Task7", "固定模块组 Task7");
        TestDemand specialDemand = demand();
        detail(specialDemand.getId(), "固定模块组 Task7", "1.0");
        DemandSpecialModule special = special(specialDemand.getId(), module.getId(), "1.0");
        TestStaff qualified = staff("模块合格 Task7", "其他组 Task7");
        TestStaffModule relation = new TestStaffModule();
        relation.setId(new TestStaffModuleId(qualified.getId(), module.getId()));
        staffModuleRepository.save(relation);
        ScheduleRecommendationRequest specialRequest = request(specialDemand.getId());
        specialRequest.setFixedStaffIds(List.of(fixed.getId()));
        ScheduleRecommendationResponse specialResult = service.recommend(specialRequest);
        assertEquals(qualified.getId(), specialResult.generatedSchedules().get(0).getStaffId());
        assertEquals(special.getId(), specialResult.generatedSchedules().get(0).getDemandSpecialModuleId());
    }

    @Test
    void confidentialDemandUsesOnlyClearedStaff() {
        TestDemand demand = demand();
        demand.setConfidential(true);
        demandRepository.save(demand);
        detail(demand.getId(), "保密 Task7", "1.0");
        TestStaff uncleared = staff("保密未授权 Task7", "保密 Task7");
        TestStaff cleared = staff("保密已授权 Task7", "保密 Task7");
        user(uncleared.getEmpNo(), false);
        user(cleared.getEmpNo(), true);

        ScheduleRecommendationResponse result = service.recommend(request(demand.getId()));

        assertEquals(cleared.getId(), result.generatedSchedules().get(0).getStaffId());
    }

    @Test
    void generalAllocationRequiresExactTestType() {
        TestDemand demand = demand();
        detail(demand.getId(), "精确类型 Task7", "1.0");
        staff("跨类型人员 Task7", "其他类型 Task7");

        ScheduleRecommendationResponse result = service.recommend(request(demand.getId()));

        assertEquals(0, result.generatedSchedules().size());
        assertEquals("NO_QUALIFIED_STAFF", result.fulfillment().get(0).generalGaps().get(0).reasonCode());
    }

    @Test
    void authoritativeFulfillmentFlagsHistoricalDoubleNullRows() {
        TestModuleConfig module = module("历史归类模块 Task7", "历史归类 Task7");
        TestDemand demand = demand();
        DemandManpowerDetail detail = detail(demand.getId(), "历史归类 Task7", "2.0");
        DemandSpecialModule special = special(demand.getId(), module.getId(), "1.0");
        TestStaff specialStaff = staff("历史归类特殊人员 Task7", "其他类型 Task7");
        TestStaff generalStaff = staff("历史归类通用人员 Task7", "历史归类 Task7");
        TestStaffModule relation = new TestStaffModule();
        relation.setId(new TestStaffModuleId(specialStaff.getId(), module.getId()));
        staffModuleRepository.save(relation);
        Schedule historical = new Schedule();
        historical.setDemandId(demand.getId());
        historical.setDate(demand.getStartDate().toLocalDate());
        historical.setPercentage(200);
        historical.setPublished(true);
        scheduleRepository.save(historical);

        ScheduleRecommendationResponse result = service.recommend(request(demand.getId()));

        assertEquals(2, result.generatedSchedules().size());
        assertFalse(result.fulfillment().get(0).fullySatisfied());
        assertTrue(result.fulfillment().get(0).requiresHistoricalClassification());
        assertEquals(0, new BigDecimal("2.0").compareTo(
            result.fulfillment().getFirst().totalRequired()));
        assertEquals(0, new BigDecimal("4.0").compareTo(
            result.fulfillment().getFirst().totalAllocated()));
        assertEquals(detail.getId(), result.generatedSchedules().get(0).getDemandManpowerDetailId());
        assertEquals(special.getId(), result.generatedSchedules().get(0).getDemandSpecialModuleId());
    }

    @Test
    void normalizesNullAndOutOfRangeDailyStatusPercentages() {
        TestDemand nullDemand = demand();
        detail(nullDemand.getId(), "状态空值 Task7", "1.0");
        TestStaff nullStaff = staff("状态空值人员 Task7", "状态空值 Task7");
        dailyStatus(nullStaff, null);

        TestDemand negativeDemand = demand();
        detail(negativeDemand.getId(), "状态负值 Task7", "1.0");
        TestStaff negativeStaff = staff("状态负值人员 Task7", "状态负值 Task7");
        dailyStatus(negativeStaff, -25.0);

        TestDemand highDemand = demand();
        detail(highDemand.getId(), "状态超值 Task7", "1.0");
        TestStaff highStaff = staff("状态超值人员 Task7", "状态超值 Task7");
        dailyStatus(highStaff, 125.0);

        ScheduleRecommendationResponse result = service.recommend(request(
                nullDemand.getId(), negativeDemand.getId()));
        ScheduleRecommendationResponse highResult = service.recommend(request(highDemand.getId()));

        assertEquals(100, result.generatedSchedules().stream()
                .filter(schedule -> schedule.getStaffId().equals(nullStaff.getId()))
                .findFirst().orElseThrow().getPercentage());
        assertEquals(100, result.generatedSchedules().stream()
                .filter(schedule -> schedule.getStaffId().equals(negativeStaff.getId()))
                .findFirst().orElseThrow().getPercentage());
        assertEquals(0, highResult.generatedSchedules().size());
    }

    @Test
    void concentrateStrategyFillsOnePersonBeforeMovingToNext() {
        // Two staff in same testType, demand needs 2.0 person-days (2 days × 100%)
        // Concentrate should fill staff A to 100% on both days, not split between A and B
        TestDemand demand = demand(LocalDate.of(2026, 7, 22), LocalDate.of(2026, 7, 23));
        DemandManpowerDetail detail = detail(demand.getId(), "功能测试 Concentrate", "2.0");
        TestStaff staffA = staff("人员A Concentrate", "功能测试 Concentrate");
        TestStaff staffB = staff("人员B Concentrate", "功能测试 Concentrate");

        ScheduleRecommendationRequest req = request(demand.getId());
        req.setAllocationStrategy(ScheduleRecommendationRequest.AllocationStrategy.CONCENTRATE);
        ScheduleRecommendationResponse result = service.recommend(req);

        assertEquals(2, result.generatedSchedules().size());
        // Both schedules should be for the same staff member (staffA, lower ID = first in sorted order)
        Long firstStaffId = result.generatedSchedules().get(0).getStaffId();
        assertEquals(firstStaffId, result.generatedSchedules().get(1).getStaffId());
        assertEquals(100, result.generatedSchedules().get(0).getPercentage());
        assertEquals(100, result.generatedSchedules().get(1).getPercentage());
        assertTrue(result.fulfillment().get(0).fullySatisfied());
    }

    @Test
    void concentrateStrategyCombinesMultipleDemandsToFillOnePerson() {
        // Two demands, each needing 1.0 person-day, same testType
        // One day only, so only 100% capacity per person
        // Concentrate should fill staffA with 100% from demandA, then demandB goes to staffB
        TestDemand demandA = demand();
        DemandManpowerDetail detailA = detail(demandA.getId(), "功能测试 MultiDemand", "1.0");
        TestDemand demandB = demand();
        DemandManpowerDetail detailB = detail(demandB.getId(), "功能测试 MultiDemand", "1.0");
        TestStaff staffA = staff("人员A MultiDemand", "功能测试 MultiDemand");
        TestStaff staffB = staff("人员B MultiDemand", "功能测试 MultiDemand");

        ScheduleRecommendationRequest req = request(demandA.getId(), demandB.getId());
        req.setAllocationStrategy(ScheduleRecommendationRequest.AllocationStrategy.CONCENTRATE);
        ScheduleRecommendationResponse result = service.recommend(req);

        assertEquals(2, result.generatedSchedules().size());
        // staffA gets first demand (100%), staffB gets second demand
        assertEquals(staffA.getId(), result.generatedSchedules().get(0).getStaffId());
        assertEquals(staffB.getId(), result.generatedSchedules().get(1).getStaffId());
        assertTrue(result.fulfillment().get(0).fullySatisfied());
        assertTrue(result.fulfillment().get(1).fullySatisfied());
    }

    @Test
    void filtersStaffByExactTestExecutorRole() {
        TestDemand demand = demand();
        detail(demand.getId(), "角色过滤 Task7", "3.0");

        // Scenario 1: exact "testExecutor" role → included
        TestStaff exactRole = staff("精确角色人员 Task7", "角色过滤 Task7");
        userWithRoles(exactRole.getEmpNo(), "testExecutor");

        // Scenario 2: "testExecutor" + "testLead" → excluded (multi-role)
        TestStaff multiRole = staff("多角色人员 Task7", "角色过滤 Task7");
        userWithRoles(multiRole.getEmpNo(), "testExecutor", "testLead");

        // Scenario 3: "testLead" only → excluded (wrong single role)
        TestStaff wrongRole = staff("错误角色人员 Task7", "角色过滤 Task7");
        userWithRoles(wrongRole.getEmpNo(), "testLead");

        // Scenario 4: no User association → excluded (delete auto-created User)
        TestStaff noUser = staff("无用户人员 Task7", "角色过滤 Task7");
        userRepository.findByUsername(noUser.getEmpNo()).ifPresent(userRepository::delete);

        // Scenario 5: User with no roles → excluded (update auto-created User to have no roles)
        TestStaff noRoles = staff("无角色人员 Task7", "角色过滤 Task7");
        userRepository.findByUsername(noRoles.getEmpNo()).ifPresent(u -> {
            u.setRoles(new ArrayList<>(List.of()));
            userRepository.save(u);
        });

        ScheduleRecommendationResponse result = service.recommend(request(demand.getId()));

        // Only exactRole should be allocated; others are filtered out by role
        assertEquals(1, result.generatedSchedules().size());
        assertEquals(exactRole.getId(), result.generatedSchedules().get(0).getStaffId());
        // Demand is 3.0 person-days but only 1 qualified staff (100% = 1.0 person-day)
        assertEquals("INSUFFICIENT_CAPACITY", result.fulfillment().get(0).generalGaps().get(0).reasonCode());
    }

    @Test
    void distributeStrategySpreadsWorkAcrossStaff() {
        // Two staff, 2-day demand needing 2.0 person-days
        // DISTRIBUTE (default) should spread across both people:
        //   staffA at 100% on one day, staffB at 100% on the other day
        // Unlike CONCENTRATE which would fill staffA at 100% on both days
        TestDemand demand = demand(LocalDate.of(2026, 7, 22), LocalDate.of(2026, 7, 23));
        DemandManpowerDetail detail = detail(demand.getId(), "功能测试 Distribute", "2.0");
        TestStaff staffA = staff("人员A Distribute", "功能测试 Distribute");
        TestStaff staffB = staff("人员B Distribute", "功能测试 Distribute");

        ScheduleRecommendationRequest req = request(demand.getId());
        // Default is DISTRIBUTE, no need to set explicitly
        ScheduleRecommendationResponse result = service.recommend(req);

        assertEquals(2, result.generatedSchedules().size());
        // Both schedules should be at 100%
        assertEquals(100, result.generatedSchedules().get(0).getPercentage());
        assertEquals(100, result.generatedSchedules().get(1).getPercentage());
        // Both staff members must be used (different staffIds) -- this is the key
        // difference from CONCENTRATE which would use the same staff on both days
        Long firstStaffId = result.generatedSchedules().get(0).getStaffId();
        Long secondStaffId = result.generatedSchedules().get(1).getStaffId();
        assertTrue(firstStaffId.equals(staffA.getId()) || firstStaffId.equals(staffB.getId()),
                "First schedule should be for staffA or staffB");
        assertTrue(secondStaffId.equals(staffA.getId()) || secondStaffId.equals(staffB.getId()),
                "Second schedule should be for staffA or staffB");
        assertNotEquals(firstStaffId, secondStaffId,
                "DISTRIBUTE should spread across different staff, not concentrate on one");
        assertTrue(result.fulfillment().get(0).fullySatisfied());
    }

    private void dailyStatus(TestStaff staff, Double percentage) {
        StaffDailyStatus status = new StaffDailyStatus();
        status.setStaffId(staff.getId());
        status.setDate(LocalDate.of(2026, 7, 22));
        status.setStatus(StaffDailyStatus.DailyAvailabilityStatus.OTHER_TASKS);
        status.setPercentage(percentage);
        statusRepository.save(status);
    }

    private TestModuleConfig module(String name, String testType) {
        TestModuleConfig module = new TestModuleConfig();
        module.setModuleName(name);
        module.setTestType(testType);
        module.setEnabled(true);
        module.setSortOrder(1);
        return moduleRepository.save(module);
    }

    private TestDemand demand() {
        return demand(LocalDate.of(2026, 7, 22), LocalDate.of(2026, 7, 22));
    }

    private TestDemand demand(LocalDate start, LocalDate end) {
        TestDemand demand = new TestDemand();
        demand.setProduct("示例产品");
        demand.setVersion("v1");
        demand.setVersionType("维护");
        demand.setSubmittedBy("测试经理");
        demand.setStartDate(start.atStartOfDay());
        demand.setEndDate(end.atTime(23, 59));
        demand.setStatus(TestDemand.DemandStatus.pending);
        return demandRepository.save(demand);
    }

    private Schedule persistedSchedule(TestDemand demand, DemandManpowerDetail detail,
            TestStaff staff, int percentage, boolean published) {
        Schedule schedule = new Schedule();
        schedule.setDemandId(demand.getId());
        schedule.setStaffId(staff.getId());
        schedule.setDate(demand.getStartDate().toLocalDate());
        schedule.setPercentage(percentage);
        schedule.setDemandManpowerDetailId(detail.getId());
        schedule.setPublished(published);
        return schedule;
    }

    private DemandManpowerDetail detail(Long demandId, String testType, String amount) {
        DemandManpowerDetail detail = new DemandManpowerDetail();
        detail.setDemandId(demandId);
        detail.setTestType(testType);
        detail.setManpowerDemand(new BigDecimal(amount));
        return detailRepository.save(detail);
    }

    private DemandSpecialModule special(Long demandId, Long moduleId, String amount) {
        DemandSpecialModule special = new DemandSpecialModule();
        special.setDemandId(demandId);
        special.setModuleId(moduleId);
        special.setManpowerDemand(new BigDecimal(amount));
        return specialRepository.save(special);
    }

    private TestStaff staff(String name, String testType) {
        TestStaff staff = new TestStaff();
        staff.setName(name);
        staff.setEmpNo("E" + name.hashCode());
        staff.setTestType(testType);
        staff.setStatus(TestStaff.StaffStatus.active);
        staff.setCurrentCoefficient(BigDecimal.ONE);
        TestStaff saved = staffRepository.save(staff);
        // Create matching User with test executor role for role-based filtering
        User u = new User();
        u.setUsername(saved.getEmpNo());
        u.setPassword("encoded");
        u.setRoles(new ArrayList<>(List.of("testExecutor")));
        userRepository.save(u);
        return saved;
    }

    private User user(String username, boolean clearance) {
        User user = userRepository.findByUsername(username)
                .orElseGet(() -> {
                    User u = new User();
                    u.setUsername(username);
                    u.setPassword("encoded");
                    return u;
                });
        user.setConfidentialClearance(clearance);
        user.setRoles(new ArrayList<>(List.of("testExecutor")));
        return userRepository.save(user);
    }

    private User userWithRoles(String username, String... roles) {
        User user = userRepository.findByUsername(username)
                .orElseGet(() -> {
                    User u = new User();
                    u.setUsername(username);
                    u.setPassword("encoded");
                    u.setConfidentialClearance(false);
                    return u;
                });
        user.setRoles(new ArrayList<>(List.of(roles)));
        return userRepository.save(user);
    }

    private ScheduleRecommendationRequest request(Long demandId) {
        return request(demandId, null);
    }

    private ScheduleRecommendationRequest request(Long firstDemandId, Long secondDemandId) {
        ScheduleRecommendationRequest request = new ScheduleRecommendationRequest();
        request.setMode(ScheduleRecommendationRequest.Mode.FULL_DEMAND);
        request.setDemandIds(secondDemandId == null ? List.of(firstDemandId)
                : List.of(firstDemandId, secondDemandId));
        request.setFixedStaffIds(List.of());
        request.setExcludedStaffIds(List.of());
        request.setIncludeSaturdays(true);
        request.setIncludeSundays(true);
        request.setReplaceExistingDrafts(false);
        return request;
    }

}
