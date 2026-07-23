package com.testscheduling.service;

import com.testscheduling.entity.StaffDailyStatus;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.StaffDailyStatusRepository;
import com.testscheduling.repository.TestStaffRepository;
import com.testscheduling.repository.UserRepository;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.entity.User;
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
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class StaffDailyStatusServiceTest {

    @Mock StaffDailyStatusRepository repository;
    @Mock TestStaffRepository staffRepository;
    @Mock UserRepository userRepository;
    @InjectMocks StaffDailyStatusService service;

    @Test
    void rejectsUnavailablePercentageOutsideFiniteZeroToHundredRange() {
        for (Double percentage : new Double[] {-1.0, 100.1, Double.NaN, Double.POSITIVE_INFINITY}) {
            BusinessException error = assertThrows(BusinessException.class,
                () -> service.setStatus(10L, LocalDate.of(2026, 7, 22),
                    StaffDailyStatus.DailyAvailabilityStatus.OTHER_TASKS, percentage, "field-admin"));
            assertEquals("STAFF_DAILY_STATUS_PERCENTAGE_INVALID", error.getErrorCode());
        }

        verify(repository, never()).save(org.mockito.ArgumentMatchers.any());
        verify(repository, never()).findByStaffIdAndDate(10L, LocalDate.of(2026, 7, 22));
    }

    @Test
    void defaultsMissingUnavailablePercentageToFullDay() {
        org.mockito.Mockito.when(staffRepository.findByIdForUpdate(10L))
            .thenReturn(Optional.of(staff("功能测试")));
        org.mockito.Mockito.when(userRepository.findByUsername("field-admin"))
            .thenReturn(Optional.of(actor("field-admin", "fieldAdmin", null)));
        service.setStatus(10L, LocalDate.of(2026, 7, 22),
            StaffDailyStatus.DailyAvailabilityStatus.ON_LEAVE, null, "field-admin");

        verify(repository).save(org.mockito.ArgumentMatchers.argThat(status ->
            status.getPercentage().equals(100.0)));
        inOrder(staffRepository, repository).verify(staffRepository).findByIdForUpdate(10L);
    }

    @Test
    void rejectsMissingStaffWithStableErrorBeforeStatusLookup() {
        BusinessException error = assertThrows(BusinessException.class,
            () -> service.setStatus(404L, LocalDate.of(2026, 7, 22),
                StaffDailyStatus.DailyAvailabilityStatus.ON_LEAVE, 50.0, "field-admin"));
        assertEquals("STAFF_NOT_FOUND", error.getErrorCode());
        verify(staffRepository).findByIdForUpdate(404L);
        verify(repository, never()).findByStaffIdAndDate(404L, LocalDate.of(2026, 7, 22));
    }

    @Test
    void rejectsCrossGroupLeadAndAllowsMatchingLeadUsingAuthoritativeUserTestType() {
        when(staffRepository.findByIdForUpdate(10L))
            .thenReturn(Optional.of(staff("功能测试")));
        when(userRepository.findByUsername("lead"))
            .thenReturn(Optional.of(actor("lead", "testLead", "性能测试")))
            .thenReturn(Optional.of(actor("lead", "testLead", "功能测试")));

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.setStatus(10L, LocalDate.of(2026, 7, 22),
                StaffDailyStatus.DailyAvailabilityStatus.ON_LEAVE, 50.0, "lead"));
        assertEquals("DAILY_STATUS_SCOPE_FORBIDDEN", error.getErrorCode());

        service.setStatus(10L, LocalDate.of(2026, 7, 22),
            StaffDailyStatus.DailyAvailabilityStatus.ON_LEAVE, 50.0, "lead");
        verify(repository).save(org.mockito.ArgumentMatchers.any());
    }

    private TestStaff staff(String testType) {
        TestStaff staff = new TestStaff();
        staff.setTestType(testType);
        return staff;
    }

    private User actor(String username, String role, String testType) {
        User user = new User();
        user.setUsername(username);
        user.setRoles(java.util.List.of(role));
        user.setTestType(testType);
        user.setEnabled(true);
        return user;
    }
}
