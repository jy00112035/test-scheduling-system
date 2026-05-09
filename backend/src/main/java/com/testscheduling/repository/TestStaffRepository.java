package com.testscheduling.repository;

import com.testscheduling.entity.TestStaff;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface TestStaffRepository extends JpaRepository<TestStaff, Long> {

    List<TestStaff> findByStatus(TestStaff.StaffStatus status);

    List<TestStaff> findByGroupName(String groupName);

    Optional<TestStaff> findByEmpNo(String empNo);
}
