package com.testscheduling.repository;

import com.testscheduling.entity.TestDemand;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface TestDemandRepository extends JpaRepository<TestDemand, Long> {

    List<TestDemand> findByStatus(TestDemand.DemandStatus status);

    List<TestDemand> findByProduct(String product);

    List<TestDemand> findByVersionType(String versionType);

    List<TestDemand> findBySubmittedBy(String submittedBy);

    List<TestDemand> findByStatusIn(List<TestDemand.DemandStatus> statuses);
}
