package com.testscheduling.repository;

import com.testscheduling.entity.TestModuleConfig;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import jakarta.persistence.LockModeType;
import java.util.Optional;

import java.util.List;

@Repository
public interface TestModuleConfigRepository extends JpaRepository<TestModuleConfig, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select m from TestModuleConfig m where m.id = :moduleId")
    Optional<TestModuleConfig> findByIdForUpdate(@Param("moduleId") Long moduleId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select m from TestModuleConfig m where m.id in :moduleIds order by m.id")
    List<TestModuleConfig> findAllByIdInForUpdate(@Param("moduleIds") List<Long> moduleIds);

    boolean existsByModuleName(String moduleName);

    boolean existsByModuleNameAndTestType(String moduleName, String testType);

    List<TestModuleConfig> findAllByOrderByTestTypeAscSortOrderAscModuleNameAsc();

    List<TestModuleConfig> findByTestTypeAndEnabledOrderBySortOrderAscModuleNameAsc(
        String testType, boolean enabled);

    List<TestModuleConfig> findByTestTypeOrderBySortOrderAscModuleNameAsc(String testType);

    List<TestModuleConfig> findByEnabledOrderByTestTypeAscSortOrderAscModuleNameAsc(boolean enabled);

    @Query("select distinct m.testType from TestModuleConfig m "
        + "where m.testType is not null and trim(m.testType) <> ''")
    List<String> findDistinctReferencedTestTypes();

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
