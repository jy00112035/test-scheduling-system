package com.testscheduling.service;

import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.TestModuleConfigRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TestModuleServiceTest {

    @Mock
    private TestModuleConfigRepository moduleRepository;

    @Mock
    private AuditLogService auditLogService;

    @InjectMocks
    private TestModuleService service;

    @Test
    void rejectsDuplicateTrimmedModuleName() {
        when(moduleRepository.existsByModuleName("支付模块")).thenReturn(true);
        TestModuleConfig duplicate = module(" 支付模块 ", "功能测试", true, 10);

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.create(duplicate));

        assertEquals("MODULE_NAME_DUPLICATE", error.getErrorCode());
        verify(moduleRepository, never()).saveAndFlush(any());
    }

    @Test
    void translatesDatabaseUniquenessRaceToStableErrorCode() {
        TestModuleConfig candidate = module("支付模块", "功能测试", true, 10);
        when(moduleRepository.existsByModuleName("支付模块")).thenReturn(false);
        when(moduleRepository.saveAndFlush(candidate))
            .thenThrow(new DataIntegrityViolationException("uk_test_module_name"));

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.create(candidate));

        assertEquals("MODULE_NAME_DUPLICATE", error.getErrorCode());
    }

    @Test
    void rejectsBlankAndNullRequiredValues() {
        assertErrorCode("MODULE_NAME_REQUIRED",
            () -> service.create(module("  ", "功能测试", true, 10)));
        assertErrorCode("MODULE_TEST_TYPE_REQUIRED",
            () -> service.create(module("支付模块", " ", true, 10)));
        assertErrorCode("MODULE_ENABLED_REQUIRED",
            () -> service.create(module("支付模块", "功能测试", null, 10)));
        assertErrorCode("MODULE_SORT_ORDER_REQUIRED",
            () -> service.create(module("支付模块", "功能测试", true, null)));
    }

    @Test
    void referencedModuleCanOnlyChangeStatusOrSortOrder() {
        TestModuleConfig existing = persistedModule(11L, "支付模块", "功能测试", true, 10);
        when(moduleRepository.findById(11L)).thenReturn(Optional.of(existing));
        when(moduleRepository.existsDemandReferenceByModuleId(11L)).thenReturn(true);
        TestModuleConfig changed = module("新名称", "功能测试", true, 20);

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.update(11L, changed));

        assertEquals("MODULE_REFERENCED_IMMUTABLE", error.getErrorCode());
        verify(moduleRepository, never()).saveAndFlush(any());
    }

    @Test
    void referencedModuleMayChangeStatusAndSortOrder() {
        TestModuleConfig existing = persistedModule(11L, "支付模块", "功能测试", true, 10);
        when(moduleRepository.findById(11L)).thenReturn(Optional.of(existing));
        when(moduleRepository.existsStaffReferenceByModuleId(11L)).thenReturn(true);
        when(moduleRepository.saveAndFlush(existing)).thenReturn(existing);

        TestModuleConfig result = service.update(
            11L, module(" 支付模块 ", "功能测试", false, 20));

        assertFalse(result.getEnabled());
        assertEquals(20, result.getSortOrder());
        verify(auditLogService).record(
            org.mockito.ArgumentMatchers.eq("MODULE_UPDATED"),
            org.mockito.ArgumentMatchers.eq("TEST_MODULE_CONFIG"),
            org.mockito.ArgumentMatchers.eq(11L),
            any(TestModuleConfig.class),
            org.mockito.ArgumentMatchers.eq(result));
    }

    @Test
    void rejectsDeletionWhenDemandReferencesModule() {
        TestModuleConfig existing = persistedModule(11L, "支付模块", "功能测试", true, 10);
        when(moduleRepository.findById(11L)).thenReturn(Optional.of(existing));
        when(moduleRepository.existsDemandReferenceByModuleId(11L)).thenReturn(true);

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.delete(11L));

        assertEquals("MODULE_REFERENCED_DELETE_FORBIDDEN", error.getErrorCode());
        verify(moduleRepository, never()).delete(any());
    }

    @Test
    void rejectsDeletionWhenStaffReferencesModule() {
        TestModuleConfig existing = persistedModule(11L, "支付模块", "功能测试", true, 10);
        when(moduleRepository.findById(11L)).thenReturn(Optional.of(existing));
        when(moduleRepository.existsStaffReferenceByModuleId(11L)).thenReturn(true);

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.delete(11L));

        assertEquals("MODULE_REFERENCED_DELETE_FORBIDDEN", error.getErrorCode());
        verify(moduleRepository, never()).delete(any());
    }

    @Test
    void statusUpdateChangesOnlyEnabledAndRecordsAudit() {
        TestModuleConfig existing = persistedModule(11L, "支付模块", "功能测试", true, 10);
        when(moduleRepository.findById(11L)).thenReturn(Optional.of(existing));
        when(moduleRepository.saveAndFlush(existing)).thenReturn(existing);

        TestModuleConfig result = service.setEnabled(11L, false);

        assertFalse(result.getEnabled());
        assertEquals("支付模块", result.getModuleName());
        assertEquals("功能测试", result.getTestType());
        assertEquals(10, result.getSortOrder());
        verify(auditLogService).record(
            org.mockito.ArgumentMatchers.eq("MODULE_STATUS_CHANGED"),
            org.mockito.ArgumentMatchers.eq("TEST_MODULE_CONFIG"),
            org.mockito.ArgumentMatchers.eq(11L),
            any(TestModuleConfig.class),
            org.mockito.ArgumentMatchers.eq(result));
    }

    @Test
    void supportsEveryOptionalListFilterCombinationAndComputesReferences() {
        TestModuleConfig payment = persistedModule(11L, "支付模块", "功能测试", true, 10);
        when(moduleRepository.findAllByOrderByTestTypeAscSortOrderAscModuleNameAsc())
            .thenReturn(List.of(payment));
        when(moduleRepository.findByTestTypeOrderBySortOrderAscModuleNameAsc("功能测试"))
            .thenReturn(List.of(payment));
        when(moduleRepository.findByEnabledOrderByTestTypeAscSortOrderAscModuleNameAsc(true))
            .thenReturn(List.of(payment));
        when(moduleRepository.findByTestTypeAndEnabledOrderBySortOrderAscModuleNameAsc("功能测试", true))
            .thenReturn(List.of(payment));
        when(moduleRepository.existsDemandReferenceByModuleId(11L)).thenReturn(true);

        assertTrue(service.list(null, null).getFirst().getReferenced());
        assertTrue(service.list("功能测试", null).getFirst().getReferenced());
        assertTrue(service.list(null, true).getFirst().getReferenced());
        assertTrue(service.list("功能测试", true).getFirst().getReferenced());

        verify(moduleRepository).findAllByOrderByTestTypeAscSortOrderAscModuleNameAsc();
        verify(moduleRepository).findByTestTypeOrderBySortOrderAscModuleNameAsc("功能测试");
        verify(moduleRepository).findByEnabledOrderByTestTypeAscSortOrderAscModuleNameAsc(true);
        verify(moduleRepository)
            .findByTestTypeAndEnabledOrderBySortOrderAscModuleNameAsc("功能测试", true);
    }

    private static TestModuleConfig module(
            String moduleName, String testType, Boolean enabled, Integer sortOrder) {
        TestModuleConfig module = new TestModuleConfig();
        module.setModuleName(moduleName);
        module.setTestType(testType);
        module.setEnabled(enabled);
        module.setSortOrder(sortOrder);
        return module;
    }

    private static TestModuleConfig persistedModule(
            Long id, String moduleName, String testType, Boolean enabled, Integer sortOrder) {
        TestModuleConfig module = module(moduleName, testType, enabled, sortOrder);
        module.setId(id);
        return module;
    }

    private static void assertErrorCode(String expected, org.junit.jupiter.api.function.Executable action) {
        BusinessException error = assertThrows(BusinessException.class, action);
        assertEquals(expected, error.getErrorCode());
    }
}
