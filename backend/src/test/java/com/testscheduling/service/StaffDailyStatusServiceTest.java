package com.testscheduling.service;

import com.testscheduling.entity.StaffDailyStatus;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.StaffDailyStatusRepository;
import com.testscheduling.repository.TestStaffRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class StaffDailyStatusServiceTest {

    @Mock StaffDailyStatusRepository repository;
    @Mock TestStaffRepository staffRepository;
    @InjectMocks StaffDailyStatusService service;

    @Test
    void rejectsUnavailablePercentageOutsideFiniteZeroToHundredRange() {
        for (Double percentage : new Double[] {-1.0, 100.1, Double.NaN, Double.POSITIVE_INFINITY}) {
            BusinessException error = assertThrows(BusinessException.class,
                () -> service.setStatus(10L, LocalDate.of(2026, 7, 22),
                    StaffDailyStatus.DailyAvailabilityStatus.OTHER_TASKS, percentage));
            assertEquals("STAFF_DAILY_STATUS_PERCENTAGE_INVALID", error.getErrorCode());
        }

        verify(repository, never()).save(org.mockito.ArgumentMatchers.any());
        verify(repository, never()).findByStaffIdAndDate(10L, LocalDate.of(2026, 7, 22));
    }

    @Test
    void defaultsMissingUnavailablePercentageToFullDay() {
        org.mockito.Mockito.when(staffRepository.findByIdForUpdate(10L))
            .thenReturn(Optional.of(new com.testscheduling.entity.TestStaff()));
        service.setStatus(10L, LocalDate.of(2026, 7, 22),
            StaffDailyStatus.DailyAvailabilityStatus.ON_LEAVE, null);

        verify(repository).save(org.mockito.ArgumentMatchers.argThat(status ->
            status.getPercentage().equals(100.0)));
        inOrder(staffRepository, repository).verify(staffRepository).findByIdForUpdate(10L);
    }

    @Test
    void rejectsMissingStaffWithStableErrorBeforeStatusLookup() {
        BusinessException error = assertThrows(BusinessException.class,
            () -> service.setStatus(404L, LocalDate.of(2026, 7, 22),
                StaffDailyStatus.DailyAvailabilityStatus.ON_LEAVE, 50.0));
        assertEquals("STAFF_NOT_FOUND", error.getErrorCode());
        verify(staffRepository).findByIdForUpdate(404L);
        verify(repository, never()).findByStaffIdAndDate(404L, LocalDate.of(2026, 7, 22));
    }
}
