package com.testscheduling.service;

import com.testscheduling.dto.TestModuleRequest;
import com.testscheduling.entity.AuditLog;
import com.testscheduling.repository.AuditLogRepository;
import com.testscheduling.repository.TestModuleConfigRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@SpringBootTest
class TestModuleTransactionIntegrationTest {

    private static final String DATABASE_URL = "jdbc:h2:mem:module-rollback-" + UUID.randomUUID()
        + ";MODE=MySQL;DB_CLOSE_DELAY=-1";

    @DynamicPropertySource
    static void useUniqueDatabase(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> DATABASE_URL);
    }

    @Autowired
    private TestModuleService moduleService;

    @Autowired
    private TestModuleConfigRepository moduleRepository;

    @MockBean
    private AuditLogRepository auditLogRepository;

    @Test
    void failedAuditWriteRollsBackModuleCreation() {
        when(auditLogRepository.save(any(AuditLog.class)))
            .thenThrow(new IllegalStateException("audit storage unavailable"));

        assertThrows(IllegalStateException.class, () -> moduleService.create(
            new TestModuleRequest("支付模块", "功能测试", 10)));

        assertFalse(moduleRepository.existsByModuleName("支付模块"));
    }
}
