package com.testscheduling.service;

import com.testscheduling.entity.DemandManpowerDetail;
import com.testscheduling.entity.DemandSpecialModule;
import com.testscheduling.entity.Schedule;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.entity.TestModuleConfig;
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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

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
    }

    @Test
    void rawSpecialRowsUseConfiguredModuleGroupWhenTransientTypeIsMissing() {
        DemandManpowerDetail group = group(301L, "功能测试", "2.0");
        DemandSpecialModule special = special(501L, 11L, "1.0", "支付模块");
        special.setTestType(null);
        TestModuleConfig module = new TestModuleConfig();
        module.setId(11L);
        module.setTestType("功能测试");
        when(moduleRepository.findById(11L)).thenReturn(java.util.Optional.of(module));
        given(1001L, List.of(group), List.of(special), List.of(schedule(501L, 301L, 100),
            schedule(null, 301L, 100)));

        var result = service.calculate(1001L);

        assertTrue(result.fullySatisfied());
    }

    private void given(Long demandId, List<DemandManpowerDetail> groups,
                       List<DemandSpecialModule> specials, List<Schedule> schedules) {
        when(detailRepository.findByDemandId(demandId)).thenReturn(groups);
        when(specialRepository.findByDemandIdOrderByIdAsc(demandId)).thenReturn(specials);
        when(scheduleRepository.findByDemandId(demandId)).thenReturn(schedules);
    }

    private static DemandManpowerDetail group(Long id, String testType, String manpower) {
        DemandManpowerDetail group = new DemandManpowerDetail();
        group.setId(id);
        group.setDemandId(1001L);
        group.setTestType(testType);
        group.setManpowerDemand(new BigDecimal(manpower));
        return group;
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

    private static Schedule schedule(Long specialId, Long detailId, int percentage) {
        Schedule schedule = new Schedule();
        schedule.setDemandId(1001L);
        schedule.setDemandManpowerDetailId(detailId);
        schedule.setDemandSpecialModuleId(specialId);
        schedule.setPercentage(percentage);
        return schedule;
    }
}
