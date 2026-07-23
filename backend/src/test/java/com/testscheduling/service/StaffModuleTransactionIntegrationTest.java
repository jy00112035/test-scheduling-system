package com.testscheduling.service;

import com.testscheduling.dto.StaffRequest;
import com.testscheduling.entity.AuditLog;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.repository.AuditLogRepository;
import com.testscheduling.repository.TestModuleConfigRepository;
import com.testscheduling.repository.TestStaffModuleRepository;
import com.testscheduling.repository.TestStaffRepository;
import com.testscheduling.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@SpringBootTest
class StaffModuleTransactionIntegrationTest {

    private static final String DATABASE_URL = "jdbc:h2:mem:staff-module-rollback-" + UUID.randomUUID()
        + ";MODE=MySQL;DB_CLOSE_DELAY=-1";

    @DynamicPropertySource
    static void useUniqueDatabase(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> DATABASE_URL);
    }

    @Autowired
    private TestStaffService testStaffService;

    @Autowired
    private TestModuleConfigRepository moduleRepository;

    @Autowired
    private TestStaffRepository staffRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TestStaffModuleRepository staffModuleRepository;

    @MockBean
    private AuditLogRepository auditLogRepository;

    @Test
    void failedRelationAuditRollsBackStaffUserAndRelation() {
        TestModuleConfig module = new TestModuleConfig();
        module.setModuleName("回滚模块");
        module.setTestType("功能测试");
        module.setEnabled(true);
        module.setSortOrder(10);
        module = moduleRepository.saveAndFlush(module);
        when(auditLogRepository.save(any(AuditLog.class)))
            .thenThrow(new IllegalStateException("audit storage unavailable"));

        StaffRequest request = new StaffRequest();
        request.setName("回滚人员");
        request.setEmpNo("能力-ROLLBACK");
        request.setFamiliarModuleIds(List.of(module.getId()));

        assertThrows(IllegalStateException.class, () -> testStaffService.create(request, "admin"));

        assertFalse(staffRepository.findByEmpNo("能力-ROLLBACK").isPresent());
        assertFalse(userRepository.findByUsername("能力-ROLLBACK").isPresent());
        assertEquals(0, staffModuleRepository.count());
    }
}
