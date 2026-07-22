package com.testscheduling.service;

import com.testscheduling.dto.ScheduleRecommendationRequest;
import com.testscheduling.entity.DemandManpowerDetail;
import com.testscheduling.entity.Schedule;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.entity.TestStaff;
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
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ScheduleRecommendationConcurrencyTest {

    @Mock TestDemandRepository demandRepository;
    @Mock DemandManpowerDetailRepository detailRepository;
    @Mock DemandSpecialModuleRepository specialRepository;
    @Mock TestModuleConfigRepository moduleRepository;
    @Mock TestStaffRepository staffRepository;
    @Mock TestStaffModuleRepository staffModuleRepository;
    @Mock ScheduleRepository scheduleRepository;
    @Mock StaffDailyStatusRepository statusRepository;
    @Mock UserRepository userRepository;
    @Mock ScheduleEligibilityService eligibilityService;
    @Mock DemandFulfillmentService fulfillmentService;
    @Mock PlatformTransactionManager transactionManager;
    @Mock TransactionStatus transactionStatus;

    @Test
    void translatesFlushConflictAfterRollingBackTransaction() {
        TestDemand demand = demand();
        DemandManpowerDetail detail = detail(demand.getId());
        TestStaff staff = staff();
        when(transactionManager.getTransaction(any())).thenReturn(transactionStatus);
        when(demandRepository.findAllByIdInForUpdate(List.of(1L))).thenReturn(List.of(demand));
        when(detailRepository.findByDemandIdIn(List.of(1L))).thenReturn(List.of(detail));
        when(specialRepository.findByDemandIdInOrderByDemandIdAscIdAsc(List.of(1L))).thenReturn(List.of());
        when(scheduleRepository.findByDemandIdIn(List.of(1L))).thenReturn(List.of());
        when(staffRepository.findByStatus(TestStaff.StaffStatus.active)).thenReturn(List.of(staff));
        when(staffRepository.findAllByIdInForUpdate(List.of(2L))).thenReturn(List.of(staff));
        when(staffModuleRepository.findByIdStaffIdInOrderByIdStaffIdAscIdModuleIdAsc(List.of(2L)))
                .thenReturn(List.of());
        when(userRepository.findByUsernameIn(List.of("E2"))).thenReturn(List.of());
        when(scheduleRepository.findByStaffIdInAndDateBetween(List.of(2L),
                demand.getStartDate().toLocalDate(), demand.getEndDate().toLocalDate())).thenReturn(List.of());
        when(statusRepository.findByStaffIdInAndDateBetween(List.of(2L),
                demand.getStartDate().toLocalDate(), demand.getEndDate().toLocalDate())).thenReturn(List.of());
        when(eligibilityService.prepareContext(any())).thenReturn(
                new ScheduleEligibilityService.ValidationContext());
        doThrow(new OptimisticLockingFailureException("changed"))
                .when(scheduleRepository).saveAllAndFlush(any());

        ScheduleRecommendationService service = new ScheduleRecommendationService(
                demandRepository, detailRepository, specialRepository, moduleRepository, staffRepository,
                staffModuleRepository, scheduleRepository, statusRepository, userRepository,
                eligibilityService, fulfillmentService, transactionManager);

        var error = assertThrows(com.testscheduling.exception.BusinessException.class,
                () -> service.recommend(request()));

        assertEquals("DATA_CHANGED_RETRY", error.getErrorCode());
        verify(transactionManager).rollback(transactionStatus);
    }

    private ScheduleRecommendationRequest request() {
        ScheduleRecommendationRequest request = new ScheduleRecommendationRequest();
        request.setMode(ScheduleRecommendationRequest.Mode.FULL_DEMAND);
        request.setDemandIds(List.of(1L));
        request.setIncludeSaturdays(true);
        request.setIncludeSundays(true);
        return request;
    }

    private TestDemand demand() {
        TestDemand demand = new TestDemand();
        demand.setId(1L);
        demand.setProduct("产品");
        demand.setVersion("v1");
        demand.setVersionType("维护");
        demand.setStartDate(LocalDateTime.of(2026, 7, 22, 0, 0));
        demand.setEndDate(LocalDateTime.of(2026, 7, 22, 23, 59));
        return demand;
    }

    private DemandManpowerDetail detail(Long demandId) {
        DemandManpowerDetail detail = new DemandManpowerDetail();
        detail.setId(3L);
        detail.setDemandId(demandId);
        detail.setTestType("功能测试");
        detail.setManpowerDemand(new BigDecimal("1.0"));
        return detail;
    }

    private TestStaff staff() {
        TestStaff staff = new TestStaff();
        staff.setId(2L);
        staff.setName("人员");
        staff.setEmpNo("E2");
        staff.setTestType("功能测试");
        staff.setStatus(TestStaff.StaffStatus.active);
        staff.setCurrentCoefficient(BigDecimal.ONE);
        return staff;
    }
}
