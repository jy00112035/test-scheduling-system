package com.testscheduling.repository;

import com.testscheduling.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByUsername(String username);

    boolean existsByUsername(String username);

    @Transactional
    void deleteByUsernameIn(List<String> usernames);

    List<User> findByEnabledFalse();

    @Query("SELECT u FROM User u WHERE u.enabled = false AND :role MEMBER OF u.roles")
    List<User> findPendingByRole(@Param("role") String role);

    /**
     * 查找指定测试类型的待审批测试执行人员
     */
    @Query("SELECT u FROM User u WHERE u.enabled = false AND u.testType = :testType AND 'testExecutor' MEMBER OF u.roles")
    List<User> findPendingTestExecutorsByTestType(@Param("testType") String testType);

    /**
     * 查找角色在指定列表中的待审批用户
     */
    @Query("SELECT u FROM User u WHERE u.enabled = false AND EXISTS (SELECT r FROM u.roles r WHERE r IN :roles)")
    List<User> findPendingByRoles(@Param("roles") List<String> roles);

    /**
     * 查找所有待审批的测试执行人员（资源经理审批用，不过滤testType）
     */
    @Query("SELECT u FROM User u WHERE u.enabled = false AND 'testExecutor' MEMBER OF u.roles")
    List<User> findPendingTestExecutors();
}
