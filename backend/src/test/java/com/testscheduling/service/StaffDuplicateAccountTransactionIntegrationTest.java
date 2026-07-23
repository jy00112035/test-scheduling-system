package com.testscheduling.service;

import com.testscheduling.dto.StaffRequest;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.entity.User;
import com.testscheduling.repository.AuditLogRepository;
import com.testscheduling.repository.TestModuleConfigRepository;
import com.testscheduling.repository.TestStaffModuleRepository;
import com.testscheduling.repository.TestStaffRepository;
import com.testscheduling.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
class StaffDuplicateAccountTransactionIntegrationTest {

    private static final String DATABASE_URL = "jdbc:h2:mem:staff-duplicates-" + UUID.randomUUID()
        + ";MODE=MySQL;DB_CLOSE_DELAY=-1";

    @DynamicPropertySource
    static void useUniqueDatabase(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> DATABASE_URL);
    }

    @Autowired
    private TestStaffService testStaffService;

    @Autowired
    private TestStaffRepository staffRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TestStaffModuleRepository staffModuleRepository;

    @Autowired
    private TestModuleConfigRepository moduleRepository;

    @Autowired
    private AuditLogRepository auditLogRepository;

    @Test
    void duplicateCreateLeavesStaffUsersRelationsAndAuditUnchanged() {
        TestModuleConfig module = moduleRepository.saveAndFlush(module("重复创建模块"));
        userRepository.saveAndFlush(user("DUP-CREATE"));
        long staffCount = staffRepository.count();
        long userCount = userRepository.count();
        long relationCount = staffModuleRepository.count();
        long auditCount = auditLogRepository.count();
        StaffRequest request = request("DUP-CREATE", List.of(module.getId()));

        assertThrows(RuntimeException.class, () -> testStaffService.create(request, "admin"));

        assertEquals(staffCount, staffRepository.count());
        assertEquals(userCount, userRepository.count());
        assertEquals(relationCount, staffModuleRepository.count());
        assertEquals(auditCount, auditLogRepository.count());
        assertFalse(staffRepository.findByEmpNo("DUP-CREATE").isPresent());
    }

    @Test
    void duplicateUpdateLeavesStaffUsersRelationsAndAuditUnchanged() {
        TestModuleConfig module = moduleRepository.saveAndFlush(module("重复更新模块"));
        TestStaff source = testStaffService.create(
            request("DUP-SOURCE", List.of(module.getId())), "admin").getStaff();
        User target = userRepository.saveAndFlush(user("DUP-TARGET"));
        long staffCount = staffRepository.count();
        long userCount = userRepository.count();
        long relationCount = staffModuleRepository.count();
        long auditCount = auditLogRepository.count();

        assertThrows(RuntimeException.class, () -> testStaffService.update(
            source.getId(), request("DUP-TARGET", List.of()), "admin"));

        TestStaff unchanged = staffRepository.findById(source.getId()).orElseThrow();
        assertEquals("DUP-SOURCE", unchanged.getEmpNo());
        assertTrue(userRepository.findByUsername("DUP-SOURCE").isPresent());
        assertEquals(target.getId(),
            userRepository.findByUsername("DUP-TARGET").orElseThrow().getId());
        assertEquals(staffCount, staffRepository.count());
        assertEquals(userCount, userRepository.count());
        assertEquals(relationCount, staffModuleRepository.count());
        assertEquals(auditCount, auditLogRepository.count());
        assertEquals(List.of(module.getId()),
            staffModuleRepository.findModuleIdsByStaffId(source.getId()));
    }

    private StaffRequest request(String empNo, List<Long> moduleIds) {
        StaffRequest request = new StaffRequest();
        request.setName(empNo);
        request.setEmpNo(empNo);
        request.setFamiliarModuleIds(moduleIds);
        return request;
    }

    private User user(String username) {
        User user = new User();
        user.setUsername(username);
        user.setPassword("encoded");
        user.setRoles(List.of("testExecutor"));
        user.setDisplayName(username);
        user.setEnabled(true);
        return user;
    }

    private TestModuleConfig module(String name) {
        TestModuleConfig module = new TestModuleConfig();
        module.setModuleName(name);
        module.setTestType("功能测试");
        module.setEnabled(true);
        module.setSortOrder(10);
        return module;
    }
}
