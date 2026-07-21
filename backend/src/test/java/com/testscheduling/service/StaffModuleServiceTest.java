package com.testscheduling.service;

import com.testscheduling.dto.LegacyModuleMigrationReport;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.entity.TestStaffModule;
import com.testscheduling.entity.TestStaffModuleId;
import com.testscheduling.entity.User;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.TestModuleConfigRepository;
import com.testscheduling.repository.TestStaffModuleRepository;
import com.testscheduling.repository.TestStaffRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@SuppressWarnings("unchecked")
class StaffModuleServiceTest {

    @Mock
    private TestStaffModuleRepository staffModuleRepository;

    @Mock
    private TestModuleConfigRepository moduleRepository;

    @Mock
    private TestStaffRepository staffRepository;

    @Mock
    private AuditLogService auditLogService;

    @InjectMocks
    private StaffModuleService service;

    @Test
    void replacesModulesWithoutCheckingStaffGroup() {
        TestStaff staff = staff(101L, "T1001");
        staff.setGroupName("自动化测试组");
        TestModuleConfig external = module(11L, "支付模块", true);
        external.setTestType("功能测试");
        when(staffModuleRepository.findModuleIdsByStaffId(101L)).thenReturn(List.of());
        when(moduleRepository.findAllById(List.of(11L))).thenReturn(List.of(external));

        service.replaceModules(staff, List.of(11L));

        ArgumentCaptor<Iterable<TestStaffModule>> captor = ArgumentCaptor.forClass(Iterable.class);
        verify(staffModuleRepository).saveAll(captor.capture());
        TestStaffModule saved = captor.getValue().iterator().next();
        assertEquals(new TestStaffModuleId(101L, 11L), saved.getId());
    }

    @Test
    void rejectsNewDisabledModuleButAllowsRetainingExistingDisabledModule() {
        TestStaff staff = staff(101L, "T1001");
        TestModuleConfig disabled = module(11L, "支付模块", false);
        when(moduleRepository.findAllById(List.of(11L))).thenReturn(List.of(disabled));

        when(staffModuleRepository.findModuleIdsByStaffId(101L)).thenReturn(List.of());
        BusinessException error = assertThrows(BusinessException.class,
            () -> service.replaceModules(staff, List.of(11L)));
        assertEquals("MODULE_DISABLED_FOR_NEW_STAFF", error.getErrorCode());
        verify(staffModuleRepository, never()).deleteByStaffId(any());

        when(staffModuleRepository.findModuleIdsByStaffId(101L)).thenReturn(List.of(11L));
        service.replaceModules(staff, List.of(11L));

        verify(staffModuleRepository).deleteByStaffId(101L);
        verify(staffModuleRepository).saveAll(anyList());
    }

    @Test
    void collapsesDuplicateIdsAndFlushesDeleteBeforeInsertAndAudit() {
        TestStaff staff = staff(101L, "T1001");
        when(staffModuleRepository.findModuleIdsByStaffId(101L)).thenReturn(List.of(7L));
        when(moduleRepository.findAllById(List.of(11L))).thenReturn(List.of(module(11L, "支付模块", true)));

        service.replaceModules(staff, List.of(11L, 11L));

        InOrder order = inOrder(staffModuleRepository, auditLogService);
        order.verify(staffModuleRepository).deleteByStaffId(101L);
        order.verify(staffModuleRepository).flush();
        ArgumentCaptor<List<TestStaffModule>> rows = ArgumentCaptor.forClass(List.class);
        order.verify(staffModuleRepository).saveAll(rows.capture());
        order.verify(auditLogService).record(
            "STAFF_MODULES_REPLACED", "TEST_STAFF", 101L, List.of(7L), List.of(11L));
        assertEquals(1, rows.getValue().size());
    }

    @Test
    void emptyReplacementClearsRelationsAndAudits() {
        TestStaff staff = staff(101L, "T1001");
        when(staffModuleRepository.findModuleIdsByStaffId(101L)).thenReturn(List.of(7L));

        service.replaceModules(staff, List.of());

        verify(moduleRepository, never()).findAllById(anyList());
        verify(staffModuleRepository).deleteByStaffId(101L);
        verify(staffModuleRepository).flush();
        verify(staffModuleRepository, never()).saveAll(anyList());
        verify(auditLogService).record(
            "STAFF_MODULES_REPLACED", "TEST_STAFF", 101L, List.of(7L), List.of());
    }

