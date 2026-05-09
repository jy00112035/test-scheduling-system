package com.testscheduling.service;

import com.testscheduling.entity.Schedule;
import com.testscheduling.repository.ScheduleRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Service
public class ScheduleService {

    @Autowired
    private ScheduleRepository scheduleRepository;

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
        return scheduleRepository.save(schedule);
    }

    @Transactional
    public List<Schedule> createBatch(List<Schedule> schedules) {
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
        scheduleRepository.findByDemandId(demandId)
            .forEach(s -> {
                s.setPublished(true);
                scheduleRepository.save(s);
            });
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
