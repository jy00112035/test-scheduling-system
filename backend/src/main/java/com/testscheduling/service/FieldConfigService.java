package com.testscheduling.service;

import com.testscheduling.entity.FieldConfig;
import com.testscheduling.entity.DemandManpowerDetail;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.FieldConfigRepository;
import com.testscheduling.repository.DemandManpowerDetailRepository;
import com.testscheduling.repository.TestModuleConfigRepository;
import com.testscheduling.repository.TestStaffRepository;
import com.testscheduling.repository.UserRepository;
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

    @Autowired
    private TestModuleConfigRepository testModuleConfigRepository;

    @Autowired
    private UserRepository userRepository;

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
    public void appendStaffOptions(String groupName, String testType, String officeLocation) {
        appendOption("groupName", groupName);
        appendOption("testType", testType);
        appendOption("officeLocation", officeLocation);
    }

    @Transactional
    public void validateTestTypeOptionsForDemandWrite(List<DemandManpowerDetail> details) {
        FieldConfig config = fieldConfigRepository.findByFieldNameForUpdate("testType")
            .orElseThrow(() -> new BusinessException("DEMAND_TEST_TYPE_NOT_CONFIGURED",
                "测试类型配置不存在或已删除"));
        LinkedHashSet<String> configuredOptions = new LinkedHashSet<>(
            parseOptions(config.getOptions()));
        if (details == null) {
            return;
        }
        details.stream()
            .map(DemandManpowerDetail::getTestType)
            .filter(testType -> testType != null && !testType.isBlank())
            .map(String::trim)
            .filter(testType -> !configuredOptions.contains(testType))
            .findFirst()
            .ifPresent(testType -> {
                throw new BusinessException("DEMAND_TEST_TYPE_NOT_CONFIGURED",
                    "测试类型已删除或不可用: " + testType);
            });
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
        if (isStaffOptionField(existing.getFieldName())
                && !existing.getFieldName().equals(config.getFieldName())) {
            throw systemFieldImmutable();
        }
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
        return "groupName".equals(fieldName)
            || "testType".equals(fieldName)
            || "officeLocation".equals(fieldName);
    }

    private BusinessException systemFieldImmutable() {
        return new BusinessException("FIELD_CONFIG_SYSTEM_FIELD_IMMUTABLE",
            "系统字段不能改名或删除");
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
            referenced.addAll(testModuleConfigRepository.findDistinctReferencedTestTypes());
            referenced.addAll(userRepository.findDistinctReferencedTestTypes());
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
        FieldConfig existing = fieldConfigRepository.findByIdForUpdate(id)
            .orElseThrow(() -> new RuntimeException("字段配置不存在"));
        if (isStaffOptionField(existing.getFieldName())) {
            throw systemFieldImmutable();
        }
        fieldConfigRepository.delete(existing);
    }
}
