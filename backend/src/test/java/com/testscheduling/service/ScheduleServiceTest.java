package com.testscheduling.service;

import com.testscheduling.dto.ScheduleDeleteScope;
import com.testscheduling.entity.Schedule;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.entity.User;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.ScheduleRepository;
import com.testscheduling.repository.TestDemandRepository;
import com.testscheduling.repository.TestStaffRepository;
import com.testscheduling.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ScheduleServiceTest {

    @Mock ScheduleRepository scheduleRepository;
    @Mock TestDemandRepository demandRepository;
    @Mock TestStaffRepository testStaffRepository;
    @Mock UserRepository userRepository;
    @Mock ScheduleEligibilityService eligibilityService;
    @Mock SchedulePublishService publishService;

    @InjectMocks ScheduleService scheduleService;

    @Test
    void createLocksDemandAndStaffBeforeValidation() {
        Schedule schedule = schedule(10L, 20L, 30L, null);
        stubLocks(10L, 20L);
        when(scheduleRepository.save(schedule)).thenReturn(schedule);

        Schedule result = scheduleService.create(schedule);

        assertSame(schedule, result);
        InOrder order = inOrder(demandRepository, testStaffRepository,
            eligibilityService, scheduleRepository);
        order.verify(demandRepository).findByIdForUpdate(10L);
        order.verify(testStaffRepository).findByIdForUpdate(20L);
        order.verify(eligibilityService).validate(schedule, null);
        order.verify(scheduleRepository).save(schedule);
    }

    @Test
    void batchLocksScopesInAscendingOrderAndValidatesSavedRowsCumulatively() {
        Schedule secondDemand = schedule(20L, 40L, 31L, null);
        Schedule firstDemand = schedule(10L, 30L, 30L, null);
        Schedule sameDemand = schedule(10L, 40L, 30L, 50L);
        stubLocks(10L, 30L);
        when(demandRepository.findByIdForUpdate(20L)).thenReturn(Optional.of(demand(20L)));
        when(testStaffRepository.findByIdForUpdate(40L)).thenReturn(Optional.of(staff(40L)));
        when(scheduleRepository.saveAll(List.of(secondDemand, firstDemand, sameDemand)))
            .thenReturn(List.of(secondDemand, firstDemand, sameDemand));
        when(eligibilityService.prepareContext(any())).thenReturn(
            new ScheduleEligibilityService.ValidationContext());

        List<Schedule> result = scheduleService.createBatch(
            List.of(secondDemand, firstDemand, sameDemand));

        assertEquals(List.of(secondDemand, firstDemand, sameDemand), result);
        InOrder locks = inOrder(demandRepository, testStaffRepository);
        locks.verify(demandRepository).findByIdForUpdate(10L);
        locks.verify(demandRepository).findByIdForUpdate(20L);
        locks.verify(testStaffRepository).findByIdForUpdate(30L);
        locks.verify(testStaffRepository).findByIdForUpdate(40L);
        InOrder writes = inOrder(eligibilityService, scheduleRepository);
        writes.verify(eligibilityService).validate(
            org.mockito.ArgumentMatchers.eq(secondDemand),
            org.mockito.ArgumentMatchers.isNull(), org.mockito.ArgumentMatchers.any());
        writes.verify(eligibilityService).validate(
            org.mockito.ArgumentMatchers.eq(firstDemand),
            org.mockito.ArgumentMatchers.isNull(), org.mockito.ArgumentMatchers.any());
        writes.verify(eligibilityService).validate(
            org.mockito.ArgumentMatchers.eq(sameDemand),
            org.mockito.ArgumentMatchers.isNull(), org.mockito.ArgumentMatchers.any());
    }

    @Test
    void updateCopiesWritableFieldsAndPreservesDemandProductVersionMetadata() {
        Schedule existing = schedule(10L, 20L, 30L, 50L);
        existing.setId(99L);
        existing.setProduct("保留产品");
        existing.setTestManager("保留经理");
        existing.setVersionType("维护");
        existing.setVersion("v1.2.3");
        existing.setPublished(true);
        existing.setLockVersion(7L);
        Schedule changes = schedule(999L, 21L, 31L, null);
        changes.setDate(LocalDate.of(2026, 7, 23));
        changes.setPercentage(70);
        when(scheduleRepository.findById(99L)).thenReturn(Optional.of(existing));
        when(demandRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(demand(10L)));
        when(testStaffRepository.findByIdForUpdate(21L)).thenReturn(Optional.of(staff(21L)));
        when(scheduleRepository.findByIdForUpdate(99L)).thenReturn(Optional.of(existing));
        when(scheduleRepository.save(existing)).thenReturn(existing);

        Schedule result = scheduleService.update(99L, changes);

        assertEquals(10L, result.getDemandId());
        assertEquals(21L, result.getStaffId());
        assertEquals(31L, result.getDemandManpowerDetailId());
        assertEquals(null, result.getDemandSpecialModuleId());
        assertEquals(LocalDate.of(2026, 7, 23), result.getDate());
        assertEquals(70, result.getPercentage());
        assertEquals("保留产品", result.getProduct());
        assertEquals("保留经理", result.getTestManager());
        assertEquals("维护", result.getVersionType());
        assertEquals("v1.2.3", result.getVersion());
        assertTrue(result.getPublished());
        assertEquals(7L, result.getLockVersion());
        verify(eligibilityService).validate(any(Schedule.class), org.mockito.ArgumentMatchers.eq(99L));
    }

    @Test
    void updateCanChangeSpecialAttributionToGeneral() {
        Schedule existing = schedule(10L, 20L, 30L, 50L);
        existing.setId(99L);
        Schedule changes = schedule(999L, 20L, 30L, null);
        when(scheduleRepository.findById(99L)).thenReturn(Optional.of(existing));
        stubLocks(10L, 20L);
        when(scheduleRepository.findByIdForUpdate(99L)).thenReturn(Optional.of(existing));
        when(scheduleRepository.save(existing)).thenReturn(existing);

        Schedule result = scheduleService.update(99L, changes);

        assertEquals(30L, result.getDemandManpowerDetailId());
        assertEquals(null, result.getDemandSpecialModuleId());
        verify(eligibilityService).validate(any(Schedule.class), org.mockito.ArgumentMatchers.eq(99L));
        verify(scheduleRepository).save(existing);
    }

    @Test
    void updateCanChangeGeneralAttributionToAnotherSpecialBucket() {
        Schedule existing = schedule(10L, 20L, 30L, null);
        existing.setId(99L);
        Schedule changes = schedule(999L, 20L, 30L, 51L);
        when(scheduleRepository.findById(99L)).thenReturn(Optional.of(existing));
        stubLocks(10L, 20L);
        when(scheduleRepository.findByIdForUpdate(99L)).thenReturn(Optional.of(existing));
        when(scheduleRepository.save(existing)).thenReturn(existing);

        Schedule result = scheduleService.update(99L, changes);

        assertEquals(30L, result.getDemandManpowerDetailId());
        assertEquals(51L, result.getDemandSpecialModuleId());
        verify(eligibilityService).validate(any(Schedule.class), org.mockito.ArgumentMatchers.eq(99L));
        verify(scheduleRepository).save(existing);
    }

    @Test
    void invalidAttributionUpdateDoesNotMutateOrSaveExistingSchedule() {
        Schedule existing = schedule(10L, 20L, 30L, 50L);
        existing.setId(99L);
        Schedule changes = schedule(999L, 20L, 31L, 51L);
        when(scheduleRepository.findById(99L)).thenReturn(Optional.of(existing));
        stubLocks(10L, 20L);
        when(scheduleRepository.findByIdForUpdate(99L)).thenReturn(Optional.of(existing));
        doThrow(new BusinessException("SCHEDULE_DETAIL_DEMAND_MISMATCH", "人力明细不属于当前需求"))
            .when(eligibilityService).validate(any(Schedule.class), org.mockito.ArgumentMatchers.eq(99L));

        BusinessException error = assertThrows(BusinessException.class,
            () -> scheduleService.update(99L, changes));

        assertEquals("SCHEDULE_DETAIL_DEMAND_MISMATCH", error.getErrorCode());
        assertEquals(30L, existing.getDemandManpowerDetailId());
        assertEquals(50L, existing.getDemandSpecialModuleId());
        verify(scheduleRepository, never()).save(any());
    }

    @Test
    void updateCannotClassifyHistoricalSchedule() {
        Schedule historical = schedule(10L, 20L, null, null);
        historical.setId(99L);
        Schedule changes = schedule(10L, 20L, 30L, null);
        when(scheduleRepository.findById(99L)).thenReturn(Optional.of(historical));
        stubLocks(10L, 20L);
        when(scheduleRepository.findByIdForUpdate(99L)).thenReturn(Optional.of(historical));

        BusinessException error = assertThrows(BusinessException.class,
            () -> scheduleService.update(99L, changes));

        assertEquals("SCHEDULE_HISTORICAL_READ_ONLY", error.getErrorCode());
        verify(eligibilityService, never()).validate(any(), any());
        verify(scheduleRepository, never()).save(any());
    }

    @Test
    void movePreservesAttributionAndProductVersionMetadata() {
        Schedule existing = schedule(10L, 20L, 30L, 50L);
        existing.setId(99L);
        existing.setProduct("产品");
        existing.setVersion("v9");
        when(scheduleRepository.findById(99L)).thenReturn(Optional.of(existing));
        when(demandRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(demand(10L)));
        when(testStaffRepository.findByIdForUpdate(21L)).thenReturn(Optional.of(staff(21L)));
        when(scheduleRepository.findByIdForUpdate(99L)).thenReturn(Optional.of(existing));
        when(scheduleRepository.save(existing)).thenReturn(existing);

        Schedule result = scheduleService.move(
            99L, 21L, LocalDate.of(2026, 7, 24), 40);

        assertEquals(30L, result.getDemandManpowerDetailId());
        assertEquals(50L, result.getDemandSpecialModuleId());
        assertEquals("产品", result.getProduct());
        assertEquals("v9", result.getVersion());
        assertEquals(21L, result.getStaffId());
        verify(eligibilityService).validate(any(Schedule.class), org.mockito.ArgumentMatchers.eq(99L));
    }

    @Test
    void validateOnlyNeverWrites() {
        Schedule schedule = schedule(10L, 20L, 30L, null);

        scheduleService.validateOnly(schedule);

        verify(eligibilityService).validate(schedule, null);
        verify(scheduleRepository, never()).save(any());
    }

    @Test
    void classifyHistoricalCompletesAttributionAndFullyValidates() {
        Schedule historical = schedule(10L, 20L, null, null);
        historical.setId(99L);
        when(demandRepository.findByScheduleIdForUpdate(99L)).thenReturn(Optional.of(demand(10L)));
        when(scheduleRepository.findByDemandIdForUpdate(10L)).thenReturn(List.of(historical));
        when(testStaffRepository.findByIdForUpdate(20L)).thenReturn(Optional.of(staff(20L)));
        when(scheduleRepository.save(historical)).thenReturn(historical);

        Schedule result = scheduleService.classifyHistorical(99L, 30L, 50L);

        assertEquals(30L, result.getDemandManpowerDetailId());
        assertEquals(50L, result.getDemandSpecialModuleId());
        verify(eligibilityService).validate(any(Schedule.class), org.mockito.ArgumentMatchers.eq(99L));
        verify(scheduleRepository).save(historical);
    }

    @Test
    void classifyRejectsScheduleThatAlreadyHasAnyAttribution() {
        Schedule attributed = schedule(10L, 20L, 30L, null);
        attributed.setId(99L);
        when(demandRepository.findByScheduleIdForUpdate(99L)).thenReturn(Optional.of(demand(10L)));
        when(scheduleRepository.findByDemandIdForUpdate(10L)).thenReturn(List.of(attributed));
        when(testStaffRepository.findByIdForUpdate(20L)).thenReturn(Optional.of(staff(20L)));

        BusinessException error = assertThrows(BusinessException.class,
            () -> scheduleService.classifyHistorical(99L, 30L, 50L));

        assertEquals("SCHEDULE_ALREADY_CLASSIFIED", error.getErrorCode());
        verify(eligibilityService, never()).validate(any(), any());
    }

    @Test
    void singleDeleteProtectsPublishedSchedule() {
        Schedule published = schedule(10L, 20L, 30L, null);
        published.setId(99L);
        published.setPublished(true);
        when(scheduleRepository.findById(99L)).thenReturn(Optional.of(published));
        when(demandRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(demand(10L)));
        when(scheduleRepository.findByDemandIdForUpdate(10L)).thenReturn(List.of(published));

        BusinessException error = assertThrows(BusinessException.class,
            () -> scheduleService.delete(99L));

        assertEquals("PUBLISHED_SCHEDULE_PROTECTED", error.getErrorCode());
        verify(scheduleRepository, never()).delete(any(Schedule.class));
    }

    @Test
    void demandClearDefaultsToDraftsAndAllScopeCanDeletePublished() {
        when(demandRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(demand(10L)));

        scheduleService.deleteByDemandId(10L, ScheduleDeleteScope.DRAFT_ONLY);
        scheduleService.deleteByDemandId(10L, ScheduleDeleteScope.ALL);

        verify(scheduleRepository).deleteByDemandIdAndPublishedFalse(10L);
        verify(scheduleRepository).deleteByDemandId(10L);
    }

    @Test
    void classifyUsesLockedScheduleScopeWithoutUnlockedRead() {
        Schedule historical = schedule(10L, 20L, null, null);
        historical.setId(99L);
        when(demandRepository.findByScheduleIdForUpdate(99L)).thenReturn(Optional.of(demand(10L)));
        when(scheduleRepository.findByDemandIdForUpdate(10L)).thenReturn(List.of(historical));
        when(testStaffRepository.findByIdForUpdate(20L)).thenReturn(Optional.of(staff(20L)));
        when(scheduleRepository.save(historical)).thenReturn(historical);

        scheduleService.classifyHistorical(99L, 30L, null);

        verify(scheduleRepository, never()).findById(99L);
    }

    @Test
    void publishLocksDemandThenSchedulesInIdOrder() {
        scheduleService.publishByDemandId(10L);

        verify(publishService).publishOne(10L);
    }

    @Test
    void batchSavesOnceAfterAllRowsValidate() {
        Schedule first = schedule(10L, 20L, 30L, null);
        Schedule second = schedule(10L, 21L, 30L, null);
        stubLocks(10L, 20L);
        when(testStaffRepository.findByIdForUpdate(21L)).thenReturn(Optional.of(staff(21L)));
        when(scheduleRepository.saveAll(List.of(first, second))).thenReturn(List.of(first, second));
        when(eligibilityService.prepareContext(any())).thenReturn(
            new ScheduleEligibilityService.ValidationContext());

        scheduleService.createBatch(List.of(first, second));

        verify(scheduleRepository).saveAll(List.of(first, second));
        verify(scheduleRepository, never()).saveAndFlush(any());
    }

    @Test
    void publishesConfidentialScheduleWhenStaffUserHasClearance() {
        scheduleService.publishByDemandId(1L);

        verify(publishService).publishOne(1L);
    }

    private void stubLocks(Long demandId, Long staffId) {
        when(demandRepository.findByIdForUpdate(demandId))
            .thenReturn(Optional.of(demand(demandId)));
        when(testStaffRepository.findByIdForUpdate(staffId))
            .thenReturn(Optional.of(staff(staffId)));
    }

    private TestDemand demand(Long id) {
        TestDemand demand = new TestDemand();
        demand.setId(id);
        return demand;
    }

    private TestStaff staff(Long id) {
        TestStaff staff = new TestStaff();
        staff.setId(id);
        return staff;
    }

    private Schedule schedule(Long demandId, Long staffId, Long detailId, Long specialId) {
        Schedule schedule = new Schedule();
        schedule.setDemandId(demandId);
        schedule.setStaffId(staffId);
        schedule.setDemandManpowerDetailId(detailId);
        schedule.setDemandSpecialModuleId(specialId);
        schedule.setDate(LocalDate.of(2026, 7, 22));
        schedule.setPercentage(50);
        schedule.setPublished(false);
        return schedule;
    }
}
