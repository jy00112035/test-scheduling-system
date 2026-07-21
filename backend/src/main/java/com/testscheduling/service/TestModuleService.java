package com.testscheduling.service;

import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.TestModuleConfigRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Objects;

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

        modules.forEach(module -> module.setReferenced(isReferenced(module.getId())));
        return modules;
    }

    @Transactional
    public TestModuleConfig create(TestModuleConfig module) {
        normalizeAndValidate(module);
        if (moduleRepository.existsByModuleName(module.getModuleName())) {
            throw duplicateName();
        }

        TestModuleConfig saved = save(module);
        auditLogService.record("MODULE_CREATED", AUDIT_ENTITY_TYPE, saved.getId(), null, saved);
        return saved;
    }

    @Transactional
    public TestModuleConfig update(Long id, TestModuleConfig requested) {
        TestModuleConfig existing = findById(id);
        normalizeAndValidate(requested);

        boolean referenced = isReferenced(id);
        boolean identityChanged = !Objects.equals(existing.getModuleName(), requested.getModuleName())
            || !Objects.equals(existing.getTestType(), requested.getTestType());
        if (identityChanged && referenced) {
            throw new BusinessException(
                "MODULE_REFERENCED_IMMUTABLE", "模块已被引用，只能修改状态或排序");
        }
        if (!Objects.equals(existing.getModuleName(), requested.getModuleName())
                && moduleRepository.existsByModuleName(requested.getModuleName())) {
            throw duplicateName();
        }

        TestModuleConfig before = snapshot(existing);
        existing.setModuleName(requested.getModuleName());
        existing.setTestType(requested.getTestType());
        existing.setEnabled(requested.getEnabled());
        existing.setSortOrder(requested.getSortOrder());
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
        moduleRepository.delete(existing);
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
            throw duplicateName();
        }
    }

    private void normalizeAndValidate(TestModuleConfig module) {
        if (module == null) {
            throw new BusinessException("MODULE_REQUIRED", "模块配置不能为空");
        }
        module.setModuleName(requireText(
            module.getModuleName(), "MODULE_NAME_REQUIRED", "模块名称不能为空"));
        module.setTestType(requireText(
            module.getTestType(), "MODULE_TEST_TYPE_REQUIRED", "所属小组不能为空"));
        if (module.getEnabled() == null) {
            throw new BusinessException("MODULE_ENABLED_REQUIRED", "模块状态不能为空");
        }
        if (module.getSortOrder() == null) {
            throw new BusinessException("MODULE_SORT_ORDER_REQUIRED", "模块排序不能为空");
        }
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
