package com.testscheduling.repository;

import com.testscheduling.entity.TestDemand;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface TestDemandRepository extends JpaRepository<TestDemand, Long> {

    List<TestDemand> findByStatus(TestDemand.DemandStatus status);

    List<TestDemand> findByProduct(String product);

    List<TestDemand> findByVersionType(String versionType);

    List<TestDemand> findBySubmittedBy(String submittedBy);

    List<TestDemand> findByStatusIn(List<TestDemand.DemandStatus> statuses);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from TestDemand d where d.id = :id")
    Optional<TestDemand> findByIdForUpdate(@Param("id") Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from TestDemand d where d.id = "
        + "(select s.demandId from Schedule s where s.id = :scheduleId)")
    Optional<TestDemand> findByScheduleIdForUpdate(@Param("scheduleId") Long scheduleId);
}
