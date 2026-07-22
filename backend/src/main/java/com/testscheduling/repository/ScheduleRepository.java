package com.testscheduling.repository;

import com.testscheduling.entity.Schedule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface ScheduleRepository extends JpaRepository<Schedule, Long> {

    List<Schedule> findByDate(LocalDate date);

    List<Schedule> findByStaffId(Long staffId);

    List<Schedule> findByDemandId(Long demandId);

    List<Schedule> findByDemandIdIn(Collection<Long> demandIds);

    List<Schedule> findByDemandIdAndPublishedFalse(Long demandId);

    List<Schedule> findByStaffIdAndDate(Long staffId, LocalDate date);

    void deleteByDemandIdAndPublishedFalse(Long demandId);

    void deleteByDemandId(Long demandId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from Schedule s where s.id = :id")
    Optional<Schedule> findByIdForUpdate(@Param("id") Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from Schedule s where s.demandId = :demandId order by s.id")
    List<Schedule> findByDemandIdForUpdate(@Param("demandId") Long demandId);

    @Query("select s from Schedule s where s.staffId in :staffIds "
        + "and s.date between :startDate and :endDate")
    List<Schedule> findByStaffIdInAndDateBetween(
        @Param("staffIds") Collection<Long> staffIds,
        @Param("startDate") LocalDate startDate,
        @Param("endDate") LocalDate endDate);

    boolean existsByDemandId(Long demandId);

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
