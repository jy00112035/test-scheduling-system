package com.testscheduling.service;

import com.testscheduling.dto.TestModuleRequest;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.TestModuleConfigRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class TestModuleService {

    private static final String AUDIT_ENTITY_TYPE = "TEST_MODULE_CONFIG";

    private final TestModuleConfigRepository moduleRepository;
    private final AuditLogService auditLogService;

    public TestModuleService(
            TestModuleConfigRepository moduleRepository,
            AuditLogService auditLogService) {
        this.moduleRepository = moduleRepository;
        this.auditLogService = auditLogService;
    }

    @Transactional(readOnly = true)
    public List<TestModuleConfig> list(String testType, Boolean enabled) {
        String normalizedTestType = normalizeOptional(testType);
        List<TestModuleConfig> modules;
        if (normalizedTestType != null && enabled != null) {
            modules = moduleRepository
                .findByTestTypeAndEnabledOrderBySortOrderAscModuleNameAsc(normalizedTestType, enabled);
        } else if (normalizedTestType != null) {
            modules = moduleRepository
                .findByTestTypeOrderBySortOrderAscModuleNameAsc(normalizedTestType);
        } else if (enabled != null) {
            modules = moduleRepository
                .findByEnabledOrderByTestTypeAscSortOrderAscModuleNameAsc(enabled);
        } else {
            modules = moduleRepository.findAllByOrderByTestTypeAscSortOrderAscModuleNameAsc();
        }

        if (modules.isEmpty()) {
            return modules;
        }
        List<Long> moduleIds = modules.stream().map(TestModuleConfig::getId).toList();
        Set<Long> referencedIds = moduleRepository.findReferencedModuleIds(moduleIds)
            .stream()
            .collect(Collectors.toSet());
        modules.forEach(module -> module.setReferenced(referencedIds.contains(module.getId())));
        return modules;
    }

    @Transactional
    public TestModuleConfig create(TestModuleRequest request) {
        TestModuleRequest normalized = normalizeAndValidate(request);
        if (moduleRepository.existsByModuleName(normalized.moduleName())) {
            throw duplicateName();
        }

        TestModuleConfig module = new TestModuleConfig();
        module.setModuleName(normalized.moduleName());
        module.setTestType(normalized.testType());
        module.setSortOrder(normalized.sortOrder());
        module.setEnabled(true);
        TestModuleConfig saved = save(module);
        auditLogService.record("MODULE_CREATED", AUDIT_ENTITY_TYPE, saved.getId(), null, saved);
        return saved;
    }

    @Transactional
    public TestModuleConfig update(Long id, TestModuleRequest request) {
        TestModuleConfig existing = findById(id);
        TestModuleRequest normalized = normalizeAndValidate(request);

        boolean referenced = isReferenced(id);
        boolean identityChanged = !Objects.equals(existing.getModuleName(), normalized.moduleName())
            || !Objects.equals(existing.getTestType(), normalized.testType());
        if (identityChanged && referenced) {
            throw new BusinessException(
                "MODULE_REFERENCED_IMMUTABLE", "模块已被引用，只能修改状态或排序");
        }
        if (!Objects.equals(existing.getModuleName(), normalized.moduleName())
                && moduleRepository.existsByModuleName(normalized.moduleName())) {
            throw duplicateName();
        }

        TestModuleConfig before = snapshot(existing);
        existing.setModuleName(normalized.moduleName());
        existing.setTestType(normalized.testType());
        existing.setSortOrder(normalized.sortOrder());
        TestModuleConfig saved = save(existing);
        auditLogService.record("MODULE_UPDATED", AUDIT_ENTITY_TYPE, id, before, saved);
        return saved;
    }

    @Transactional
    public TestModuleConfig setEnabled(Long id, boolean enabled) {
        TestModuleConfig existing = findById(id);
        TestModuleConfig before = snapshot(existing);
        existing.setEnabled(enabled);
        TestModuleConfig saved = save(existing);
        auditLogService.record("MODULE_STATUS_CHANGED", AUDIT_ENTITY_TYPE, id, before, saved);
        return saved;
    }

    @Transactional
    public void delete(Long id) {
        TestModuleConfig existing = findById(id);
        if (isReferenced(id)) {
            throw new BusinessException(
                "MODULE_REFERENCED_DELETE_FORBIDDEN", "模块已被引用，不能删除，请改为停用");
        }

        TestModuleConfig before = snapshot(existing);
        try {
            moduleRepository.delete(existing);
            moduleRepository.flush();
        } catch (DataIntegrityViolationException e) {
            if (hasNamedConstraint(e, "fk_dsm_module", "fk_tsm_module")) {
                throw referencedDeleteForbidden();
            }
            throw e;
        }
        auditLogService.record("MODULE_DELETED", AUDIT_ENTITY_TYPE, id, before, null);
    }

    private TestModuleConfig findById(Long id) {
        return moduleRepository.findById(id)
            .orElseThrow(() -> new BusinessException("MODULE_NOT_FOUND", "模块不存在"));
    }

    private boolean isReferenced(Long moduleId) {
        boolean demandReferenced = moduleRepository.existsDemandReferenceByModuleId(moduleId);
        boolean staffReferenced = moduleRepository.existsStaffReferenceByModuleId(moduleId);
        return demandReferenced || staffReferenced;
    }

    private TestModuleConfig save(TestModuleConfig module) {
        try {
            return moduleRepository.saveAndFlush(module);
        } catch (DataIntegrityViolationException e) {
            if (hasNamedConstraint(e, "uk_test_module_name")) {
                throw duplicateName();
            }
            throw e;
        }
    }

    private TestModuleRequest normalizeAndValidate(TestModuleRequest request) {
        if (request == null) {
            throw new BusinessException("MODULE_REQUIRED", "模块配置不能为空");
        }
        String moduleName = requireText(
            request.moduleName(), "MODULE_NAME_REQUIRED", "模块名称不能为空");
        String testType = requireText(
            request.testType(), "MODULE_TEST_TYPE_REQUIRED", "所属小组不能为空");
        if (moduleName.length() > 100) {
            throw new BusinessException("MODULE_NAME_TOO_LONG", "模块名称不能超过100个字符");
        }
        if (testType.length() > 100) {
            throw new BusinessException("MODULE_TEST_TYPE_TOO_LONG", "所属小组不能超过100个字符");
        }
        if (request.sortOrder() == null) {
            throw new BusinessException("MODULE_SORT_ORDER_REQUIRED", "模块排序不能为空");
        }
        return new TestModuleRequest(moduleName, testType, request.sortOrder());
    }

    private String requireText(String value, String errorCode, String message) {
        if (value == null || value.isBlank()) {
            throw new BusinessException(errorCode, message);
        }
        return value.trim();
    }

    private String normalizeOptional(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private BusinessException duplicateName() {
        return new BusinessException("MODULE_NAME_DUPLICATE", "模块名称已存在");
    }

    private BusinessException referencedDeleteForbidden() {
        return new BusinessException(
            "MODULE_REFERENCED_DELETE_FORBIDDEN", "模块已被引用，不能删除，请改为停用");
    }

    private boolean hasNamedConstraint(Throwable error, String... constraintNames) {
        for (Throwable current = error; current != null; current = current.getCause()) {
            String message = current.getMessage();
            if (message == null) {
                continue;
            }
            String normalized = message.toLowerCase(Locale.ROOT);
            if (java.util.Arrays.stream(constraintNames).anyMatch(normalized::contains)) {
                return true;
            }
        }
        return false;
    }

    private TestModuleConfig snapshot(TestModuleConfig source) {
        TestModuleConfig snapshot = new TestModuleConfig();
        snapshot.setId(source.getId());
        snapshot.setModuleName(source.getModuleName());
        snapshot.setTestType(source.getTestType());
        snapshot.setEnabled(source.getEnabled());
        snapshot.setSortOrder(source.getSortOrder());
        snapshot.setLockVersion(source.getLockVersion());
        snapshot.setCreatedAt(source.getCreatedAt());
        snapshot.setUpdatedAt(source.getUpdatedAt());
        snapshot.setReferenced(source.getReferenced());
        return snapshot;
    }
}
