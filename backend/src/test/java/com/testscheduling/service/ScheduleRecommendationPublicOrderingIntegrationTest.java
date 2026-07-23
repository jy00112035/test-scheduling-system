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
import com.testscheduling.repository.DemandManpowerDetailRepository;
import com.testscheduling.repository.DemandSpecialModuleRepository;
import com.testscheduling.repository.TestDemandRepository;
import com.testscheduling.repository.TestModuleConfigRepository;
import com.testscheduling.repository.TestStaffModuleRepository;
import com.testscheduling.repository.TestStaffRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;

@SpringBootTest
@Transactional
class ScheduleRecommendationPublicOrderingIntegrationTest {

    private static final LocalDate DATE = LocalDate.of(2026, 7, 22);
    private static final String DATABASE_URL = "jdbc:h2:mem:recommendation-public-order-"
            + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1";

    @DynamicPropertySource
    static void useUniqueDatabase(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> DATABASE_URL);
    }

    @Autowired ScheduleRecommendationService service;
    @Autowired TestDemandRepository demandRepository;
    @Autowired TestModuleConfigRepository moduleRepository;
    @Autowired TestStaffRepository staffRepository;
    @Autowired TestStaffModuleRepository staffModuleRepository;
    @SpyBean DemandManpowerDetailRepository detailRepository;
    @SpyBean DemandSpecialModuleRepository specialRepository;

    @Test
    void publicRecommendationIsStableWhenDetailsAndSpecialsArriveShuffled() {
        TestModuleConfig moduleA = module("module-a-order", "A-order");
        TestModuleConfig moduleB = module("module-b-order", "B-order");
        TestDemand demand = demand();
        DemandManpowerDetail detailA = detail(demand.getId(), "A-order", "2.0");
        DemandManpowerDetail detailB = detail(demand.getId(), "B-order", "2.0");
        DemandSpecialModule specialA = special(demand.getId(), moduleA.getId(), "1.0");
        DemandSpecialModule specialB = special(demand.getId(), moduleB.getId(), "0.5");

        TestStaff specialStaffA = staff("ORDER-SPECIAL-A", "unrelated-a");
        TestStaff specialStaffB = staff("ORDER-SPECIAL-B", "unrelated-b");
        staffModuleRepository.saveAndFlush(new TestStaffModule(specialStaffA.getId(), moduleA.getId()));
        staffModuleRepository.saveAndFlush(new TestStaffModule(specialStaffB.getId(), moduleB.getId()));
        TestStaff generalStaffA = staff("ORDER-GENERAL-A", "A-order");
        TestStaff generalStaffB = staff("ORDER-GENERAL-B", "B-order");
        generalStaffB.setCurrentCoefficient(new BigDecimal("1.5"));
        staffRepository.saveAndFlush(generalStaffB);

        doReturn(List.of(detailB, detailA)).when(detailRepository).findByDemandIdIn(any());
        doReturn(List.of(specialB, specialA)).when(specialRepository)
                .findByDemandIdInOrderByDemandIdAscIdAsc(any());
        ScheduleRecommendationResponse first = service.recommend(request(demand.getId()));
        List<Signature> firstSequence = signatures(first.generatedSchedules());

        doReturn(List.of(detailA, detailB)).when(detailRepository).findByDemandIdIn(any());
        doReturn(List.of(specialA, specialB)).when(specialRepository)
                .findByDemandIdInOrderByDemandIdAscIdAsc(any());
        ScheduleRecommendationResponse second = service.recommend(request(demand.getId()));
        List<Signature> secondSequence = signatures(second.generatedSchedules());

        assertEquals(firstSequence, secondSequence);
        assertEquals(List.of(
                new Signature(specialStaffA.getId(), detailA.getId(), specialA.getId(), 100),
                new Signature(specialStaffB.getId(), detailB.getId(), specialB.getId(), 50),
                new Signature(generalStaffA.getId(), detailA.getId(), null, 100),
                new Signature(generalStaffB.getId(), detailB.getId(), null, 100),
                new Signature(generalStaffB.getId(), detailB.getId(), null, 50)), firstSequence);
    }

    private List<Signature> signatures(List<Schedule> schedules) {
        return schedules.stream().map(schedule -> new Signature(schedule.getStaffId(),
                schedule.getDemandManpowerDetailId(), schedule.getDemandSpecialModuleId(),
                schedule.getPercentage())).toList();
    }

    private ScheduleRecommendationRequest request(Long demandId) {
        ScheduleRecommendationRequest request = new ScheduleRecommendationRequest();
        request.setMode(ScheduleRecommendationRequest.Mode.FULL_DEMAND);
        request.setDemandIds(List.of(demandId));
        request.setIncludeSaturdays(true);
        request.setIncludeSundays(true);
        request.setReplaceExistingDrafts(true);
        return request;
    }

    private TestDemand demand() {
        TestDemand demand = new TestDemand();
        demand.setProduct("public-order");
        demand.setVersion("v1");
        demand.setVersionType("maint");
        demand.setSubmittedBy("manager");
        demand.setStartDate(DATE.atStartOfDay());
        demand.setEndDate(DATE.atTime(23, 59));
        demand.setStatus(TestDemand.DemandStatus.pending);
        return demandRepository.saveAndFlush(demand);
    }

    private TestModuleConfig module(String name, String type) {
        TestModuleConfig module = new TestModuleConfig();
        module.setModuleName(name);
        module.setTestType(type);
        module.setEnabled(true);
        module.setSortOrder(1);
        return moduleRepository.saveAndFlush(module);
    }

    private DemandManpowerDetail detail(Long demandId, String type, String amount) {
        DemandManpowerDetail detail = new DemandManpowerDetail();
        detail.setDemandId(demandId);
        detail.setTestType(type);
        detail.setManpowerDemand(new BigDecimal(amount));
        return detailRepository.saveAndFlush(detail);
    }

    private DemandSpecialModule special(Long demandId, Long moduleId, String amount) {
        DemandSpecialModule special = new DemandSpecialModule();
        special.setDemandId(demandId);
        special.setModuleId(moduleId);
        special.setManpowerDemand(new BigDecimal(amount));
        return specialRepository.saveAndFlush(special);
    }

    private TestStaff staff(String empNo, String type) {
        TestStaff staff = new TestStaff();
        staff.setName(empNo);
        staff.setEmpNo(empNo);
        staff.setTestType(type);
        staff.setStatus(TestStaff.StaffStatus.active);
        staff.setCurrentCoefficient(BigDecimal.ONE);
        return staffRepository.saveAndFlush(staff);
    }

    private record Signature(Long staffId, Long detailId, Long specialId, Integer percentage) { }
}
