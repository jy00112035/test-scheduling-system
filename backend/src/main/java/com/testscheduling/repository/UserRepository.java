package com.testscheduling.repository;

import com.testscheduling.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
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

    List<User> findByEnabledFalseAndRole(String role);
}
