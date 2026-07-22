package com.testscheduling.service;

import com.testscheduling.dto.TestModuleRequest;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.TestModuleConfigRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

import java.sql.SQLException;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.lenient;

@ExtendWith(MockitoExtension.class)
class TestModuleServiceTest {

    @Mock
    private TestModuleConfigRepository moduleRepository;

    @Mock
    private AuditLogService auditLogService;

    @InjectMocks
    private TestModuleService service;

    @BeforeEach
    void allowExistingModuleLocks() {
        lenient().when(moduleRepository.findByIdForUpdate(any()))
            .thenAnswer(invocation -> moduleRepository.findById(invocation.getArgument(0)));
    }

    @Test
    void rejectsDuplicateTrimmedModuleName() {
        when(moduleRepository.existsByModuleName("支付模块")).thenReturn(true);
        TestModuleRequest duplicate = request(" 支付模块 ", "功能测试", 10);

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.create(duplicate));

        assertEquals("MODULE_NAME_DUPLICATE", error.getErrorCode());
        verify(moduleRepository, never()).saveAndFlush(any());
    }

    @Test
    void translatesDatabaseUniquenessRaceToStableErrorCode() {
        TestModuleRequest candidate = request("支付模块", "功能测试", 10);
        when(moduleRepository.existsByModuleName("支付模块")).thenReturn(false);
        when(moduleRepository.saveAndFlush(any(TestModuleConfig.class)))
            .thenThrow(integrityFailure("Unique index UK_TEST_MODULE_NAME violated"));

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.create(candidate));

        assertEquals("MODULE_NAME_DUPLICATE", error.getErrorCode());
    }

    @Test
    void rethrowsUnrelatedIntegrityFailureInsteadOfCallingItDuplicate() {
        TestModuleRequest candidate = request("支付模块", "功能测试", 10);
        DataIntegrityViolationException databaseError = integrityFailure("other_constraint");
        when(moduleRepository.existsByModuleName("支付模块")).thenReturn(false);
        when(moduleRepository.saveAndFlush(any(TestModuleConfig.class))).thenThrow(databaseError);

        DataIntegrityViolationException thrown = assertThrows(
            DataIntegrityViolationException.class, () -> service.create(candidate));

        assertSame(databaseError, thrown);
    }

    @Test
    void rejectsBlankAndNullRequiredValues() {
        assertErrorCode("MODULE_NAME_REQUIRED",
            () -> service.create(request("  ", "功能测试", 10)));
        assertErrorCode("MODULE_TEST_TYPE_REQUIRED",
            () -> service.create(request("支付模块", " ", 10)));
        assertErrorCode("MODULE_SORT_ORDER_REQUIRED",
            () -> service.create(request("支付模块", "功能测试", null)));
    }

    @Test
    void rejectsOverlongNameAndTestTypeBeforePersistence() {
        assertErrorCode("MODULE_NAME_TOO_LONG",
            () -> service.create(request("名".repeat(101), "功能测试", 10)));
        assertErrorCode("MODULE_TEST_TYPE_TOO_LONG",
            () -> service.create(request("支付模块", "组".repeat(101), 10)));
        verify(moduleRepository, never()).saveAndFlush(any());
    }

    @Test
    void referencedModuleCanOnlyChangeStatusOrSortOrder() {
        TestModuleConfig existing = persistedModule(11L, "支付模块", "功能测试", true, 10);
        when(moduleRepository.findById(11L)).thenReturn(Optional.of(existing));
        when(moduleRepository.existsDemandReferenceByModuleId(11L)).thenReturn(true);
        TestModuleRequest changed = request("新名称", "功能测试", 20);

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.update(11L, changed));

        assertEquals("MODULE_REFERENCED_IMMUTABLE", error.getErrorCode());
        verify(moduleRepository, never()).saveAndFlush(any());
    }

    @Test
    void ordinaryUpdatePreservesDisabledStatusWhileChangingSortOrder() {
        TestModuleConfig existing = persistedModule(11L, "支付模块", "功能测试", false, 10);
        when(moduleRepository.findById(11L)).thenReturn(Optional.of(existing));
        when(moduleRepository.existsStaffReferenceByModuleId(11L)).thenReturn(true);
        when(moduleRepository.saveAndFlush(existing)).thenReturn(existing);

        TestModuleConfig result = service.update(
            11L, request(" 支付模块 ", "功能测试", 20));

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
    void mapsNamedModuleForeignKeyFailureRaisedByDeleteFlush() {
        TestModuleConfig existing = persistedModule(11L, "支付模块", "功能测试", true, 10);
        when(moduleRepository.findById(11L)).thenReturn(Optional.of(existing));
        doThrow(integrityFailure("Referential constraint FK_DSM_MODULE violated"))
            .when(moduleRepository).flush();

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.delete(11L));

        assertEquals("MODULE_REFERENCED_DELETE_FORBIDDEN", error.getErrorCode());
        verify(moduleRepository).delete(existing);
        verify(moduleRepository).flush();
    }

    @Test
    void rethrowsUnrelatedDeleteIntegrityFailure() {
        TestModuleConfig existing = persistedModule(11L, "支付模块", "功能测试", true, 10);
        DataIntegrityViolationException databaseError = integrityFailure("other_foreign_key");
        when(moduleRepository.findById(11L)).thenReturn(Optional.of(existing));
        doThrow(databaseError).when(moduleRepository).flush();

        DataIntegrityViolationException thrown = assertThrows(
            DataIntegrityViolationException.class, () -> service.delete(11L));

        assertSame(databaseError, thrown);
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
        when(moduleRepository.findReferencedModuleIds(List.of(11L))).thenReturn(List.of(11L));

        assertTrue(service.list(null, null).getFirst().getReferenced());
        assertTrue(service.list("功能测试", null).getFirst().getReferenced());
        assertTrue(service.list(null, true).getFirst().getReferenced());
        assertTrue(service.list("功能测试", true).getFirst().getReferenced());

        verify(moduleRepository).findAllByOrderByTestTypeAscSortOrderAscModuleNameAsc();
        verify(moduleRepository).findByTestTypeOrderBySortOrderAscModuleNameAsc("功能测试");
        verify(moduleRepository).findByEnabledOrderByTestTypeAscSortOrderAscModuleNameAsc(true);
        verify(moduleRepository)
            .findByTestTypeAndEnabledOrderBySortOrderAscModuleNameAsc("功能测试", true);
        verify(moduleRepository, org.mockito.Mockito.times(4))
            .findReferencedModuleIds(List.of(11L));
        verify(moduleRepository, never()).existsDemandReferenceByModuleId(any());
        verify(moduleRepository, never()).existsStaffReferenceByModuleId(any());
    }

    @Test
    void marksMultipleReferenceFlagsWithOneBatchQuery() {
        TestModuleConfig payment = persistedModule(11L, "支付模块", "功能测试", true, 10);
        TestModuleConfig login = persistedModule(12L, "登录模块", "功能测试", true, 20);
        when(moduleRepository.findAllByOrderByTestTypeAscSortOrderAscModuleNameAsc())
            .thenReturn(List.of(payment, login));
        when(moduleRepository.findReferencedModuleIds(List.of(11L, 12L))).thenReturn(List.of(12L));

        List<TestModuleConfig> result = service.list(null, null);

        assertFalse(result.get(0).getReferenced());
        assertTrue(result.get(1).getReferenced());
        verify(moduleRepository).findReferencedModuleIds(List.of(11L, 12L));
    }

    @Test
    void emptyListDoesNotExecuteReferenceQuery() {
        when(moduleRepository.findAllByOrderByTestTypeAscSortOrderAscModuleNameAsc())
            .thenReturn(List.of());

        assertTrue(service.list(null, null).isEmpty());

        verify(moduleRepository, never()).findReferencedModuleIds(anyList());
    }

    private static TestModuleRequest request(String moduleName, String testType, Integer sortOrder) {
        return new TestModuleRequest(moduleName, testType, sortOrder);
    }

    private static TestModuleConfig persistedModule(
            Long id, String moduleName, String testType, Boolean enabled, Integer sortOrder) {
        TestModuleConfig module = new TestModuleConfig();
        module.setId(id);
        module.setModuleName(moduleName);
        module.setTestType(testType);
        module.setEnabled(enabled);
        module.setSortOrder(sortOrder);
        return module;
    }

    private static void assertErrorCode(String expected, org.junit.jupiter.api.function.Executable action) {
        BusinessException error = assertThrows(BusinessException.class, action);
        assertEquals(expected, error.getErrorCode());
    }

    private static DataIntegrityViolationException integrityFailure(String causeMessage) {
        return new DataIntegrityViolationException(
            "database write failed", new SQLException(causeMessage));
    }
}
