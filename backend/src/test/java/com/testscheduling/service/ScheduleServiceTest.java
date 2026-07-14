package com.testscheduling.service;

import com.testscheduling.entity.Schedule;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.entity.User;
import com.testscheduling.repository.ScheduleRepository;
import com.testscheduling.repository.TestDemandRepository;
import com.testscheduling.repository.TestStaffRepository;
import com.testscheduling.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ScheduleServiceTest {

    @Mock
    private ScheduleRepository scheduleRepository;

    @Mock
    private TestDemandRepository demandRepository;

    @Mock
    private TestStaffRepository testStaffRepository;

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private ScheduleService scheduleService;

    @Test
    void publishesConfidentialScheduleWhenStaffUserHasClearance() {
        TestDemand demand = new TestDemand();
        demand.setId(1L);
        demand.setConfidential(true);

        TestStaff staff = new TestStaff();
        staff.setId(27L);
        staff.setName("李丹");
        staff.setEmpNo("B-107126");

        User user = new User();
        user.setUsername("B-107126");
        user.setConfidentialClearance(true);

        Schedule schedule = new Schedule();
        schedule.setId(938L);
        schedule.setDemandId(1L);
        schedule.setStaffId(27L);
        schedule.setPublished(false);

        when(demandRepository.findById(1L)).thenReturn(Optional.of(demand));
        when(scheduleRepository.findByDemandId(1L)).thenReturn(List.of(schedule));
        when(testStaffRepository.findById(27L)).thenReturn(Optional.of(staff));
        when(userRepository.findByUsername("B-107126")).thenReturn(Optional.of(user));

        scheduleService.publishByDemandId(1L);

        assertTrue(schedule.getPublished());
        verify(scheduleRepository).save(schedule);
    }
}
