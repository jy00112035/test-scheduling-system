package com.testscheduling.repository;

import com.testscheduling.entity.DemandManpowerDetail;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface DemandManpowerDetailRepository extends JpaRepository<DemandManpowerDetail, Long> {

    List<DemandManpowerDetail> findByDemandId(Long demandId);

    List<DemandManpowerDetail> findByDemandIdIn(List<Long> demandIds);

    @Query("select distinct d.testType from DemandManpowerDetail d "
        + "where d.testType is not null and trim(d.testType) <> ''")
    List<String> findDistinctReferencedTestTypes();

    void deleteByDemandId(Long demandId);
}
