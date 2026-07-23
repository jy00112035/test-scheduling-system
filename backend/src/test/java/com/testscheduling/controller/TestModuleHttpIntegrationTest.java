package com.testscheduling.controller;

import com.testscheduling.dto.TestModuleRequest;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.entity.User;
import com.testscheduling.repository.UserRepository;
import com.testscheduling.service.TestModuleService;
import com.testscheduling.util.JwtUtil;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class TestModuleHttpIntegrationTest {

    private static final String DATABASE_URL = "jdbc:h2:mem:module-http-" + UUID.randomUUID()
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
    private TestModuleService moduleService;

    @Autowired
    private UserRepository userRepository;

    @Test
    void returnsHttp400WithStableErrorDataForBusinessValidation() throws Exception {
        mockMvc.perform(post("/api/test-modules")
                .header("Authorization", bearer("field-admin", "fieldAdmin"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"moduleName":"%s","testType":"功能测试","sortOrder":10}
                    """.formatted("名".repeat(101))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value(400))
            .andExpect(jsonPath("$.data.errorCode").value("MODULE_NAME_TOO_LONG"));
    }

    @Test
    void rejectsModuleWriteFromOrdinaryAuthenticatedUser() throws Exception {
        mockMvc.perform(post("/api/test-modules")
                .header("Authorization", bearer("tester", "testExecutor"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"moduleName":"支付模块","testType":"功能测试","sortOrder":10}
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.data.errorCode").value("FORBIDDEN"));
    }

    @Test
    void ordinaryPutCannotEnableDisabledModule() throws Exception {
        TestModuleConfig module = moduleService.create(
            new TestModuleRequest("支付模块", "功能测试", 10));
        moduleService.setEnabled(module.getId(), false);

        mockMvc.perform(put("/api/test-modules/{id}", module.getId())
                .header("Authorization", bearer("field-admin", "fieldAdmin"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "moduleName":"支付模块",
                      "testType":"功能测试",
                      "sortOrder":20,
                      "enabled":true
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.enabled").value(false))
            .andExpect(jsonPath("$.data.sortOrder").value(20));
    }

    private String bearer(String username, String role) {
        User user = userRepository.findByUsername(username).orElseGet(User::new);
        user.setUsername(username);
        if (user.getPassword() == null) user.setPassword("unused-test-password");
        user.setRoles(List.of(role));
        user.setEnabled(true);
        userRepository.saveAndFlush(user);
        return "Bearer " + jwtUtil.generateToken(username, List.of(role));
    }
}
