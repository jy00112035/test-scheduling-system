package com.testscheduling.repository;

import com.testscheduling.entity.DemandManpowerDetail;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface DemandManpowerDetailRepository extends JpaRepository<DemandManpowerDetail, Long> {

    List<DemandManpowerDetail> findByDemandId(Long demandId);

    List<DemandManpowerDetail> findByDemandIdIn(List<Long> demandIds);

    void deleteByDemandId(Long demandId);
}
