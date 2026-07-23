package com.testscheduling.service;

import com.testscheduling.dto.LegacyModuleMigrationReport;
import com.testscheduling.dto.StaffRequest;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.entity.User;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.TestModuleConfigRepository;
import com.testscheduling.repository.TestStaffModuleRepository;
import com.testscheduling.repository.TestStaffRepository;
import com.testscheduling.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@Transactional
class StaffModulePersistenceIntegrationTest {

    private static final String DATABASE_URL = "jdbc:h2:mem:staff-modules-" + UUID.randomUUID()
        + ";MODE=MySQL;DB_CLOSE_DELAY=-1";

    @DynamicPropertySource
    static void useUniqueDatabase(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> DATABASE_URL);
    }

    @Autowired
    private StaffModuleService staffModuleService;

    @Autowired
    private TestStaffService testStaffService;

    @Autowired
    private TestModuleConfigRepository moduleRepository;

    @Autowired
    private TestStaffRepository staffRepository;

    @Autowired
    private TestStaffModuleRepository staffModuleRepository;

    @Autowired
    private UserRepository userRepository;

    @Test
    void staffApiAllowsCrossGroupAndHonorsNullThenEmptyReplacement() {
        TestModuleConfig payment = moduleRepository.saveAndFlush(
            module("支付模块-跨组", "功能测试", true));
        StaffRequest create = request("能力-T1001", "自动化测试", List.of(payment.getId()));
        create.setFamiliarModules("支付模块-跨组");

        var created = testStaffService.create(create, "admin").getStaff();

        assertEquals(List.of(payment.getId()),
            created.getFamiliarModules().stream().map(TestModuleConfig::getId).toList());

        StaffRequest preserve = request("能力-T1001", "自动化测试", null);
        TestStaff preserved = testStaffService.update(created.getId(), preserve, "admin");
        assertEquals(List.of(payment.getId()),
            preserved.getFamiliarModules().stream().map(TestModuleConfig::getId).toList());
        assertEquals("支付模块-跨组", preserved.getLegacyFamiliarModules());

        StaffRequest clear = request("能力-T1001", "自动化测试", List.of());
        TestStaff cleared = testStaffService.update(created.getId(), clear, "admin");
        assertTrue(cleared.getFamiliarModules().isEmpty());
        assertTrue(staffModuleRepository.findModuleIdsByStaffId(created.getId()).isEmpty());
    }

    @Test
    void disabledExistingRelationCanRemainButCannotBeAddedToAnotherStaff() {
        TestModuleConfig module = moduleRepository.saveAndFlush(
            module("历史停用模块", "性能测试", true));
        TestStaff existing = staffRepository.saveAndFlush(staff("能力-T2001", "自动化测试"));
        TestStaff newcomer = staffRepository.saveAndFlush(staff("能力-T2002", "自动化测试"));
        staffModuleService.replaceModules(existing, List.of(module.getId()));

        module.setEnabled(false);
        moduleRepository.saveAndFlush(module);

        staffModuleService.replaceModules(existing, List.of(module.getId()));
        BusinessException error = assertThrows(BusinessException.class,
            () -> staffModuleService.replaceModules(newcomer, List.of(module.getId())));

        assertEquals("MODULE_DISABLED_FOR_NEW_STAFF", error.getErrorCode());
        assertEquals(List.of(module.getId()),
            staffModuleRepository.findModuleIdsByStaffId(existing.getId()));
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void migrationReportsAllProblemKindsAndIsIdempotentWithoutChangingLegacyText() {
        TestModuleConfig payment = moduleRepository.saveAndFlush(
            module("迁移支付模块", "功能测试", false));
        TestStaff staff = staffRepository.saveAndFlush(staff("能力-T3001", "功能测试"));
        User user = userRepository.saveAndFlush(user(
            "能力-T3001", "迁移支付模块，未知模块;迁移支付模块"));
        userRepository.saveAndFlush(user("能力-T3404", "迁移支付模块"));

        LegacyModuleMigrationReport first = testStaffService.migrateLegacyModules();
        LegacyModuleMigrationReport second = testStaffService.migrateLegacyModules();

        assertEquals(0, first.createdRelations());
        assertEquals(List.of("迁移支付模块"), first.duplicateNames().get("能力-T3001"));
        assertEquals(List.of("迁移支付模块", "未知模块"),
            first.unmatched().get("能力-T3001"));
        assertTrue(first.missingStaffAccounts().contains("能力-T3404"));
        assertEquals(0, second.createdRelations());
        assertTrue(staffModuleRepository.findModuleIdsByStaffId(staff.getId()).isEmpty());
        assertEquals("迁移支付模块，未知模块;迁移支付模块",
            userRepository.findById(user.getId()).orElseThrow().getFamiliarModules());
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void migrationPreservesPreExistingDisabledRelationIdempotently() {
        TestModuleConfig module = moduleRepository.saveAndFlush(
            module("迁移历史停用模块", "功能测试", true));
        TestStaff staff = staffRepository.saveAndFlush(staff("能力-T3101", "功能测试"));
        staffModuleService.replaceModules(staff, List.of(module.getId()));
        module.setEnabled(false);
        moduleRepository.saveAndFlush(module);
        userRepository.saveAndFlush(user("能力-T3101", "迁移历史停用模块"));

        LegacyModuleMigrationReport first = testStaffService.migrateLegacyModules();
        LegacyModuleMigrationReport second = testStaffService.migrateLegacyModules();

        assertEquals(0, first.createdRelations());
        assertFalse(first.unmatched().containsKey("能力-T3101"));
        assertEquals(0, second.createdRelations());
        assertEquals(List.of(module.getId()),
            staffModuleRepository.findModuleIdsByStaffId(staff.getId()));
    }

    @Test
    void deletingStaffRemovesRelationsBeforeForeignKeyParent() {
        TestModuleConfig module = moduleRepository.saveAndFlush(
            module("删除顺序模块", "功能测试", true));
        StaffRequest create = request("能力-T4001", "功能测试", List.of(module.getId()));
        TestStaff staff = testStaffService.create(create, "admin").getStaff();

        testStaffService.delete(staff.getId(), "admin");
        staffRepository.flush();

        assertFalse(staffRepository.existsById(staff.getId()));
        assertTrue(staffModuleRepository.findModuleIdsByStaffId(staff.getId()).isEmpty());
    }

    private StaffRequest request(String empNo, String testType, List<Long> moduleIds) {
        StaffRequest request = new StaffRequest();
        request.setName(empNo);
        request.setEmpNo(empNo);
        request.setGroupName(testType + "组");
        request.setTestType(testType);
        request.setInitialCoefficient(new BigDecimal("0.30"));
        request.setCurrentCoefficient(new BigDecimal("1.00"));
        request.setStatus("active");
        request.setFamiliarModuleIds(moduleIds);
        return request;
    }

    private TestStaff staff(String empNo, String testType) {
        TestStaff staff = new TestStaff();
        staff.setName(empNo);
        staff.setEmpNo(empNo);
        staff.setGroupName(testType + "组");
        staff.setTestType(testType);
        return staff;
    }

    private TestModuleConfig module(String name, String testType, boolean enabled) {
        TestModuleConfig module = new TestModuleConfig();
        module.setModuleName(name);
        module.setTestType(testType);
        module.setEnabled(enabled);
        module.setSortOrder(10);
        return module;
    }

    private User user(String username, String familiarModules) {
        User user = new User();
        user.setUsername(username);
        user.setPassword("encoded");
        user.setRoles(List.of("testExecutor"));
        user.setDisplayName(username);
        user.setFamiliarModules(familiarModules);
        user.setEnabled(true);
        return user;
    }
}
