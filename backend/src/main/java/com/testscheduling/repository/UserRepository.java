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
}
