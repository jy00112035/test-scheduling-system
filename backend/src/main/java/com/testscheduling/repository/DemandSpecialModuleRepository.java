package com.testscheduling.repository;

import com.testscheduling.entity.DemandSpecialModule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.List;

@Repository
public interface DemandSpecialModuleRepository extends JpaRepository<DemandSpecialModule, Long> {

    List<DemandSpecialModule> findByDemandIdOrderByIdAsc(Long demandId);

    List<DemandSpecialModule> findByDemandIdInOrderByDemandIdAscIdAsc(List<Long> demandIds);

    void deleteByDemandId(Long demandId);

    @Query("""
        select coalesce(sum(s.manpowerDemand), 0)
        from DemandSpecialModule s, TestModuleConfig m
        where s.moduleId = m.id
          and s.demandId = :demandId
          and m.testType = :testType
        """)
    BigDecimal sumManpowerByDemandIdAndTestType(
        @Param("demandId") Long demandId,
        @Param("testType") String testType);
}
