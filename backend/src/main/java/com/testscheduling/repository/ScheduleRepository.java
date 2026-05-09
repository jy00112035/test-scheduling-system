package com.testscheduling.repository;

import com.testscheduling.entity.Schedule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.time.LocalDate;
import java.util.List;

@Repository
public interface ScheduleRepository extends JpaRepository<Schedule, Long> {

    List<Schedule> findByDate(LocalDate date);

    List<Schedule> findByStaffId(Long staffId);

    List<Schedule> findByDemandId(Long demandId);

    @Query("SELECT s FROM Schedule s WHERE s.date BETWEEN :startDate AND :endDate")
    List<Schedule> findByDateRange(
        @Param("startDate") LocalDate startDate,
        @Param("endDate") LocalDate endDate
    );

    @Query("SELECT s FROM Schedule s WHERE s.staffId = :staffId AND s.date BETWEEN :startDate AND :endDate")
    List<Schedule> findByStaffIdAndDateRange(
        @Param("staffId") Long staffId,
        @Param("startDate") LocalDate startDate,
        @Param("endDate") LocalDate endDate
    );

    List<Schedule> findByPublishedTrue();

    List<Schedule> findByDemandIdAndPublishedTrue(Long demandId);
}
