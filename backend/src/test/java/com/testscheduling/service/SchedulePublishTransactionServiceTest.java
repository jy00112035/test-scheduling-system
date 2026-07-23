package com.testscheduling.service;

import com.testscheduling.dto.DemandFulfillmentResponse;
import com.testscheduling.entity.DemandSpecialModule;
import com.testscheduling.entity.Schedule;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.DemandSpecialModuleRepository;
import com.testscheduling.repository.ScheduleRepository;
import com.testscheduling.repository.TestDemandRepository;
import com.testscheduling.repository.TestModuleConfigRepository;
import com.testscheduling.repository.TestStaffRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SchedulePublishTransactionServiceTest {
    @Mock TestDemandRepository demandRepository;
    @Mock DemandSpecialModuleRepository specialRepository;
    @Mock TestModuleConfigRepository moduleRepository;
    @Mock TestStaffRepository staffRepository;
    @Mock ScheduleRepository scheduleRepository;
    @Mock DemandFulfillmentService fulfillmentService;
    @Mock ScheduleEligibilityService eligibilityService;
    @Mock AuditLogService auditLogService;

    @Test
    void validRowsAreValidatedBeforeAtomicPublishAndAudited() {
        TestDemand demand = demand(10L);
        Schedule first = schedule(2L, 10L, 20L);
        Schedule second = schedule(1L, 10L, 21L);
        List<Schedule> rows = List.of(first, second);
        when(demandRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(demand));
        when(scheduleRepository.findByDemandId(10L)).thenReturn(rows);
        when(scheduleRepository.findByDemandIdForUpdate(10L)).thenReturn(rows);
        TestStaff firstStaff = new TestStaff();
        firstStaff.setId(20L);
        TestStaff secondStaff = new TestStaff();
        secondStaff.setId(21L);
        when(staffRepository.findAllByIdInForUpdate(List.of(20L, 21L)))
            .thenReturn(List.of(firstStaff, secondStaff));
        when(fulfillmentService.calculate(10L)).thenReturn(satisfied(10L));
        when(eligibilityService.prepareContext(rows))
            .thenReturn(new ScheduleEligibilityService.ValidationContext());

        int count = service().publishInNewTransaction(10L);

        assertEquals(2, count);
        assertEquals(TestDemand.DemandStatus.scheduled, demand.getStatus());
        assertFalse(rows.stream().anyMatch(row -> !Boolean.TRUE.equals(row.getPublished())));
        InOrder order = inOrder(demandRepository, specialRepository, moduleRepository,
            staffRepository, scheduleRepository);
        order.verify(demandRepository).findByIdForUpdate(10L);
        order.verify(specialRepository, never()).findByIdIn(any());
        order.verify(staffRepository).findAllByIdInForUpdate(List.of(20L, 21L));
        order.verify(scheduleRepository).findByDemandIdForUpdate(10L);
        verify(scheduleRepository).saveAllAndFlush(rows);
        verify(auditLogService).record(any(), any(), any(), any(), any());
    }

    @Test
    void invalidDemandStatusIsRejectedBeforeScheduleOrFulfillmentReads() {
        TestDemand demand = demand(10L);
        demand.setStatus(TestDemand.DemandStatus.rejected);
        when(demandRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(demand));
        org.mockito.Mockito.doCallRealMethod().when(eligibilityService)
            .requireSchedulable(any(TestDemand.class));

        BusinessException error = assertThrows(BusinessException.class,
            () -> service().publishInNewTransaction(10L));

        assertEquals("DEMAND_NOT_SCHEDULABLE", error.getErrorCode());
        verify(scheduleRepository, never()).findByDemandId(any());
        verify(fulfillmentService, never()).calculate(any(Long.class));
    }

    @Test
    void lateValidationFailurePublishesNoRows() {
        TestDemand demand = demand(10L);
        Schedule first = schedule(1L, 10L, 20L);
        Schedule second = schedule(2L, 10L, 21L);
        List<Schedule> rows = List.of(first, second);
        when(demandRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(demand));
        when(scheduleRepository.findByDemandId(10L)).thenReturn(rows);
        when(scheduleRepository.findByDemandIdForUpdate(10L)).thenReturn(rows);
        TestStaff firstStaff = new TestStaff();
        firstStaff.setId(20L);
        TestStaff secondStaff = new TestStaff();
        secondStaff.setId(21L);
        when(staffRepository.findAllByIdInForUpdate(List.of(20L, 21L)))
            .thenReturn(List.of(firstStaff, secondStaff));
        when(fulfillmentService.calculate(10L)).thenReturn(satisfied(10L));
        when(eligibilityService.prepareContext(rows))
            .thenReturn(new ScheduleEligibilityService.ValidationContext());
        org.mockito.Mockito.doAnswer(invocation -> {
            if (invocation.<Schedule>getArgument(0).getId().equals(2L)) {
                throw new com.testscheduling.exception.BusinessException(
                    "STAFF_MODULE_NOT_FAMILIAR", "人员不熟悉模块，无法分配");
            }
            return null;
        }).when(eligibilityService).validateForPublish(any(), any());

        assertThrows(com.testscheduling.exception.BusinessException.class,
            () -> service().publishInNewTransaction(10L));

        assertFalse(Boolean.TRUE.equals(first.getPublished()));
        assertFalse(Boolean.TRUE.equals(second.getPublished()));
        assertEquals(TestDemand.DemandStatus.pending, demand.getStatus());
        verify(scheduleRepository, never()).saveAllAndFlush(any());
    }

    @Test
    void missingStaffLockRowUsesStableStaffError() {
        TestDemand demand = demand(10L);
        Schedule row = schedule(1L, 10L, 20L);
        when(demandRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(demand));
        when(scheduleRepository.findByDemandId(10L)).thenReturn(List.of(row));
        when(staffRepository.findAllByIdInForUpdate(List.of(20L))).thenReturn(List.of());

        BusinessException error = assertThrows(BusinessException.class,
            () -> service().publishInNewTransaction(10L));

        assertEquals("STAFF_NOT_FOUND", error.getErrorCode());
        verify(scheduleRepository, never()).findByDemandIdForUpdate(10L);
    }

    @Test
    void alreadyPublishedRowsAreRevalidatedWithoutWriteOrDuplicateAudit() {
        TestDemand demand = demand(10L);
        Schedule row = schedule(1L, 10L, 20L);
        row.setPublished(true);
        TestStaff staff = new TestStaff();
        staff.setId(20L);
        List<Schedule> rows = List.of(row);
        when(demandRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(demand));
        when(scheduleRepository.findByDemandId(10L)).thenReturn(rows);
        when(staffRepository.findAllByIdInForUpdate(List.of(20L))).thenReturn(List.of(staff));
        when(scheduleRepository.findByDemandIdForUpdate(10L)).thenReturn(rows);
        when(fulfillmentService.calculate(10L)).thenReturn(satisfied(10L));
        when(eligibilityService.prepareContext(rows))
            .thenReturn(new ScheduleEligibilityService.ValidationContext());

        assertEquals(1, service().publishInNewTransaction(10L));

        assertEquals(TestDemand.DemandStatus.scheduled, demand.getStatus());
        verify(scheduleRepository, never()).saveAllAndFlush(any());
        verify(auditLogService, never()).record(any(), any(), any(), any(), any());
    }

    @Test
    void missingModuleLockRowUsesStableModuleError() {
        TestDemand demand = demand(10L);
        Schedule row = schedule(1L, 10L, 20L);
        row.setDemandSpecialModuleId(30L);
        DemandSpecialModule special = new DemandSpecialModule();
        special.setId(30L);
        special.setModuleId(40L);
        when(demandRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(demand));
        when(scheduleRepository.findByDemandId(10L)).thenReturn(List.of(row));
        when(specialRepository.findByIdIn(List.of(30L))).thenReturn(List.of(special));
        when(moduleRepository.findAllByIdInForUpdate(List.of(40L))).thenReturn(List.of());

        BusinessException error = assertThrows(BusinessException.class,
            () -> service().publishInNewTransaction(10L));

        assertEquals("MODULE_NOT_FOUND", error.getErrorCode());
        verify(staffRepository, never()).findAllByIdInForUpdate(any());
    }

    private SchedulePublishTransactionService service() {
        return new SchedulePublishTransactionService(demandRepository, specialRepository,
            moduleRepository, staffRepository, scheduleRepository, fulfillmentService,
            eligibilityService, auditLogService);
    }

    private TestDemand demand(Long id) {
        TestDemand demand = new TestDemand();
        demand.setId(id);
        demand.setStatus(TestDemand.DemandStatus.pending);
        return demand;
    }

    private Schedule schedule(Long id, Long demandId, Long staffId) {
        Schedule schedule = new Schedule();
        schedule.setId(id);
        schedule.setDemandId(demandId);
        schedule.setStaffId(staffId);
        schedule.setDate(LocalDate.of(2026, 7, 22));
        schedule.setPercentage(50);
        return schedule;
    }

    private DemandFulfillmentResponse satisfied(Long demandId) {
        return new DemandFulfillmentResponse(demandId, true, false, List.of(), List.of(),
            List.of(), BigDecimal.ONE, BigDecimal.ONE, BigDecimal.ZERO);
    }
}
