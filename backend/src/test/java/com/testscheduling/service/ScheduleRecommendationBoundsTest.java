package com.testscheduling.service;

import com.testscheduling.dto.DemandFulfillmentResponse;
import com.testscheduling.dto.ScheduleRecommendationRequest;
import com.testscheduling.dto.ScheduleRecommendationResponse;
import com.testscheduling.entity.DemandManpowerDetail;
import com.testscheduling.entity.DemandSpecialModule;
import com.testscheduling.entity.Schedule;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.entity.TestStaff;
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
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ScheduleRecommendationBoundsTest {

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
    void acceptsMaximumDistinctDemandScopeBeforeApplyingRepositoryRules() {
        ScheduleRecommendationService service = service();
        List<Long> demandIds = range(1, ScheduleRecommendationService.MAX_RECOMMENDATION_DEMANDS);
        when(transactionManager.getTransaction(any())).thenReturn(transactionStatus);
        when(demandRepository.findAllByIdInForUpdate(demandIds)).thenReturn(List.of());

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.recommend(request(demandIds)));

        assertEquals("DEMAND_NOT_FOUND", error.getErrorCode());
        verify(demandRepository).findAllByIdInForUpdate(demandIds);
    }

    @Test
    void rejectsScopeLargerThanMaximumBeforeAnyRepositoryAccess() {
        ScheduleRecommendationService service = service();
        List<Long> demandIds = range(1, ScheduleRecommendationService.MAX_RECOMMENDATION_DEMANDS + 1);

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.recommend(request(demandIds)));

        assertEquals("RECOMMENDATION_SCOPE_TOO_LARGE", error.getErrorCode());
        verifyNoInteractions(demandRepository, transactionManager);
    }

    @Test
    @SuppressWarnings("unchecked")
    void chunksAllDerivedStaffReadsAndStillChoosesTheLastChunkCandidate() {
        ScheduleRecommendationService service = service();
        TestDemand demand = demand(1L);
        DemandManpowerDetail detail = detail(10L, demand.getId(), "chunked-type", "1.0");
        List<TestStaff> allStaff = new ArrayList<>();
        Map<Long, TestStaff> staffById = new HashMap<>();
        for (long id = 1; id <= ScheduleRecommendationService.BULK_QUERY_CHUNK_SIZE + 1; id++) {
            TestStaff staff = staff(id, "chunked-type");
            allStaff.add(staff);
            staffById.put(id, staff);
        }
        List<TestStaff> reversed = allStaff.reversed();
        when(transactionManager.getTransaction(any())).thenReturn(transactionStatus);
        when(demandRepository.findAllByIdInForUpdate(List.of(1L))).thenReturn(List.of(demand));
        when(detailRepository.findByDemandIdIn(List.of(1L))).thenReturn(List.of(detail));
        when(specialRepository.findByDemandIdInOrderByDemandIdAscIdAsc(List.of(1L))).thenReturn(List.of());
        when(scheduleRepository.findByDemandIdIn(List.of(1L))).thenReturn(List.of());
        when(staffRepository.findByStatus(TestStaff.StaffStatus.active)).thenReturn(reversed);
        when(staffRepository.findAllByIdInForUpdate(anyList())).thenAnswer(invocation ->
                ((List<Long>) invocation.getArgument(0)).stream().map(staffById::get).toList());
        when(staffModuleRepository.findByIdStaffIdInOrderByIdStaffIdAscIdModuleIdAsc(anyList()))
                .thenReturn(List.of());
        when(userRepository.findByUsernameIn(anyList())).thenReturn(List.of());
        when(scheduleRepository.findByStaffIdInAndDateBetween(anyList(), any(), any())).thenReturn(List.of());
        when(statusRepository.findByStaffIdInAndDateBetween(anyList(), any(), any())).thenReturn(List.of());
        when(eligibilityService.prepareContext(any())).thenReturn(new ScheduleEligibilityService.ValidationContext());
        when(scheduleRepository.saveAllAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(fulfillmentService.calculateBatch(any(), any(), any())).thenReturn(Map.of(1L,
                new DemandFulfillmentResponse(1L, true, false, List.of(), List.of(), List.of(),
                        BigDecimal.ONE, BigDecimal.ONE, BigDecimal.ZERO)));

        ScheduleRecommendationRequest request = request(List.of(1L));
        request.setFixedStaffIds(List.of(ScheduleRecommendationService.BULK_QUERY_CHUNK_SIZE + 1L));
        ScheduleRecommendationResponse result = service.recommend(request);

        assertEquals(1, result.generatedSchedules().size());
        assertEquals(ScheduleRecommendationService.BULK_QUERY_CHUNK_SIZE + 1L,
                result.generatedSchedules().getFirst().getStaffId());
        verify(staffRepository, times(2)).findAllByIdInForUpdate(anyList());
        verify(staffModuleRepository, times(2)).findByIdStaffIdInOrderByIdStaffIdAscIdModuleIdAsc(anyList());
        verify(userRepository, times(2)).findByUsernameIn(anyList());
        verify(scheduleRepository, times(2)).findByStaffIdInAndDateBetween(anyList(), any(), any());
        verify(statusRepository, times(2)).findByStaffIdInAndDateBetween(anyList(), any(), any());
    }

    @Test
    @SuppressWarnings("unchecked")
    void chunksDerivedModuleLocksWithoutDroppingTheLastModule() {
        ScheduleRecommendationService service = service();
        TestDemand demand = demand(1L);
        DemandManpowerDetail detail = detail(10L, demand.getId(), "module-type", "501.0");
        List<DemandSpecialModule> specials = new ArrayList<>();
        Map<Long, TestModuleConfig> modules = new HashMap<>();
        for (long index = 1; index <= ScheduleRecommendationService.BULK_QUERY_CHUNK_SIZE + 1; index++) {
            long moduleId = 1000L + index;
            DemandSpecialModule special = new DemandSpecialModule();
            special.setId(index);
            special.setDemandId(demand.getId());
            special.setModuleId(moduleId);
            special.setManpowerDemand(BigDecimal.ONE);
            specials.add(special);
            TestModuleConfig module = new TestModuleConfig();
            module.setId(moduleId);
            module.setTestType(detail.getTestType());
            module.setModuleName("module-" + moduleId);
            modules.put(moduleId, module);
        }
        when(transactionManager.getTransaction(any())).thenReturn(transactionStatus);
        when(demandRepository.findAllByIdInForUpdate(List.of(1L))).thenReturn(List.of(demand));
        when(detailRepository.findByDemandIdIn(List.of(1L))).thenReturn(List.of(detail));
        when(specialRepository.findByDemandIdInOrderByDemandIdAscIdAsc(List.of(1L))).thenReturn(specials);
        when(moduleRepository.findAllByIdInForUpdate(anyList())).thenAnswer(invocation ->
                ((List<Long>) invocation.getArgument(0)).stream().map(modules::get).toList());
        when(scheduleRepository.findByDemandIdIn(List.of(1L))).thenReturn(List.of());
        when(staffRepository.findByStatus(TestStaff.StaffStatus.active)).thenReturn(List.of());
        when(fulfillmentService.calculateBatch(any(), any(), any())).thenReturn(Map.of(1L,
                new DemandFulfillmentResponse(1L, false, false, List.of(), List.of(), List.of(),
                        new BigDecimal("501.0"), BigDecimal.ZERO, new BigDecimal("501.0"))));

        service.recommend(request(List.of(1L)));

        verify(moduleRepository, times(2)).findAllByIdInForUpdate(anyList());
    }

    private ScheduleRecommendationService service() {
        return new ScheduleRecommendationService(demandRepository, detailRepository, specialRepository,
                moduleRepository, staffRepository, staffModuleRepository, scheduleRepository, statusRepository,
                userRepository, eligibilityService, fulfillmentService, transactionManager);
    }

    private ScheduleRecommendationRequest request(List<Long> demandIds) {
        ScheduleRecommendationRequest request = new ScheduleRecommendationRequest();
        request.setMode(ScheduleRecommendationRequest.Mode.FULL_DEMAND);
        request.setDemandIds(demandIds);
        request.setIncludeSaturdays(true);
        request.setIncludeSundays(true);
        return request;
    }

    private TestDemand demand(Long id) {
        TestDemand demand = new TestDemand();
        demand.setId(id);
        demand.setStartDate(LocalDateTime.of(2026, 7, 22, 0, 0));
        demand.setEndDate(LocalDateTime.of(2026, 7, 22, 23, 59));
        demand.setProduct("product");
        demand.setVersion("v1");
        demand.setVersionType("maint");
        demand.setSubmittedBy("manager");
        return demand;
    }

    private DemandManpowerDetail detail(Long id, Long demandId, String type, String amount) {
        DemandManpowerDetail detail = new DemandManpowerDetail();
        detail.setId(id);
        detail.setDemandId(demandId);
        detail.setTestType(type);
        detail.setManpowerDemand(new BigDecimal(amount));
        return detail;
    }

    private TestStaff staff(Long id, String type) {
        TestStaff staff = new TestStaff();
        staff.setId(id);
        staff.setName("staff-" + id);
        staff.setEmpNo("E" + id);
        staff.setTestType(type);
        staff.setStatus(TestStaff.StaffStatus.active);
        staff.setCurrentCoefficient(BigDecimal.ONE);
        return staff;
    }

    private List<Long> range(long first, long last) {
        return java.util.stream.LongStream.rangeClosed(first, last).boxed().toList();
    }
}
