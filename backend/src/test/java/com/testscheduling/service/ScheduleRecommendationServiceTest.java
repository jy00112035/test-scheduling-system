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
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.DemandManpowerDetailRepository;
import com.testscheduling.repository.DemandSpecialModuleRepository;
import com.testscheduling.repository.TestDemandRepository;
import com.testscheduling.repository.TestModuleConfigRepository;
import com.testscheduling.repository.TestStaffModuleRepository;
import com.testscheduling.repository.TestStaffRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

@SpringBootTest
@Transactional
class ScheduleRecommendationServiceTest {

    @Autowired ScheduleRecommendationService service;
    @Autowired TestDemandRepository demandRepository;
    @Autowired DemandManpowerDetailRepository detailRepository;
    @Autowired TestModuleConfigRepository moduleRepository;
    @Autowired DemandSpecialModuleRepository specialRepository;
    @Autowired TestStaffRepository staffRepository;
    @Autowired TestStaffModuleRepository staffModuleRepository;

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
        assertEquals(0, result.fulfillment().get(0).specialModuleGaps().size());
        assertEquals(0, result.fulfillment().get(0).generalGaps().size());
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

    private TestModuleConfig module(String name, String testType) {
        TestModuleConfig module = new TestModuleConfig();
        module.setModuleName(name);
        module.setTestType(testType);
        module.setEnabled(true);
        module.setSortOrder(1);
        return moduleRepository.save(module);
    }

    private TestDemand demand() {
        TestDemand demand = new TestDemand();
        demand.setProduct("示例产品");
        demand.setVersion("v1");
        demand.setVersionType("维护");
        demand.setSubmittedBy("测试经理");
        demand.setStartDate(LocalDateTime.of(2026, 7, 22, 0, 0));
        demand.setEndDate(LocalDateTime.of(2026, 7, 22, 23, 59));
        demand.setStatus(TestDemand.DemandStatus.pending);
        return demandRepository.save(demand);
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
        return staffRepository.save(staff);
    }

    private ScheduleRecommendationRequest request(Long demandId) {
        ScheduleRecommendationRequest request = new ScheduleRecommendationRequest();
        request.setMode(ScheduleRecommendationRequest.Mode.FULL_DEMAND);
        request.setDemandIds(List.of(demandId));
        request.setFixedStaffIds(List.of());
        request.setExcludedStaffIds(List.of());
        request.setIncludeSaturdays(true);
        request.setIncludeSundays(true);
        request.setReplaceExistingDrafts(false);
        return request;
    }
}
