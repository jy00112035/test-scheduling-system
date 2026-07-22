package com.testscheduling.service;

import com.testscheduling.dto.DemandFulfillmentResponse;
import com.testscheduling.entity.DemandManpowerDetail;
import com.testscheduling.entity.DemandSpecialModule;
import com.testscheduling.entity.Schedule;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.DemandManpowerDetailRepository;
import com.testscheduling.repository.DemandSpecialModuleRepository;
import com.testscheduling.repository.ScheduleRepository;
import com.testscheduling.repository.TestModuleConfigRepository;
import com.testscheduling.repository.TestDemandRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.anyList;
import static org.mockito.Mockito.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class DemandFulfillmentServiceTest {

    @Mock
    private DemandManpowerDetailRepository detailRepository;
    @Mock
    private DemandSpecialModuleRepository specialRepository;
    @Mock
    private ScheduleRepository scheduleRepository;
    @Mock
    private TestModuleConfigRepository moduleRepository;
    @Mock
    private TestDemandRepository demandRepository;

    private DemandFulfillmentService service;

    @BeforeEach
    void setUp() {
        service = new DemandFulfillmentService(
            demandRepository, detailRepository, specialRepository, scheduleRepository, moduleRepository);
    }

    @Test
    void totalAllocationIsNotEnoughWhenSpecialModuleStillHasGap() {
        DemandManpowerDetail group = group(301L, "功能测试", "8.0");
        DemandSpecialModule special = special(501L, 11L, "2.0", "支付模块");
        List<Schedule> schedules = new ArrayList<>();
        schedules.add(schedule(501L, 301L, 100));
        for (int i = 0; i < 6; i++) {
            schedules.add(schedule(null, 301L, 100));
        }
        given(1001L, List.of(group), List.of(special), schedules);

        var result = service.calculate(1001L);

        assertFalse(result.fullySatisfied());
        assertEquals(new BigDecimal("1.0"), result.specialModuleGaps().getFirst().shortage());
        assertTrue(result.generalGaps().isEmpty());
    }

    @Test
    void allSpecialAndGeneralBucketsExactlySatisfied() {
        DemandManpowerDetail group = group(301L, "功能测试", "8.0");
        DemandSpecialModule special = special(501L, 11L, "2.0", "支付模块");
        List<Schedule> schedules = List.of(
            schedule(501L, 301L, 200), schedule(null, 301L, 600));
        given(1001L, List.of(group), List.of(special), schedules);

        var result = service.calculate(1001L);

        assertTrue(result.fullySatisfied());
        assertTrue(result.specialModuleGaps().isEmpty());
        assertTrue(result.generalGaps().isEmpty());
    }

    @Test
    void reportsZeroPartialAndFullSpecialAllocationsByOwnership() {
        DemandManpowerDetail group = group(301L, "功能测试", "7.0");
        DemandSpecialModule zero = special(501L, 11L, "1.0", "支付模块");
        DemandSpecialModule partial = special(502L, 12L, "2.0", "消息模块");
        DemandSpecialModule full = special(503L, 13L, "1.0", "账户模块");
        given(1001L, List.of(group), List.of(zero, partial, full), List.of(
            schedule(502L, 301L, 50),
            schedule(503L, 301L, 100),
            schedule(999L, 301L, 100)));

        var result = service.calculate(1001L);

        assertEquals(List.of(501L, 502L, 503L), result.specialModules().stream()
            .map(DemandFulfillmentResponse.SpecialModuleSummary::demandSpecialModuleId)
            .toList());
        assertSpecialSummary(result, 501L, "1.0", "0", "1.0");
        assertSpecialSummary(result, 502L, "2.0", "0.5", "1.5");
        assertSpecialSummary(result, 503L, "1.0", "1.0", "0.0");
    }

    @Test
    void overAllocationClampsShortageToZero() {
        DemandManpowerDetail group = group(301L, "功能测试", "4.0");
        DemandSpecialModule special = special(501L, 11L, "1.0", "支付模块");
        given(1001L, List.of(group), List.of(special), List.of(
            schedule(501L, 301L, 200), schedule(null, 301L, 600)));

        var result = service.calculate(1001L);

        assertTrue(result.fullySatisfied());
        assertEquals(0, new BigDecimal("0.0").compareTo(result.totalShortage()));
    }

    @Test
    void structuredSpecialModulesAndDoubleNullScheduleRequireClassification() {
        DemandManpowerDetail group = group(301L, "功能测试", "2.0");
        DemandSpecialModule special = special(501L, 11L, "1.0", "支付模块");
        given(1001L, List.of(group), List.of(special), List.of(schedule(null, null, 200)));

        var result = service.calculate(1001L);

        assertTrue(result.requiresHistoricalClassification());
        assertFalse(result.fullySatisfied());
        assertEquals(new BigDecimal("1.0"), result.specialModuleGaps().getFirst().shortage());
        assertEquals(new BigDecimal("1.0"), result.generalGaps().getFirst().shortage());
        assertEquals(0, new BigDecimal("2.0").compareTo(result.totalAllocated()));
    }

    @Test
    void legacyDemandUsesDemandLevelTotalForDoubleNullSchedules() {
        TestDemand demand = new TestDemand();
        demand.setId(1001L);
        demand.setManpowerDemand(new BigDecimal("2.0"));
        when(detailRepository.findByDemandId(1001L)).thenReturn(List.of());
        when(specialRepository.findByDemandIdOrderByIdAsc(1001L)).thenReturn(List.of());
        when(scheduleRepository.findByDemandId(1001L)).thenReturn(List.of(schedule(null, null, 200)));

        var result = service.calculate(demand);

        assertTrue(result.fullySatisfied());
        assertFalse(result.requiresHistoricalClassification());
    }

    @Test
    void structuredDetailsWithoutSpecialsUseDetailLevelGeneralAccounting() {
        DemandManpowerDetail group = group(301L, "功能测试", "2.0");
        given(1001L, List.of(group), List.of(), List.of(schedule(null, 301L, 200)));

        var result = service.calculate(1001L);

        assertTrue(result.fullySatisfied());
        assertEquals("功能测试", result.summary().getFirst().testType());
    }

    @Test
    void structuredDetailsWithoutSpecialsIgnoreDoubleNullHistoricalSchedule() {
        DemandManpowerDetail group = group(301L, "功能测试", "2.0");
        given(1001L, List.of(group), List.of(), List.of(
            schedule(null, null, 200), schedule(null, 301L, 200)));

        var result = service.calculate(1001L);

        assertFalse(result.requiresHistoricalClassification());
        assertTrue(result.fullySatisfied());
        assertTrue(result.generalGaps().isEmpty());
        assertEquals(0, new BigDecimal("4.0").compareTo(result.totalAllocated()));
    }

    @Test
    void rawSpecialRowsUseConfiguredModuleGroupWhenTransientTypeIsMissing() {
        DemandManpowerDetail group = group(301L, "功能测试", "2.0");
        DemandSpecialModule special = special(501L, 11L, "1.0", "支付模块");
        special.setTestType(null);
        given(1001L, List.of(group), List.of(special), List.of(schedule(501L, 301L, 100),
            schedule(null, 301L, 100)));

        var result = service.calculate(1001L);

        assertTrue(result.fullySatisfied());
    }

    @Test
    void batchCalculationLoadsSchedulesAndModulesOnceForAllDemands() {
        TestDemand first = demand(1001L, "2.0");
        TestDemand second = demand(1002L, "2.0");
        DemandManpowerDetail firstGroup = group(301L, "功能测试", "2.0");
        firstGroup.setDemandId(1001L);
        DemandManpowerDetail secondGroup = group(302L, "功能测试", "2.0");
        secondGroup.setDemandId(1002L);
        DemandSpecialModule firstSpecial = special(501L, 11L, "1.0", "支付模块");
        firstSpecial.setDemandId(1001L);
        DemandSpecialModule secondSpecial = special(502L, 12L, "1.0", "消息模块");
        secondSpecial.setDemandId(1002L);
        TestModuleConfig payment = module(11L, "支付模块", "功能测试");
        TestModuleConfig message = module(12L, "消息模块", "功能测试");
        when(scheduleRepository.findByDemandIdIn(List.of(1001L, 1002L))).thenReturn(List.of());
        when(moduleRepository.findAllById(anyList())).thenReturn(List.of(payment, message));

        Map<Long, DemandFulfillmentResponse> results = service.calculateBatch(
            List.of(first, second),
            Map.of(1001L, List.of(firstGroup), 1002L, List.of(secondGroup)),
            Map.of(1001L, List.of(firstSpecial), 1002L, List.of(secondSpecial)));

        assertEquals(2, results.size());
        verify(scheduleRepository, times(1)).findByDemandIdIn(List.of(1001L, 1002L));
        verify(moduleRepository, times(1)).findAllById(anyList());
        verify(detailRepository, never()).findByDemandId(any(Long.class));
        verify(specialRepository, never()).findByDemandIdOrderByIdAsc(any(Long.class));
    }

    private void assertSpecialSummary(
            DemandFulfillmentResponse result,
            Long specialId,
            String required,
            String allocated,
            String remaining) {
        DemandFulfillmentResponse.SpecialModuleSummary summary = result.specialModules().stream()
            .filter(candidate -> candidate.demandSpecialModuleId().equals(specialId))
            .findFirst()
            .orElseThrow();
        assertEquals(0, new BigDecimal(required).compareTo(summary.required()));
        assertEquals(0, new BigDecimal(allocated).compareTo(summary.allocated()));
        assertEquals(0, new BigDecimal(remaining).compareTo(summary.remaining()));
    }

    @Test
    void calculateRejectsNullAndMissingDemandBoundaries() {
        when(demandRepository.findById(999L)).thenReturn(Optional.empty());

        assertBusinessCode(() -> service.calculate((Long) null));
        assertBusinessCode(() -> service.calculate((TestDemand) null));
        TestDemand withoutId = new TestDemand();
        assertBusinessCode(() -> service.calculate(withoutId));
        assertBusinessCode(() -> service.calculate(999L));
    }

    @Test
    void historicalPercentagesUseTwoDecimalDaysAndNullOrZeroDoNotAllocate() {
        DemandManpowerDetail group = group(301L, "功能测试", "2.0");
        DemandSpecialModule special = special(501L, 11L, "1.0", "支付模块");
        given(1001L, List.of(group), List.of(special), List.of(
            schedule(501L, 301L, 25), schedule(null, 301L, 55),
            schedule(null, 301L, 0), schedule(null, 301L, null)));

        var result = service.calculate(1001L);

        assertEquals(new BigDecimal("0.25"), result.specialModuleGaps().getFirst().allocated());
        assertEquals(new BigDecimal("0.55"), result.generalGaps().getFirst().allocated());
        assertEquals(new BigDecimal("0.80"), result.totalAllocated());
    }

    @Test
    void negativePersistedPercentageIsRejected() {
        DemandManpowerDetail group = group(301L, "功能测试", "2.0");
        given(1001L, List.of(group), List.of(), List.of(schedule(null, 301L, -10)));

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.calculate(1001L));

        assertEquals("DEMAND_MANPOWER_STRUCTURE_INVALID", error.getErrorCode());

        group.setTestType(" ");
        BusinessException blank = assertThrows(BusinessException.class,
            () -> service.calculate(1001L));
        assertEquals("DEMAND_MANPOWER_STRUCTURE_INVALID", blank.getErrorCode());
    }

    @Test
    void percentageAboveOneHundredRemainsHistoricalCompatible() {
        DemandManpowerDetail group = group(301L, "功能测试", "2.0");
        given(1001L, List.of(group), List.of(), List.of(schedule(null, 301L, 200)));

        var result = service.calculate(1001L);

        assertEquals(new BigDecimal("2.00"), result.totalAllocated());
        assertTrue(result.fullySatisfied());
    }

    @Test
    void missingModuleConfigIsRejected() {
        DemandManpowerDetail group = group(301L, "功能测试", "2.0");
        DemandSpecialModule special = special(501L, 11L, "1.0", "支付模块");
        given(1001L, List.of(group), List.of(special), List.of());
        when(moduleRepository.findAllById(List.of(11L))).thenReturn(List.of());

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.calculate(1001L));

        assertEquals("MODULE_NOT_FOUND", error.getErrorCode());
    }

    @Test
    void moduleWithoutGroupOrWithMismatchedGroupIsRejected() {
        DemandManpowerDetail group = group(301L, "功能测试", "2.0");
        DemandSpecialModule special = special(501L, 11L, "1.0", "支付模块");
        given(1001L, List.of(group), List.of(special), List.of());
        when(moduleRepository.findAllById(List.of(11L)))
            .thenReturn(List.of(module(11L, "支付模块", "性能测试")));

        BusinessException mismatch = assertThrows(BusinessException.class,
            () -> service.calculate(1001L));
        assertEquals("DEMAND_MANPOWER_STRUCTURE_INVALID", mismatch.getErrorCode());

        when(moduleRepository.findAllById(List.of(11L)))
            .thenReturn(List.of(module(11L, "支付模块", " ")));
        BusinessException blank = assertThrows(BusinessException.class,
            () -> service.calculate(1001L));
        assertEquals("DEMAND_MANPOWER_STRUCTURE_INVALID", blank.getErrorCode());
    }

    @Test
    void nullOrBlankDetailTypeIsRejectedAsStructuredDataError() {
        DemandManpowerDetail group = group(301L, null, "2.0");
        given(1001L, List.of(group), List.of(), List.of());

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.calculate(1001L));

        assertEquals("DEMAND_MANPOWER_STRUCTURE_INVALID", error.getErrorCode());
    }

    @Test
    void blankDetailTypeIsRejectedAsStructuredDataError() {
        DemandManpowerDetail group = group(301L, " ", "2.0");
        given(1001L, List.of(group), List.of(), List.of());

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.calculate(1001L));

        assertEquals("DEMAND_MANPOWER_STRUCTURE_INVALID", error.getErrorCode());
    }

    @Test
    void summaryShortageSumsIndividuallyClampedSpecialGaps() {
        DemandManpowerDetail group = group(301L, "功能测试", "2.0");
        DemandSpecialModule first = special(501L, 11L, "1.0", "支付模块");
        DemandSpecialModule second = special(502L, 12L, "1.0", "消息模块");
        given(1001L, List.of(group), List.of(first, second), List.of(schedule(501L, 301L, 200)));
        when(moduleRepository.findAllById(List.of(11L, 12L))).thenReturn(List.of(
            module(11L, "支付模块", "功能测试"), module(12L, "消息模块", "功能测试")));

        var result = service.calculate(1001L);

        assertEquals(new BigDecimal("1.0"), result.summary().getFirst().shortage());
        assertEquals(new BigDecimal("1.0"), result.totalShortage());
        assertFalse(result.fullySatisfied());
    }

    private void given(Long demandId, List<DemandManpowerDetail> groups,
                       List<DemandSpecialModule> specials, List<Schedule> schedules) {
        when(detailRepository.findByDemandId(demandId)).thenReturn(groups);
        when(specialRepository.findByDemandIdOrderByIdAsc(demandId)).thenReturn(specials);
        when(scheduleRepository.findByDemandId(demandId)).thenReturn(schedules);
        if (!specials.isEmpty()) {
            List<Long> moduleIds = specials.stream().map(DemandSpecialModule::getModuleId).toList();
            lenient().when(moduleRepository.findAllById(moduleIds)).thenReturn(specials.stream()
                .map(special -> module(special.getModuleId(), special.getModuleName(),
                    special.getTestType() == null ? "功能测试" : special.getTestType()))
                .toList());
        }
    }

    private static DemandManpowerDetail group(Long id, String testType, String manpower) {
        DemandManpowerDetail group = new DemandManpowerDetail();
        group.setId(id);
        group.setDemandId(1001L);
        group.setTestType(testType);
        group.setManpowerDemand(new BigDecimal(manpower));
        return group;
    }

    private static TestDemand demand(Long id, String manpower) {
        TestDemand demand = new TestDemand();
        demand.setId(id);
        demand.setManpowerDemand(new BigDecimal(manpower));
        return demand;
    }

    private static TestModuleConfig module(Long id, String name, String testType) {
        TestModuleConfig module = new TestModuleConfig();
        module.setId(id);
        module.setModuleName(name);
        module.setTestType(testType);
        return module;
    }

    private static void assertBusinessCode(Runnable action) {
        BusinessException error = assertThrows(BusinessException.class, action::run);
        assertEquals("DEMAND_NOT_FOUND", error.getErrorCode());
    }

    private static DemandSpecialModule special(Long id, Long moduleId, String manpower, String name) {
        DemandSpecialModule special = new DemandSpecialModule();
        special.setId(id);
        special.setDemandId(1001L);
        special.setModuleId(moduleId);
        special.setManpowerDemand(new BigDecimal(manpower));
        special.setModuleName(name);
        special.setTestType("功能测试");
        return special;
    }

    private static Schedule schedule(Long specialId, Long detailId, Integer percentage) {
        Schedule schedule = new Schedule();
        schedule.setDemandId(1001L);
        schedule.setDemandManpowerDetailId(detailId);
        schedule.setDemandSpecialModuleId(specialId);
        schedule.setPercentage(percentage);
        return schedule;
    }
}
