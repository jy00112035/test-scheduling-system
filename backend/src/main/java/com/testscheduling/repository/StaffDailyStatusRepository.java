package com.testscheduling.repository;

import com.testscheduling.entity.StaffDailyStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface StaffDailyStatusRepository extends JpaRepository<StaffDailyStatus, Long> {

    Optional<StaffDailyStatus> findByStaffIdAndDate(Long staffId, LocalDate date);

    List<StaffDailyStatus> findByDateBetween(LocalDate start, LocalDate end);

    List<StaffDailyStatus> findByStaffIdInAndDateBetween(List<Long> staffIds, LocalDate start, LocalDate end);

    void deleteByStaffIdAndDate(Long staffId, LocalDate date);
}
