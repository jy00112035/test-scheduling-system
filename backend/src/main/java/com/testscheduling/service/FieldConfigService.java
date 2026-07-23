package com.testscheduling.service;

import com.testscheduling.entity.FieldConfig;
import com.testscheduling.repository.FieldConfigRepository;
import com.testscheduling.repository.DemandManpowerDetailRepository;
import com.testscheduling.repository.TestStaffRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Arrays;
import java.util.ArrayList;
import java.util.LinkedHashSet;

@Service
public class FieldConfigService {

    @Autowired
    private FieldConfigRepository fieldConfigRepository;

    @Autowired
    private TestStaffRepository testStaffRepository;

    @Autowired
    private DemandManpowerDetailRepository demandManpowerDetailRepository;

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
        fieldConfigRepository.findByFieldNameForUpdate(fieldName).ifPresent(config -> {
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
        FieldConfig existing = fieldConfigRepository.findByIdForUpdate(id)
            .orElseThrow(() -> new RuntimeException("字段配置不存在"));
        boolean staffOptionField = isStaffOptionField(existing.getFieldName())
            || isStaffOptionField(config.getFieldName());
        existing.setFieldName(config.getFieldName());
        existing.setFieldType(config.getFieldType());
        existing.setOptions(staffOptionField
            ? mergeReferencedOptions(config.getFieldName(), config.getOptions())
            : config.getOptions());
        existing.setDescription(config.getDescription());
        existing.setRequired(config.getRequired());
        existing.setSortOrder(config.getSortOrder());
        return fieldConfigRepository.save(existing);
    }

    private boolean isStaffOptionField(String fieldName) {
        return "groupName".equals(fieldName) || "testType".equals(fieldName);
    }

    private String mergeReferencedOptions(String fieldName, String requestedOptions) {
        LinkedHashSet<String> merged = new LinkedHashSet<>(parseOptions(requestedOptions));
        referencedOptions(fieldName).stream()
            .map(String::trim)
            .filter(option -> !option.isEmpty())
            .forEach(merged::add);
        return String.join(",", merged);
    }

    private List<String> referencedOptions(String fieldName) {
        if ("groupName".equals(fieldName)) {
            return testStaffRepository.findDistinctReferencedGroupNames();
        }
        if ("testType".equals(fieldName)) {
            List<String> referenced = new ArrayList<>(
                testStaffRepository.findDistinctReferencedTestTypes());
            referenced.addAll(demandManpowerDetailRepository.findDistinctReferencedTestTypes());
            return referenced;
        }
        return List.of();
    }

    private List<String> parseOptions(String options) {
        if (options == null || options.isBlank()) {
            return List.of();
        }
        return Arrays.stream(options.split(","))
            .map(String::trim)
            .filter(option -> !option.isEmpty())
            .distinct()
            .toList();
    }

    @Transactional
    public void delete(Long id) {
        fieldConfigRepository.deleteById(id);
    }
}
