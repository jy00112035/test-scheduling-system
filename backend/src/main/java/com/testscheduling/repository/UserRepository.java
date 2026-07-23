package com.testscheduling.repository;

import com.testscheduling.dto.LegacyModuleUser;
import com.testscheduling.entity.User;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Optional;
import java.util.Collection;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByUsername(String username);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.username = :username")
    Optional<User> findByUsernameForUpdate(@Param("username") String username);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.id = :id")
    Optional<User> findByIdForUpdate(@Param("id") Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.id in :ids order by u.id")
    List<User> findAllByIdInForUpdate(@Param("ids") Collection<Long> ids);

    @EntityGraph(attributePaths = "roles")
    List<User> findByUsernameIn(List<String> usernames);

    @Query("""
        select new com.testscheduling.dto.LegacyModuleUser(u.username, u.familiarModules)
        from User u
        where u.familiarModules is not null and trim(u.familiarModules) <> ''
        order by u.id
        """)
    Slice<LegacyModuleUser> findLegacyModuleUsers(Pageable pageable);

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

    @Query("select distinct u.testType from User u "
        + "where u.testType is not null and trim(u.testType) <> ''")
    List<String> findDistinctReferencedTestTypes();
}
