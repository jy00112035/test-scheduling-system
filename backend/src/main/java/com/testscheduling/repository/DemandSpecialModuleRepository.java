package com.testscheduling.repository;

import com.testscheduling.entity.DemandSpecialModule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface DemandSpecialModuleRepository extends JpaRepository<DemandSpecialModule, Long> {

    List<DemandSpecialModule> findByDemandIdOrderByIdAsc(Long demandId);

    List<DemandSpecialModule> findByDemandIdInOrderByDemandIdAscIdAsc(List<Long> demandIds);

    void deleteByDemandId(Long demandId);
}
