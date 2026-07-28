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
import java.util.Collection;

@Repository
public interface TestDemandRepository extends JpaRepository<TestDemand, Long> {

    List<TestDemand> findByStatus(TestDemand.DemandStatus status);

    List<TestDemand> findByProduct(String product);

    List<TestDemand> findByVersionType(String versionType);

    List<TestDemand> findBySubmittedBy(String submittedBy);

    List<TestDemand> findByStatusIn(List<TestDemand.DemandStatus> statuses);

    @Query("select d from TestDemand d where "
        + "(:status is null or d.status = :status) "
        + "and (:product is null or d.product = :product) "
        + "and (:search is null or lower(d.product) like lower(concat('%', :search, '%')) "
        + "  or lower(d.version) like lower(concat('%', :search, '%'))) "
        + "and (:submittedBy is null or d.submittedBy = :submittedBy) "
        + "order by d.createdAt desc")
    List<TestDemand> findFiltered(
        @Param("status") TestDemand.DemandStatus status,
        @Param("product") String product,
        @Param("search") String search,
        @Param("submittedBy") String submittedBy);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from TestDemand d where d.id = :id")
    Optional<TestDemand> findByIdForUpdate(@Param("id") Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from TestDemand d where d.id in :ids order by d.id")
    List<TestDemand> findAllByIdInForUpdate(@Param("ids") Collection<Long> ids);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from TestDemand d where d.id = "
        + "(select s.demandId from Schedule s where s.id = :scheduleId)")
    Optional<TestDemand> findByScheduleIdForUpdate(@Param("scheduleId") Long scheduleId);
}
