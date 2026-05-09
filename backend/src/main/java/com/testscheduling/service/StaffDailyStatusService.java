package com.testscheduling.service;

import com.testscheduling.entity.StaffDailyStatus;
import com.testscheduling.entity.StaffDailyStatus.DailyAvailabilityStatus;
import com.testscheduling.repository.StaffDailyStatusRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Service
public class StaffDailyStatusService {

    @Autowired
    private StaffDailyStatusRepository repository;

    public List<StaffDailyStatus> getStatusesByDateRange(LocalDate start, LocalDate end) {
        return repository.findByDateBetween(start, end);
    }

    public List<StaffDailyStatus> getStatusesByStaffIdsAndDateRange(List<Long> staffIds, LocalDate start, LocalDate end) {
        return repository.findByStaffIdInAndDateBetween(staffIds, start, end);
    }

    @Transactional
    public void setStatus(Long staffId, LocalDate date, DailyAvailabilityStatus status) {
        if (status == DailyAvailabilityStatus.AVAILABLE) {
            repository.deleteByStaffIdAndDate(staffId, date);
        } else {
            Optional<StaffDailyStatus> existing = repository.findByStaffIdAndDate(staffId, date);
            StaffDailyStatus record = existing.orElse(new StaffDailyStatus());
            record.setStaffId(staffId);
            record.setDate(date);
            record.setStatus(status);
            repository.save(record);
        }
    }
}
