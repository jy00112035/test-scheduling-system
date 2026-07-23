package com.testscheduling.controller;

import com.testscheduling.util.JwtUtil;
import com.testscheduling.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class SecurityAuthorizationHttpIntegrationTest {

    private static final String DATABASE_URL = "jdbc:h2:mem:security-http-" + UUID.randomUUID()
        + ";MODE=MySQL;DB_CLOSE_DELAY=-1";

    @DynamicPropertySource
    static void useUniqueDatabase(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> DATABASE_URL);
    }

    @Autowired MockMvc mockMvc;
    @Autowired JwtUtil jwtUtil;
    @Autowired UserRepository userRepository;

    @Test
    void registrationRemainsPublicButResourceWritesRequireAuthentication() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"username":"admin","password":"admin123"}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.token").isNotEmpty());

        mockMvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "username":"public-register-user",
                      "password":"password123",
                      "confirmPassword":"password123",
                      "displayName":"Public Register",
                      "role":"testExecutor"
                    }
                    """))
            .andExpect(status().isOk());

        mockMvc.perform(post("/api/staff")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.code").value(401))
            .andExpect(jsonPath("$.data.errorCode").value("UNAUTHENTICATED"));

        mockMvc.perform(post("/api/demands")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.data.errorCode").value("UNAUTHENTICATED"));
    }

    @Test
    void ordinaryExecutorCannotMutateStaffOrDemand() throws Exception {
        String executor = bearer("ordinary-executor", "testExecutor");

        mockMvc.perform(post("/api/staff")
                .header("Authorization", executor)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.data.errorCode").value("FORBIDDEN"));

        mockMvc.perform(post("/api/demands")
                .header("Authorization", executor)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.data.errorCode").value("FORBIDDEN"));
    }

    @Test
    void establishedManagerRolesCanCreateStaffAndDemand() throws Exception {
        mockMvc.perform(post("/api/staff")
                .header("Authorization", bearer("resource-manager", "resourceManager"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "name":"Authorized Staff",
                      "empNo":"AUTH-STAFF-1",
                      "groupName":"功能测试组",
                      "testType":"功能测试",
                      "status":"active"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(200));

        mockMvc.perform(post("/api/demands")
                .header("Authorization", bearer("test-manager", "testManager"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "product":"Authorized Demand",
                      "versionType":"release",
                      "manpowerDetails":[
                        {"testType":"功能测试","manpowerDemand":1.0}
                      ],
                      "specialModuleDemands":[]
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void executorCannotApproveRegistrationButAdminCan() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "username":"pending-field-admin",
                      "password":"password123",
                      "confirmPassword":"password123",
                      "displayName":"Pending Field Admin",
                      "role":"fieldAdmin"
                    }
                    """))
            .andExpect(status().isOk());
        Long id = userRepository.findByUsername("pending-field-admin").orElseThrow().getId();

        mockMvc.perform(put("/api/auth/approve/{id}", id)
                .header("Authorization", bearer("executor", "testExecutor")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.data.errorCode").value("FORBIDDEN"));

        mockMvc.perform(put("/api/auth/approve/{id}", id)
                .header("Authorization", bearer("admin", "admin")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void lowerApproverCannotApproveMixedRoleRegistrationWithElevatedRole() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "username":"mixed-role-registration",
                      "password":"password123",
                      "confirmPassword":"password123",
                      "displayName":"Mixed Role",
                      "roles":["testExecutor","fieldAdmin"]
                    }
                    """))
            .andExpect(status().isOk());
        Long id = userRepository.findByUsername("mixed-role-registration").orElseThrow().getId();

        mockMvc.perform(put("/api/auth/approve/{id}", id)
                .header("Authorization", bearer("resource-manager", "resourceManager")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.data.errorCode").value("APPROVAL_SCOPE_FORBIDDEN"));
    }

    private String bearer(String username, String role) {
        return "Bearer " + jwtUtil.generateToken(username, List.of(role));
    }
}
