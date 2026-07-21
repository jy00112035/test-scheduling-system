package com.testscheduling.service;

import com.testscheduling.dto.LegacyModuleMigrationReport;
import com.testscheduling.dto.StaffCreateResponse;
import com.testscheduling.dto.StaffRequest;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.entity.User;
import com.testscheduling.repository.TestStaffRepository;
import com.testscheduling.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
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

    @InjectMocks
    private TestStaffService service;

    private StaffRequest request;

    @BeforeEach
    void setUp() {
        request = new StaffRequest();
        request.setName("张三");
        request.setEmpNo("T1001");
        request.setFamiliarModules("支付模块");
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

        StaffCreateResponse response = service.create(request);

        verify(staffModuleService, never()).replaceModules(any(), any());
        assertEquals("支付模块", response.getStaff().getLegacyFamiliarModules());
        assertEquals(List.of(), response.getStaff().getFamiliarModules());
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

        TestStaff response = service.update(101L, request);

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

        TestStaff response = service.update(101L, request);

        assertEquals(List.of(payment), response.getFamiliarModules());
        verify(staffModuleService).findModulesByStaffId(101L);
    }

    @Test
    void migrationUsesAllUsersAndReturnsReport() {
        User user = user("T1001", "支付模块");
        LegacyModuleMigrationReport expected = new LegacyModuleMigrationReport(
            1, Map.of(), Map.of(), List.of());
        when(userRepository.findAll()).thenReturn(List.of(user));
        when(staffModuleService.migrateLegacy(List.of(user))).thenReturn(expected);

        LegacyModuleMigrationReport result = service.migrateLegacyModules();

        assertEquals(expected, result);
    }

    @Test
    void listEnrichmentUsesStructuredModulesAndLegacyCompatibilityProperty() {
        TestStaff staff = staff(101L, "T1001");
        TestModuleConfig payment = module(11L, "支付模块");
        when(testStaffRepository.findAll()).thenReturn(List.of(staff));
        when(userRepository.findByUsername("T1001")).thenReturn(Optional.of(user("T1001", "支付模块")));
        when(staffModuleService.findModulesByStaffIds(List.of(101L)))
            .thenReturn(Map.of(101L, List.of(payment)));

        List<TestStaff> result = service.findAll();

        assertEquals(List.of(payment), result.getFirst().getFamiliarModules());
        assertEquals("支付模块", result.getFirst().getLegacyFamiliarModules());
        assertNull(result.getFirst().getLockVersion());
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

    private TestModuleConfig module(Long id, String name) {
        TestModuleConfig module = new TestModuleConfig();
        module.setId(id);
        module.setModuleName(name);
        module.setEnabled(true);
        return module;
    }
}
