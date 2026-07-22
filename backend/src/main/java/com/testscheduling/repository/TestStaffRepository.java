package com.testscheduling.repository;

import com.testscheduling.entity.TestStaff;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface TestStaffRepository extends JpaRepository<TestStaff, Long> {

    List<TestStaff> findByStatus(TestStaff.StaffStatus status);

    List<TestStaff> findByGroupName(String groupName);

    Optional<TestStaff> findByEmpNo(String empNo);

    List<TestStaff> findByEmpNoIn(List<String> empNos);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from TestStaff s where s.id = :id")
    Optional<TestStaff> findByIdForUpdate(@Param("id") Long id);
}
