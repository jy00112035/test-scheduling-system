package com.testscheduling.repository;

import com.testscheduling.entity.TestStaffModule;
import com.testscheduling.entity.TestStaffModuleId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TestStaffModuleRepository
        extends JpaRepository<TestStaffModule, TestStaffModuleId> {

    @Query("""
        select relation.id.moduleId
        from TestStaffModule relation
        where relation.id.staffId = :staffId
        order by relation.id.moduleId
        """)
    List<Long> findModuleIdsByStaffId(@Param("staffId") Long staffId);

    List<TestStaffModule> findByIdStaffIdInOrderByIdStaffIdAscIdModuleIdAsc(
        List<Long> staffIds);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from TestStaffModule relation where relation.id.staffId = :staffId")
    void deleteByStaffId(@Param("staffId") Long staffId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from TestStaffModule relation where relation.id.staffId in :staffIds")
    void deleteByStaffIdIn(@Param("staffIds") List<Long> staffIds);
}
