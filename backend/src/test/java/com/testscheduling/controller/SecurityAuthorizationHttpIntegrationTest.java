package com.testscheduling.controller;

import com.testscheduling.util.JwtUtil;
import com.testscheduling.entity.FieldConfig;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.entity.User;
import com.testscheduling.repository.FieldConfigRepository;
import com.testscheduling.repository.TestStaffRepository;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
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
    @Autowired TestStaffRepository staffRepository;
    @Autowired FieldConfigRepository fieldConfigRepository;

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

    @Test
    void registrationTestTypesArePublicButGenericFieldConfigRemainsProtected() throws Exception {
        mockMvc.perform(get("/api/auth/registration-options/test-types"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data").isArray())
            .andExpect(jsonPath("$.data[0]").isNotEmpty());

        mockMvc.perform(get("/api/field-configs"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.data.errorCode").value("UNAUTHENTICATED"));
    }

    @Test
    void databaseRolesOverrideElevatedRolesClaimedInAnOtherwiseValidToken() throws Exception {
        saveUser("db-executor", List.of("testExecutor"), null);

        mockMvc.perform(post("/api/field-configs")
                .header("Authorization", token("db-executor", List.of("fieldAdmin")))
                .contentType(MediaType.APPLICATION_JSON)
                .content(fieldConfigJson("forged-role-field")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.data.errorCode").value("FORBIDDEN"));
    }

    @Test
    void staffRoleAssignmentMatrixRejectsEveryEscalationAndKeepsSafeCreates() throws Exception {
        assertStaffCreateForbidden("matrix-resource", "resourceManager", "resourceManager",
            "STAFF_ROLE_ASSIGNMENT_FORBIDDEN");
        assertStaffCreateForbidden("matrix-field", "fieldAdmin", "fieldAdmin",
            "STAFF_ROLE_ASSIGNMENT_FORBIDDEN");
        assertStaffCreateForbidden("matrix-project", "projectManager", "projectManager",
            "STAFF_ROLE_ASSIGNMENT_FORBIDDEN");
        assertStaffCreateForbidden("matrix-lead", "testLead", "testExecutor",
            "TEST_LEAD_CREATE_FORBIDDEN");
        assertStaffCreateForbidden("matrix-admin", "admin", "admin",
            "STAFF_ADMIN_ROLE_FORBIDDEN");

        mockMvc.perform(post("/api/staff")
                .header("Authorization", bearer("matrix-safe-resource", "resourceManager"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(staffJson("MATRIX-SAFE-EXECUTOR", "功能测试", List.of("testExecutor"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.staff.roles[0]").value("testExecutor"));

        mockMvc.perform(post("/api/staff")
                .header("Authorization", bearer("matrix-safe-project", "projectManager"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(staffJson("MATRIX-SAFE-LEAD", "功能测试", List.of("testLead"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.staff.roles[0]").value("testLead"));
    }

    @Test
    void staffUpdateCannotSmuggleAdminAndOmittedRolesRemainUnchanged() throws Exception {
        mockMvc.perform(post("/api/staff")
                .header("Authorization", bearer("matrix-update-admin", "admin"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(staffJson("MATRIX-UPDATE-TARGET", "功能测试", List.of("testExecutor"))))
            .andExpect(status().isOk());
        TestStaff target = staffRepository.findAll().stream()
            .filter(staff -> "MATRIX-UPDATE-TARGET".equals(staff.getEmpNo()))
            .findFirst().orElseThrow();

        mockMvc.perform(put("/api/staff/{id}", target.getId())
                .header("Authorization", bearer("matrix-update-resource", "resourceManager"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(staffJson("MATRIX-UPDATE-TARGET", "功能测试", List.of("admin"))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.data.errorCode").value("STAFF_ADMIN_ROLE_FORBIDDEN"));

        mockMvc.perform(put("/api/staff/{id}", target.getId())
                .header("Authorization", bearer("matrix-update-resource", "resourceManager"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(staffJson("MATRIX-UPDATE-TARGET", "功能测试", null)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.roles[0]").value("testExecutor"));

        mockMvc.perform(put("/api/staff/{id}", target.getId())
                .header("Authorization", bearer("matrix-update-lead", "testLead", "功能测试"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(staffJson("MATRIX-UPDATE-TARGET", "功能测试", List.of("testManager"))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.data.errorCode").value("STAFF_ROLE_CHANGE_FORBIDDEN"));
    }

    @Test
    void dailyStatusRequiresAuthenticatedAuthorizedActorAndMatchingLeadTestType() throws Exception {
        TestStaff target = new TestStaff();
        target.setName("Daily Target");
        target.setEmpNo("DAILY-TARGET");
        target.setTestType("功能测试");
        target = staffRepository.saveAndFlush(target);
        String body = """
            {"staffId":%d,"date":"2026-07-24","status":"ON_LEAVE","percentage":100}
            """.formatted(target.getId());

        mockMvc.perform(put("/api/daily-statuses")
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isUnauthorized());
        mockMvc.perform(put("/api/daily-statuses")
                .header("Authorization", bearer("daily-executor", "testExecutor"))
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.data.errorCode").value("FORBIDDEN"));
        mockMvc.perform(put("/api/daily-statuses")
                .header("Authorization", bearer("daily-cross-lead", "testLead", "性能测试"))
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.data.errorCode").value("DAILY_STATUS_SCOPE_FORBIDDEN"));
        mockMvc.perform(put("/api/daily-statuses")
                .header("Authorization", bearer("daily-matching-lead", "testLead", "功能测试"))
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk());
        mockMvc.perform(put("/api/daily-statuses")
                .header("Authorization", bearer("daily-field-admin", "fieldAdmin"))
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk());
        mockMvc.perform(put("/api/daily-statuses")
                .header("Authorization", bearer("daily-admin", "admin"))
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk());
    }

    @Test
    void fieldConfigMutationsRequireFieldAdminAndAllowFieldAdmin() throws Exception {
        for (String role : List.of("testExecutor", "resourceManager")) {
            mockMvc.perform(post("/api/field-configs")
                    .header("Authorization", bearer("field-denied-" + role, role))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(fieldConfigJson("denied-" + role)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.data.errorCode").value("FORBIDDEN"));
        }

        mockMvc.perform(post("/api/field-configs")
                .header("Authorization", bearer("field-allowed", "fieldAdmin"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(fieldConfigJson("allowed-field")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.fieldName").value("allowed-field"));
        FieldConfig config = fieldConfigRepository.findByFieldName("allowed-field").orElseThrow();

        mockMvc.perform(put("/api/field-configs/{id}", config.getId())
                .header("Authorization", bearer("field-update-denied", "resourceManager"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(fieldConfigJson("forbidden-update")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.data.errorCode").value("FORBIDDEN"));
        mockMvc.perform(delete("/api/field-configs/{id}", config.getId())
                .header("Authorization", bearer("field-delete-denied", "testExecutor")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.data.errorCode").value("FORBIDDEN"));

        mockMvc.perform(put("/api/field-configs/{id}", config.getId())
                .header("Authorization", bearer("field-allowed", "fieldAdmin"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(fieldConfigJson("allowed-field-updated")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.fieldName").value("allowed-field-updated"));
        mockMvc.perform(delete("/api/field-configs/{id}", config.getId())
                .header("Authorization", bearer("field-allowed", "fieldAdmin")))
            .andExpect(status().isOk());
    }

    private void assertStaffCreateForbidden(
            String actor, String actorRole, String assignedRole, String errorCode) throws Exception {
        mockMvc.perform(post("/api/staff")
                .header("Authorization", bearer(actor, actorRole, "功能测试"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(staffJson("STAFF-" + actor, "功能测试", List.of(assignedRole))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.data.errorCode").value(errorCode));
    }

    private String staffJson(String empNo, String testType, List<String> roles) {
        String rolesJson = roles == null ? "" : ",\"roles\":[\"" + String.join("\",\"", roles) + "\"]";
        return """
            {"name":"Matrix Staff","empNo":"%s","groupName":"%s组","testType":"%s","status":"active"%s}
            """.formatted(empNo, testType, testType, rolesJson);
    }

    private String fieldConfigJson(String fieldName) {
        return """
            {"fieldName":"%s","fieldType":"select","options":"A,B","required":false,"sortOrder":99}
            """.formatted(fieldName);
    }

    private String bearer(String username, String role) {
        return bearer(username, role, null);
    }

    private String bearer(String username, String role, String testType) {
        saveUser(username, List.of(role), testType);
        return token(username, List.of(role));
    }

    private String token(String username, List<String> roles) {
        return "Bearer " + jwtUtil.generateToken(username, roles);
    }

    private void saveUser(String username, List<String> roles, String testType) {
        User user = userRepository.findByUsername(username).orElseGet(User::new);
        user.setUsername(username);
        if (user.getPassword() == null) {
            user.setPassword("unused-test-password");
        }
        user.setRoles(roles);
        user.setDisplayName(username);
        user.setTestType(testType);
        user.setEnabled(true);
        userRepository.saveAndFlush(user);
    }
}
