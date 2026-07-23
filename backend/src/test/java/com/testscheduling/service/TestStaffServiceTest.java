package com.testscheduling.service;

import com.testscheduling.dto.LegacyModuleMigrationReport;
import com.testscheduling.dto.LegacyModuleUser;
import com.testscheduling.dto.StaffCreateResponse;
import com.testscheduling.dto.StaffRequest;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.entity.User;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.security.StaffRoleAssignmentPolicy;
import com.testscheduling.repository.TestStaffRepository;
import com.testscheduling.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.SliceImpl;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TestStaffServiceTest {

    @Mock
    private TestStaffRepository testStaffRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private StaffModuleService staffModuleService;

    @Mock
    private FieldConfigService fieldConfigService;

    @Spy
    private StaffRoleAssignmentPolicy roleAssignmentPolicy = new StaffRoleAssignmentPolicy();

    @InjectMocks
    private TestStaffService service;

    private StaffRequest request;

    @BeforeEach
    void setUp() {
        request = new StaffRequest();
        request.setName("张三");
        request.setEmpNo("T1001");
        request.setFamiliarModules("支付模块");
        lenient().when(testStaffRepository.findByIdForUpdate(any()))
            .thenAnswer(invocation -> testStaffRepository.findById(invocation.getArgument(0)));
        lenient().when(userRepository.findByUsernameForUpdate(anyString()))
            .thenAnswer(invocation -> userRepository.findByUsername(invocation.getArgument(0)));
        lenient().when(userRepository.findByUsername("actor-admin"))
            .thenReturn(Optional.of(actor("actor-admin", List.of("admin"), null)));
    }

    @Test
    void createWithNullModuleIdsPreservesCompatibilityTextWithoutReplacingRelations() {
        when(testStaffRepository.save(any(TestStaff.class))).thenAnswer(invocation -> {
            TestStaff staff = invocation.getArgument(0);
            staff.setId(101L);
            return staff;
        });
        when(userRepository.existsByUsername("T1001")).thenReturn(false);
        when(passwordEncoder.encode("12345678")).thenReturn("encoded");
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(staffModuleService.findModulesByStaffId(101L)).thenReturn(List.of());
        when(userRepository.findByUsername("T1001")).thenReturn(Optional.of(user("T1001", "支付模块")));

        StaffCreateResponse response = service.create(request, "actor-admin");

        verify(staffModuleService, never()).replaceModules(any(), any());
        verify(fieldConfigService).appendStaffOptions(null, null);
        assertEquals("支付模块", response.getStaff().getLegacyFamiliarModules());
        assertEquals(List.of(), response.getStaff().getFamiliarModules());
    }

    @Test
    void duplicateCreateChecksAccountBeforeSavingStaff() {
        when(userRepository.existsByUsername("T1001")).thenReturn(true);

        assertThrows(RuntimeException.class, () -> service.create(request, "actor-admin"));

        verify(testStaffRepository, never()).save(any());
        verify(userRepository, never()).save(any());
        verify(passwordEncoder, never()).encode(anyString());
    }

    @Test
    void updateWithEmptyModuleIdsClearsAndReturnsFreshStructuredModules() {
        request.setFamiliarModuleIds(List.of());
        TestStaff existing = staff(101L, "T1001");
        when(testStaffRepository.findById(101L)).thenReturn(Optional.of(existing));
        when(testStaffRepository.save(existing)).thenReturn(existing);
        when(userRepository.findByUsername("T1001")).thenReturn(Optional.of(user("T1001", "旧模块")));
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(staffModuleService.replaceModules(existing, List.of())).thenReturn(List.of());
        when(staffModuleService.findModulesByStaffId(101L)).thenReturn(List.of());

        TestStaff response = service.update(101L, request, "actor-admin");

        verify(staffModuleService).replaceModules(existing, List.of());
        assertEquals(List.of(), response.getFamiliarModules());
        assertEquals("支付模块", response.getLegacyFamiliarModules());
    }

    @Test
    void updateResponseIsEnrichedAfterRelationReplacement() {
        request.setFamiliarModuleIds(List.of(11L));
        TestStaff existing = staff(101L, "T1001");
        TestModuleConfig payment = module(11L, "支付模块");
        when(testStaffRepository.findById(101L)).thenReturn(Optional.of(existing));
        when(testStaffRepository.save(existing)).thenReturn(existing);
        when(userRepository.findByUsername("T1001")).thenReturn(Optional.of(user("T1001", "支付模块")));
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(staffModuleService.replaceModules(existing, List.of(11L))).thenReturn(List.of(payment));
        when(staffModuleService.findModulesByStaffId(101L)).thenReturn(List.of(payment));

        TestStaff response = service.update(101L, request, "actor-admin");

        assertEquals(List.of(payment), response.getFamiliarModules());
        verify(staffModuleService).findModulesByStaffId(101L);
    }

    @Test
    void updateRejectsUsernameOwnedByAnotherUserBeforeMutatingStaff() {
        TestStaff existing = staff(101L, "T1001");
        User current = user("T1001", "支付模块");
        current.setId(1L);
        User target = user("T2002", "其他模块");
        target.setId(2L);
        request.setEmpNo("T2002");
        when(testStaffRepository.findById(101L)).thenReturn(Optional.of(existing));
        when(userRepository.findByUsername("T1001")).thenReturn(Optional.of(current));
        when(userRepository.findByUsername("T2002")).thenReturn(Optional.of(target));

        assertThrows(RuntimeException.class, () -> service.update(101L, request, "actor-admin"));

        assertEquals("T1001", existing.getEmpNo());
        verify(testStaffRepository, never()).save(any());
        verify(userRepository, never()).save(any());
        verify(staffModuleService, never()).replaceModules(any(), any());
    }

    @Test
    void migrationPagesLightweightRowsAndAggregatesReportsDeterministically() {
        List<LegacyModuleUser> firstPageUsers = IntStream.range(0, 200)
            .mapToObj(index -> new LegacyModuleUser("T" + index, "支付模块"))
            .toList();
        List<LegacyModuleUser> secondPageUsers = List.of(
            new LegacyModuleUser("T200", "未知模块"));
        PageRequest firstRequest = PageRequest.of(0, 200);
        PageRequest secondRequest = PageRequest.of(1, 200);
        when(userRepository.findLegacyModuleUsers(firstRequest)).thenReturn(
            new SliceImpl<>(firstPageUsers, firstRequest, true));
        when(userRepository.findLegacyModuleUsers(secondRequest)).thenReturn(
            new SliceImpl<>(secondPageUsers, secondRequest, false));
        when(staffModuleService.migrateLegacyPage(firstPageUsers)).thenReturn(
            new LegacyModuleMigrationReport(
                200, Map.of("T0", List.of("支付模块")), Map.of(), List.of()));
        when(staffModuleService.migrateLegacyPage(secondPageUsers)).thenReturn(
            new LegacyModuleMigrationReport(
                0, Map.of(), Map.of("T200", List.of("未知模块")), List.of("T200")));

        LegacyModuleMigrationReport result = service.migrateLegacyModules();

        assertEquals(200, result.createdRelations());
        assertEquals(List.of("T0"), result.duplicateNames().keySet().stream().toList());
        assertEquals(List.of("T200"), result.unmatched().keySet().stream().toList());
        assertEquals(List.of("T200"), result.missingStaffAccounts());
        verify(userRepository).findLegacyModuleUsers(firstRequest);
        verify(userRepository).findLegacyModuleUsers(secondRequest);
        verify(userRepository, never()).findAll();
        verify(staffModuleService).migrateLegacyPage(firstPageUsers);
        verify(staffModuleService).migrateLegacyPage(secondPageUsers);
    }

    @Test
    void listEnrichmentUsesStructuredModulesAndLegacyCompatibilityProperty() {
        TestStaff staff = staff(101L, "T1001");
        TestModuleConfig payment = module(11L, "支付模块");
        when(testStaffRepository.findAll()).thenReturn(List.of(staff));
        when(userRepository.findByUsernameIn(List.of("T1001")))
            .thenReturn(List.of(user("T1001", "支付模块")));
        when(staffModuleService.findModulesByStaffIds(List.of(101L)))
            .thenReturn(Map.of(101L, List.of(payment)));

        List<TestStaff> result = service.findAll();

        assertEquals(List.of(payment), result.getFirst().getFamiliarModules());
        assertEquals("支付模块", result.getFirst().getLegacyFamiliarModules());
        assertNull(result.getFirst().getLockVersion());
        verify(userRepository).findByUsernameIn(List.of("T1001"));
        verify(userRepository, never()).findByUsername(anyString());
    }

    @Test
    void activeListUsesOneBatchUserLookupForMultipleStaff() {
        TestStaff first = staff(101L, "T1001");
        TestStaff second = staff(102L, "T1002");
        when(testStaffRepository.findByStatus(TestStaff.StaffStatus.active))
            .thenReturn(List.of(first, second));
        when(userRepository.findByUsernameIn(List.of("T1001", "T1002")))
            .thenReturn(List.of(user("T1001", "模块一"), user("T1002", "模块二")));
        when(staffModuleService.findModulesByStaffIds(List.of(101L, 102L)))
            .thenReturn(Map.of());

        List<TestStaff> result = service.findActive();

        assertEquals(List.of("模块一", "模块二"), result.stream()
            .map(TestStaff::getLegacyFamiliarModules)
            .toList());
        verify(userRepository).findByUsernameIn(List.of("T1001", "T1002"));
        verify(userRepository, never()).findByUsername(anyString());
    }

    @Test
    void groupListUsesOneBatchUserLookupForMultipleStaff() {
        TestStaff first = staff(101L, "T1001");
        TestStaff second = staff(102L, "T1002");
        when(testStaffRepository.findByGroupName("功能测试组"))
            .thenReturn(List.of(first, second));
        when(userRepository.findByUsernameIn(List.of("T1001", "T1002")))
            .thenReturn(List.of(user("T1001", "模块一"), user("T1002", "模块二")));
        when(staffModuleService.findModulesByStaffIds(List.of(101L, 102L)))
            .thenReturn(Map.of());

        List<TestStaff> result = service.findByGroupName("功能测试组");

        assertEquals(2, result.size());
        verify(userRepository).findByUsernameIn(List.of("T1001", "T1002"));
        verify(userRepository, never()).findByUsername(anyString());
    }

    @Test
    void serviceRejectsAdminAndActorSpecificRoleEscalationBeforePersistence() {
        request.setRoles(List.of("admin"));
        BusinessException adminError = assertThrows(BusinessException.class,
            () -> service.create(request, "actor-admin"));
        assertEquals("STAFF_ADMIN_ROLE_FORBIDDEN", adminError.getErrorCode());

        User resource = actor("actor-resource", List.of("resourceManager"), null);
        when(userRepository.findByUsername("actor-resource")).thenReturn(Optional.of(resource));
        request.setRoles(List.of("resourceManager"));
        BusinessException escalation = assertThrows(BusinessException.class,
            () -> service.create(request, "actor-resource"));
        assertEquals("STAFF_ROLE_ASSIGNMENT_FORBIDDEN", escalation.getErrorCode());

        verify(testStaffRepository, never()).save(any());
    }

    @Test
    void serviceDeniesTestLeadCreationEvenForMatchingTestType() {
        when(userRepository.findByUsername("actor-lead")).thenReturn(Optional.of(
            actor("actor-lead", List.of("testLead"), "功能测试")));
        request.setTestType("功能测试");
        request.setRoles(List.of("testExecutor"));

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.create(request, "actor-lead"));

        assertEquals("TEST_LEAD_CREATE_FORBIDDEN", error.getErrorCode());
        verify(testStaffRepository, never()).save(any());
    }

    private TestStaff staff(Long id, String empNo) {
        TestStaff staff = new TestStaff();
        staff.setId(id);
        staff.setName("张三");
        staff.setEmpNo(empNo);
        return staff;
    }

    private User user(String username, String familiarModules) {
        User user = new User();
        user.setUsername(username);
        user.setFamiliarModules(familiarModules);
        user.setConfidentialClearance(false);
        return user;
    }

    private User actor(String username, List<String> roles, String testType) {
        User user = new User();
        user.setUsername(username);
        user.setRoles(roles);
        user.setTestType(testType);
        user.setEnabled(true);
        return user;
    }

    private TestModuleConfig module(Long id, String name) {
        TestModuleConfig module = new TestModuleConfig();
        module.setId(id);
        module.setModuleName(name);
        module.setEnabled(true);
        return module;
    }
}
