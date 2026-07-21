package com.testscheduling.controller;

import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.repository.TestModuleConfigRepository;
import com.testscheduling.util.JwtUtil;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class TestStaffModuleHttpIntegrationTest {

    private static final String DATABASE_URL = "jdbc:h2:mem:staff-module-http-" + UUID.randomUUID()
        + ";MODE=MySQL;DB_CLOSE_DELAY=-1";

    @DynamicPropertySource
    static void useUniqueDatabase(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> DATABASE_URL);
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private TestModuleConfigRepository moduleRepository;

    @Test
    void staffResponseUsesStructuredModulesAndSeparateLegacyProperty() throws Exception {
        TestModuleConfig module = new TestModuleConfig();
        module.setModuleName("HTTP支付模块");
        module.setTestType("功能测试");
        module.setEnabled(true);
        module.setSortOrder(10);
        module = moduleRepository.saveAndFlush(module);

        mockMvc.perform(post("/api/staff")
                .header("Authorization", bearer("field-admin", "fieldAdmin"))
                .contentType("application/json")
                .content("""
                    {
                      "name":"HTTP人员",
                      "empNo":"HTTP-T1001",
                      "groupName":"自动化测试组",
                      "testType":"自动化测试",
                      "familiarModuleIds":[%d],
                      "familiarModules":"HTTP支付模块"
                    }
                    """.formatted(module.getId())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.staff.familiarModules").isArray())
            .andExpect(jsonPath("$.data.staff.familiarModules[0].id").value(module.getId()))
            .andExpect(jsonPath("$.data.staff.familiarModules[0].moduleName")
                .value("HTTP支付模块"))
            .andExpect(jsonPath("$.data.staff.legacyFamiliarModules")
                .value("HTTP支付模块"));
    }

    @Test
    void fieldAdminCanRunMigrationAndReceivesStructuredReport() throws Exception {
        mockMvc.perform(post("/api/staff/modules/migrate-legacy")
                .header("Authorization", bearer("field-admin", "fieldAdmin")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(200))
            .andExpect(jsonPath("$.message").value("迁移完成"))
            .andExpect(jsonPath("$.data.createdRelations").value(0))
            .andExpect(jsonPath("$.data.duplicateNames").isMap())
            .andExpect(jsonPath("$.data.unmatched").isMap())
            .andExpect(jsonPath("$.data.missingStaffAccounts").isArray());
    }

    @Test
    void ordinaryUserGetsStableForbiddenErrorShape() throws Exception {
        mockMvc.perform(post("/api/staff/modules/migrate-legacy")
                .header("Authorization", bearer("tester", "testExecutor")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value(400))
            .andExpect(jsonPath("$.message").value("无权限执行此操作"))
            .andExpect(jsonPath("$.data.errorCode").value("FORBIDDEN"));
    }

    private String bearer(String username, String role) {
        return "Bearer " + jwtUtil.generateToken(username, List.of(role));
    }
}
