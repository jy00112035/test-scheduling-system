package com.testscheduling.service;

import com.testscheduling.dto.ScheduleRecommendationRequest;
import com.testscheduling.entity.DemandManpowerDetail;
import com.testscheduling.entity.DemandSpecialModule;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.entity.TestStaffModule;
import com.testscheduling.entity.TestStaffModuleId;
import com.testscheduling.repository.DemandManpowerDetailRepository;
import com.testscheduling.repository.DemandSpecialModuleRepository;
import com.testscheduling.repository.ScheduleRepository;
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
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@SpringBootTest
@Transactional
class ScheduleRecommendationBulkLockIntegrationTest {

    private static final String DATABASE_URL = "jdbc:h2:mem:recommendation-bulk-lock-"
            + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1";

    @DynamicPropertySource
    static void useUniqueDatabase(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> DATABASE_URL);
    }

    @Autowired ScheduleRecommendationService service;
    @Autowired DemandManpowerDetailRepository detailRepository;
    @Autowired DemandSpecialModuleRepository specialRepository;
    @Autowired TestStaffModuleRepository staffModuleRepository;
    @SpyBean TestDemandRepository demandRepository;
    @SpyBean TestModuleConfigRepository moduleRepository;
    @SpyBean TestStaffRepository staffRepository;
    @SpyBean ScheduleRepository scheduleRepository;

    @Test
    void locksEachScopeAndDeletesDraftsInBulkForMultiRowBatch() {
        TestModuleConfig firstModule = module("bulk-module-a", "bulk-type-a");
        TestModuleConfig secondModule = module("bulk-module-b", "bulk-type-b");
        TestDemand firstDemand = demand();
        TestDemand secondDemand = demand();
        detail(firstDemand, "bulk-type-a");
        detail(secondDemand, "bulk-type-b");
        special(firstDemand, firstModule);
        special(secondDemand, secondModule);
        TestStaff firstSpecialStaff = staff("bulk-special-a", "other-a");
        TestStaff secondSpecialStaff = staff("bulk-special-b", "other-b");
        familiar(firstSpecialStaff, firstModule);
        familiar(secondSpecialStaff, secondModule);
        staff("bulk-general-a", "bulk-type-a");
        staff("bulk-general-b", "bulk-type-b");

        ScheduleRecommendationRequest request = new ScheduleRecommendationRequest();
        request.setMode(ScheduleRecommendationRequest.Mode.FULL_DEMAND);
        request.setDemandIds(List.of(secondDemand.getId(), firstDemand.getId()));
        request.setReplaceExistingDrafts(true);
        request.setIncludeSaturdays(true);
        request.setIncludeSundays(true);

        service.recommend(request);

        List<Long> demandIds = List.of(firstDemand.getId(), secondDemand.getId()).stream().sorted().toList();
        List<Long> moduleIds = List.of(firstModule.getId(), secondModule.getId()).stream().sorted().toList();
        List<Long> staffIds = staffRepository.findByStatus(TestStaff.StaffStatus.active).stream()
                .map(TestStaff::getId).sorted().toList();
        verify(demandRepository, times(1)).findAllByIdInForUpdate(demandIds);
        verify(moduleRepository, times(1)).findAllByIdInForUpdate(moduleIds);
        verify(staffRepository, times(1)).findAllByIdInForUpdate(staffIds);
        verify(scheduleRepository, times(1)).deleteDraftsByDemandIdIn(demandIds);
        verify(demandRepository, never()).findByIdForUpdate(anyLong());
        verify(moduleRepository, never()).findByIdForUpdate(anyLong());
        verify(staffRepository, never()).findByIdForUpdate(anyLong());
        verify(scheduleRepository, never()).deleteByDemandIdAndPublishedFalse(anyLong());
    }

    private TestDemand demand() {
        TestDemand demand = new TestDemand();
        demand.setProduct("bulk-product");
        demand.setVersion("v1");
        demand.setVersionType("maint");
        demand.setSubmittedBy("manager");
        demand.setStartDate(LocalDate.of(2026, 7, 22).atStartOfDay());
        demand.setEndDate(LocalDate.of(2026, 7, 22).atTime(23, 59));
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

    private void detail(TestDemand demand, String type) {
        DemandManpowerDetail detail = new DemandManpowerDetail();
        detail.setDemandId(demand.getId());
        detail.setTestType(type);
        detail.setManpowerDemand(BigDecimal.ONE);
        detailRepository.saveAndFlush(detail);
    }

    private DemandSpecialModule special(TestDemand demand, TestModuleConfig module) {
        DemandSpecialModule special = new DemandSpecialModule();
        special.setDemandId(demand.getId());
        special.setModuleId(module.getId());
        special.setManpowerDemand(BigDecimal.ONE);
        return specialRepository.saveAndFlush(special);
    }

    private TestStaff staff(String name, String type) {
        TestStaff staff = new TestStaff();
        staff.setName(name);
        staff.setEmpNo(name);
        staff.setTestType(type);
        staff.setStatus(TestStaff.StaffStatus.active);
        staff.setCurrentCoefficient(BigDecimal.ONE);
        return staffRepository.saveAndFlush(staff);
    }

    private void familiar(TestStaff staff, TestModuleConfig module) {
        TestStaffModule relation = new TestStaffModule();
        relation.setId(new TestStaffModuleId(staff.getId(), module.getId()));
        staffModuleRepository.saveAndFlush(relation);
    }
}
