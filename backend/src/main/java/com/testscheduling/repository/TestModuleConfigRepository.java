package com.testscheduling.repository;

import com.testscheduling.entity.TestModuleConfig;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TestModuleConfigRepository extends JpaRepository<TestModuleConfig, Long> {

    boolean existsByModuleName(String moduleName);

    List<TestModuleConfig> findAllByOrderByTestTypeAscSortOrderAscModuleNameAsc();

    List<TestModuleConfig> findByTestTypeAndEnabledOrderBySortOrderAscModuleNameAsc(
        String testType, boolean enabled);

    List<TestModuleConfig> findByTestTypeOrderBySortOrderAscModuleNameAsc(String testType);

    List<TestModuleConfig> findByEnabledOrderByTestTypeAscSortOrderAscModuleNameAsc(boolean enabled);

    @Query(value = """
        SELECT module_id
        FROM demand_special_module
        WHERE module_id IN (:moduleIds)
        UNION
        SELECT module_id
        FROM test_staff_module
        WHERE module_id IN (:moduleIds)
        """, nativeQuery = true)
    List<Long> findReferencedModuleIds(@Param("moduleIds") List<Long> moduleIds);

    @Query(value = """
        SELECT COUNT(*)
        FROM demand_special_module
        WHERE module_id = :moduleId
        """, nativeQuery = true)
    long countDemandReferencesByModuleId(@Param("moduleId") Long moduleId);

    @Query(value = """
        SELECT COUNT(*)
        FROM test_staff_module
        WHERE module_id = :moduleId
        """, nativeQuery = true)
    long countStaffReferencesByModuleId(@Param("moduleId") Long moduleId);

    default boolean existsDemandReferenceByModuleId(Long moduleId) {
        return countDemandReferencesByModuleId(moduleId) > 0;
    }

    default boolean existsStaffReferenceByModuleId(Long moduleId) {
        return countStaffReferencesByModuleId(moduleId) > 0;
    }
}
