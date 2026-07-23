package com.testscheduling.service;

import com.testscheduling.entity.FieldConfig;
import com.testscheduling.repository.FieldConfigRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Arrays;
import java.util.ArrayList;

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

    @Transactional(readOnly = true)
    public List<String> findRegistrationTestTypes() {
        FieldConfig config = findByFieldName("testType");
        if (config == null || config.getOptions() == null || config.getOptions().isBlank()) {
            return List.of();
        }
        return Arrays.stream(config.getOptions().split(","))
            .map(String::trim)
            .filter(option -> !option.isEmpty())
            .distinct()
            .toList();
    }

    @Transactional
    public void appendStaffOptions(String groupName, String testType) {
        appendOption("groupName", groupName);
        appendOption("testType", testType);
    }

    private void appendOption(String fieldName, String value) {
        if (value == null || value.isBlank()) {
            return;
        }
        fieldConfigRepository.findByFieldName(fieldName).ifPresent(config -> {
            List<String> options = config.getOptions() == null || config.getOptions().isBlank()
                ? new ArrayList<>()
                : new ArrayList<>(Arrays.stream(config.getOptions().split(","))
                    .map(String::trim).filter(option -> !option.isEmpty()).toList());
            String normalized = value.trim();
            if (!options.contains(normalized)) {
                options.add(normalized);
                config.setOptions(String.join(",", options));
                fieldConfigRepository.save(config);
            }
        });
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
