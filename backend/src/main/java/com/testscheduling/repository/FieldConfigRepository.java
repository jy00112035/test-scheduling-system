package com.testscheduling.repository;

import com.testscheduling.entity.FieldConfig;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;
import java.util.List;

@Repository
public interface FieldConfigRepository extends JpaRepository<FieldConfig, Long> {

    Optional<FieldConfig> findByFieldName(String fieldName);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT f FROM FieldConfig f WHERE f.id = :id")
    Optional<FieldConfig> findByIdForUpdate(@Param("id") Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT f FROM FieldConfig f WHERE f.fieldName = :fieldName")
    Optional<FieldConfig> findByFieldNameForUpdate(@Param("fieldName") String fieldName);

    List<FieldConfig> findAllByOrderBySortOrderAsc();
}
