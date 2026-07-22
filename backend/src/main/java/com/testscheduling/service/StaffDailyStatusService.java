package com.testscheduling.service;

import com.testscheduling.entity.StaffDailyStatus;
import com.testscheduling.entity.StaffDailyStatus.DailyAvailabilityStatus;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.StaffDailyStatusRepository;
import com.testscheduling.repository.TestStaffRepository;
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

    @Autowired
    private TestStaffRepository staffRepository;

    public List<StaffDailyStatus> getStatusesByDateRange(LocalDate start, LocalDate end) {
        return repository.findByDateBetween(start, end);
    }

    public List<StaffDailyStatus> getStatusesByStaffIdsAndDateRange(List<Long> staffIds, LocalDate start, LocalDate end) {
        return repository.findByStaffIdInAndDateBetween(staffIds, start, end);
    }

    @Transactional
    public void setStatus(Long staffId, LocalDate date, DailyAvailabilityStatus status, Double percentage) {
        if (percentage != null && (!Double.isFinite(percentage)
                || percentage < 0.0 || percentage > 100.0)) {
            throw new BusinessException("STAFF_DAILY_STATUS_PERCENTAGE_INVALID",
                "不可用比例必须在0到100之间");
        }
        if (staffId == null || staffRepository.findByIdForUpdate(staffId).isEmpty()) {
            throw new BusinessException("STAFF_NOT_FOUND", "测试人员不存在");
        }
        if (status == DailyAvailabilityStatus.AVAILABLE) {
            repository.deleteByStaffIdAndDate(staffId, date);
        } else {
            Optional<StaffDailyStatus> existing = repository.findByStaffIdAndDate(staffId, date);
            StaffDailyStatus record = existing.orElse(new StaffDailyStatus());
            record.setStaffId(staffId);
            record.setDate(date);
            record.setStatus(status);
            record.setPercentage(percentage != null ? percentage : 100.0);
            repository.save(record);
        }
    }
}
