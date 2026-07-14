package com.testscheduling.service;

import com.testscheduling.entity.Schedule;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.entity.User;
import com.testscheduling.repository.ScheduleRepository;
import com.testscheduling.repository.TestDemandRepository;
import com.testscheduling.repository.TestStaffRepository;
import com.testscheduling.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Service
public class ScheduleService {

    @Autowired
    private ScheduleRepository scheduleRepository;

    @Autowired
    private TestDemandRepository demandRepository;

    @Autowired
    private TestStaffRepository testStaffRepository;

    @Autowired
    private UserRepository userRepository;

    public List<Schedule> findAll() {
        return scheduleRepository.findAll();
    }

    public Schedule findById(Long id) {
        return scheduleRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("排班记录不存在"));
    }

    public List<Schedule> findByDate(LocalDate date) {
        return scheduleRepository.findByDate(date);
    }

    public List<Schedule> findByStaffId(Long staffId) {
        return scheduleRepository.findByStaffId(staffId);
    }

    public List<Schedule> findByDateRange(LocalDate startDate, LocalDate endDate) {
        return scheduleRepository.findByDateRange(startDate, endDate);
    }

    public List<Schedule> findByStaffIdAndDateRange(Long staffId, LocalDate startDate, LocalDate endDate) {
        return scheduleRepository.findByStaffIdAndDateRange(staffId, startDate, endDate);
    }

    @Transactional
    public Schedule create(Schedule schedule) {
        validateConfidentialClearance(schedule.getDemandId(), schedule.getStaffId());
        return scheduleRepository.save(schedule);
    }

    @Transactional
    public List<Schedule> createBatch(List<Schedule> schedules) {
        for (Schedule schedule : schedules) {
            validateConfidentialClearance(schedule.getDemandId(), schedule.getStaffId());
        }
        return scheduleRepository.saveAll(schedules);
    }

    @Transactional
    public Schedule update(Long id, Schedule schedule) {
        Schedule existing = findById(id);
        existing.setDate(schedule.getDate());
        existing.setPercentage(schedule.getPercentage());
        return scheduleRepository.save(existing);
    }

    @Transactional
    public void delete(Long id) {
        scheduleRepository.deleteById(id);
    }

    @Transactional
    public void deleteByDemandId(Long demandId) {
        scheduleRepository.findByDemandId(demandId)
            .forEach(s -> scheduleRepository.deleteById(s.getId()));
    }

    public List<Schedule> findPublished() {
        return scheduleRepository.findByPublishedTrue();
    }

    @Transactional
    public void publishByDemandId(Long demandId) {
        TestDemand demand = demandRepository.findById(demandId).orElse(null);
        if (demand != null && Boolean.TRUE.equals(demand.getConfidential())) {
            List<Schedule> schedules = scheduleRepository.findByDemandId(demandId);
            for (Schedule s : schedules) {
                validateStaffConfidentialClearance(s.getStaffId(), "无法发布保密项目排班");
            }
        }
        scheduleRepository.findByDemandId(demandId)
            .forEach(s -> {
                s.setPublished(true);
                scheduleRepository.save(s);
            });
    }

    private void validateConfidentialClearance(Long demandId, Long staffId) {
        TestDemand demand = demandRepository.findById(demandId).orElse(null);
        if (demand != null && Boolean.TRUE.equals(demand.getConfidential())) {
            validateStaffConfidentialClearance(staffId, "无法参与保密项目测试");
        }
    }

    private void validateStaffConfidentialClearance(Long staffId, String actionMessage) {
        TestStaff staff = testStaffRepository.findById(staffId).orElse(null);
        if (staff == null) {
            throw new RuntimeException("人员不存在");
        }

        User user = userRepository.findByUsername(staff.getEmpNo()).orElse(null);
        if (user == null || !Boolean.TRUE.equals(user.getConfidentialClearance())) {
            throw new RuntimeException(staff.getName() + " 不具备保密权限，" + actionMessage);
        }
    }

    @Transactional
    public void unpublishByDemandId(Long demandId) {
        scheduleRepository.findByDemandId(demandId)
            .forEach(s -> {
                s.setPublished(false);
                scheduleRepository.save(s);
            });
    }
}