    @Test
    void migrationReportsUnknownAndDuplicateNamesAndKeepsLegacyText() {
        User user = legacyUser("T1001", "支付模块，未知模块;支付模块");
        TestStaff staff = staff(101L, "T1001");
        TestModuleConfig payment = module(11L, "支付模块", true);
        when(staffRepository.findByEmpNo("T1001")).thenReturn(Optional.of(staff));
        when(moduleRepository.findAll()).thenReturn(List.of(payment));
        when(staffModuleRepository.findModuleIdsByStaffId(101L)).thenReturn(List.of());

        LegacyModuleMigrationReport report = service.migrateLegacy(List.of(user));

        assertEquals(List.of("未知模块"), report.unmatched().get("T1001"));
        assertEquals(List.of("支付模块"), report.duplicateNames().get("T1001"));
        assertEquals(1, report.createdRelations());
        assertEquals("支付模块，未知模块;支付模块", user.getFamiliarModules());
    }

    @Test
    void migrationIsIdempotentAndReportsMissingStaffAccounts() {
        User migrated = legacyUser("T1001", "支付模块");
        User missing = legacyUser("T404", "支付模块");
        TestStaff staff = staff(101L, "T1001");
        when(moduleRepository.findAll()).thenReturn(List.of(module(11L, "支付模块", true)));
        when(staffRepository.findByEmpNo("T1001")).thenReturn(Optional.of(staff));
        when(staffRepository.findByEmpNo("T404")).thenReturn(Optional.empty());
        when(staffModuleRepository.findModuleIdsByStaffId(101L)).thenReturn(List.of(11L));

        LegacyModuleMigrationReport report = service.migrateLegacy(List.of(migrated, missing));

        assertEquals(0, report.createdRelations());
        assertEquals(List.of("T404"), report.missingStaffAccounts());
        verify(staffModuleRepository, never()).saveAll(anyList());
    }

    @Test
    void migrationReportsDisabledLegacyModuleWithoutCreatingRelation() {
        User user = legacyUser("T1001", "停用模块");
        TestStaff staff = staff(101L, "T1001");
        when(moduleRepository.findAll()).thenReturn(List.of(module(11L, "停用模块", false)));
        when(staffRepository.findByEmpNo("T1001")).thenReturn(Optional.of(staff));
        when(staffModuleRepository.findModuleIdsByStaffId(101L)).thenReturn(List.of());

        LegacyModuleMigrationReport report = service.migrateLegacy(List.of(user));

        assertEquals(0, report.createdRelations());
        assertEquals(List.of("停用模块"), report.unmatched().get("T1001"));
        verify(staffModuleRepository, never()).saveAll(anyList());
    }

    @Test
    void migrationPreservesPreExistingDisabledRelationWithoutReportingOrWriting() {
        User user = legacyUser("T1001", "停用模块");
        TestStaff staff = staff(101L, "T1001");
        when(moduleRepository.findAll()).thenReturn(List.of(module(11L, "停用模块", false)));
        when(staffRepository.findByEmpNo("T1001")).thenReturn(Optional.of(staff));
        when(staffModuleRepository.findModuleIdsByStaffId(101L)).thenReturn(List.of(11L));

        LegacyModuleMigrationReport report = service.migrateLegacy(List.of(user));

        assertEquals(0, report.createdRelations());
        assertFalse(report.unmatched().containsKey("T1001"));
        verify(staffModuleRepository, never()).saveAll(anyList());
    }

    private TestStaff staff(Long id, String empNo) {
        TestStaff staff = new TestStaff();
        staff.setId(id);
        staff.setEmpNo(empNo);
        return staff;
    }

    private TestModuleConfig module(Long id, String name, boolean enabled) {
        TestModuleConfig module = new TestModuleConfig();
        module.setId(id);
        module.setModuleName(name);
        module.setTestType("功能测试");
        module.setEnabled(enabled);
        return module;
    }

    private User legacyUser(String username, String familiarModules) {
        User user = new User();
        user.setUsername(username);
        user.setFamiliarModules(familiarModules);
        return user;
    }
}
