package com.testscheduling.repository;

import com.testscheduling.dto.TestModuleRequest;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.service.TestModuleService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@Transactional
class TestModulePersistenceIntegrationTest {

    private static final String DATABASE_URL = "jdbc:h2:mem:module-persistence-" + UUID.randomUUID()
        + ";MODE=MySQL;DB_CLOSE_DELAY=-1";

    @DynamicPropertySource
    static void useUniqueDatabase(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> DATABASE_URL);
    }

    @Autowired
    private TestModuleConfigRepository moduleRepository;

    @Autowired
    private TestModuleService moduleService;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void h2ReportsNamedModuleNameUniqueConstraint() {
        moduleRepository.saveAndFlush(entity("支付模块", 10));

        DataIntegrityViolationException error = assertThrows(
            DataIntegrityViolationException.class,
            () -> moduleRepository.saveAndFlush(entity("支付模块", 20)));

        assertTrue(causeContains(error, "uk_test_module_name"));
    }

    @Test
    void serviceReturnsStableDuplicateCodeAgainstRealRepository() {
        moduleService.create(request("支付模块", 10));

        BusinessException error = assertThrows(BusinessException.class,
            () -> moduleService.create(request("支付模块", 20)));

        assertEquals("MODULE_NAME_DUPLICATE", error.getErrorCode());
    }

    @Test
    void h2ReportsNamedModuleForeignKeyOnFlushedDelete() {
        TestModuleConfig module = moduleRepository.saveAndFlush(entity("支付模块", 10));
        Long demandId = insertDemand();
        jdbc.update(
            "insert into demand_special_module "
                + "(demand_id, module_id, manpower_demand, created_at, updated_at) "
                + "values (?, ?, 1, current_timestamp, current_timestamp)",
            demandId, module.getId());

        moduleRepository.delete(module);
        DataIntegrityViolationException error = assertThrows(
            DataIntegrityViolationException.class, moduleRepository::flush);

        assertTrue(causeContains(error, "fk_dsm_module"));
    }

    @Test
    void serviceReturnsStableReferencedDeleteCodeAgainstRealRepository() {
        TestModuleConfig module = moduleService.create(request("支付模块", 10));
        Long demandId = insertDemand();
        jdbc.update(
            "insert into demand_special_module "
                + "(demand_id, module_id, manpower_demand, created_at, updated_at) "
                + "values (?, ?, 1, current_timestamp, current_timestamp)",
            demandId, module.getId());

        BusinessException error = assertThrows(BusinessException.class,
            () -> moduleService.delete(module.getId()));

        assertEquals("MODULE_REFERENCED_DELETE_FORBIDDEN", error.getErrorCode());
        assertTrue(moduleRepository.existsById(module.getId()));
    }

    @Test
    void batchReferenceQueryMarksDemandAndStaffReferences() {
        TestModuleConfig demandModule = moduleService.create(request("支付模块", 10));
        TestModuleConfig staffModule = moduleService.create(request("登录模块", 20));
        TestModuleConfig unusedModule = moduleService.create(request("搜索模块", 30));
        Long demandId = insertDemand();
        jdbc.update(
            "insert into demand_special_module "
                + "(demand_id, module_id, manpower_demand, created_at, updated_at) "
                + "values (?, ?, 1, current_timestamp, current_timestamp)",
            demandId, demandModule.getId());
        jdbc.update(
            "insert into test_staff (name, emp_no) values ('测试员', ?)",
            "EMP-" + UUID.randomUUID());
        Long staffId = jdbc.queryForObject(
            "select max(id) from test_staff", Long.class);
        jdbc.update(
            "insert into test_staff_module (staff_id, module_id, created_at) "
                + "values (?, ?, current_timestamp)",
            staffId, staffModule.getId());

        List<Long> referencedIds = moduleRepository.findReferencedModuleIds(
            List.of(demandModule.getId(), staffModule.getId(), unusedModule.getId()));
        Map<Long, TestModuleConfig> listed = moduleService.list(null, null).stream()
            .collect(Collectors.toMap(TestModuleConfig::getId, Function.identity()));

        assertEquals(2, referencedIds.size());
        assertTrue(referencedIds.containsAll(List.of(demandModule.getId(), staffModule.getId())));
        assertTrue(listed.get(demandModule.getId()).getReferenced());
        assertTrue(listed.get(staffModule.getId()).getReferenced());
        assertFalse(listed.get(unusedModule.getId()).getReferenced());
    }

    private TestModuleRequest request(String moduleName, int sortOrder) {
        return new TestModuleRequest(moduleName, "功能测试", sortOrder);
    }

    private TestModuleConfig entity(String moduleName, int sortOrder) {
        TestModuleConfig module = new TestModuleConfig();
        module.setModuleName(moduleName);
        module.setTestType("功能测试");
        module.setEnabled(true);
        module.setSortOrder(sortOrder);
        return module;
    }

    private Long insertDemand() {
        String product = "product-" + UUID.randomUUID();
        jdbc.update(
            "insert into test_demand (product, version_type) values (?, 'release')", product);
        return jdbc.queryForObject(
            "select id from test_demand where product = ?", Long.class, product);
    }

    private boolean causeContains(Throwable error, String expected) {
        for (Throwable current = error; current != null; current = current.getCause()) {
            if (current.getMessage() != null
                    && current.getMessage().toLowerCase().contains(expected.toLowerCase())) {
                return true;
            }
        }
        return false;
    }
}
