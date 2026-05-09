package com.testscheduling.repository;

import com.testscheduling.entity.FieldConfig;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;
import java.util.List;

@Repository
public interface FieldConfigRepository extends JpaRepository<FieldConfig, Long> {

    Optional<FieldConfig> findByFieldName(String fieldName);

    List<FieldConfig> findAllByOrderBySortOrderAsc();
}
