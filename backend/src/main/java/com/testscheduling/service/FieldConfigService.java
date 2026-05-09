package com.testscheduling.service;

import com.testscheduling.entity.FieldConfig;
import com.testscheduling.repository.FieldConfigRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class FieldConfigService {

    @Autowired
    private FieldConfigRepository fieldConfigRepository;

    public List<FieldConfig> findAll() {
        return fieldConfigRepository.findAllByOrderBySortOrderAsc();
    }

    public FieldConfig findById(Long id) {
        return fieldConfigRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("字段配置不存在"));
    }

    public FieldConfig findByFieldName(String fieldName) {
        return fieldConfigRepository.findByFieldName(fieldName)
            .orElse(null);
    }

    @Transactional
    public FieldConfig create(FieldConfig config) {
        return fieldConfigRepository.save(config);
    }

    @Transactional
    public FieldConfig update(Long id, FieldConfig config) {
        FieldConfig existing = findById(id);
        existing.setFieldName(config.getFieldName());
        existing.setFieldType(config.getFieldType());
        existing.setOptions(config.getOptions());
        existing.setDescription(config.getDescription());
        existing.setRequired(config.getRequired());
        existing.setSortOrder(config.getSortOrder());
        return fieldConfigRepository.save(existing);
    }

    @Transactional
    public void delete(Long id) {
        fieldConfigRepository.deleteById(id);
    }
}
