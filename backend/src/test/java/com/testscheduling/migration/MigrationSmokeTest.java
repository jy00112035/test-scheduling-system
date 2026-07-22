package com.testscheduling.migration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

@SpringBootTest
class MigrationSmokeTest {
    private static final String DATABASE_URL = "jdbc:h2:mem:fresh-" + UUID.randomUUID()
        + ";MODE=MySQL;DB_CLOSE_DELAY=-1";

    @DynamicPropertySource
    static void useUniqueDatabase(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> DATABASE_URL);
    }

    @Autowired JdbcTemplate jdbc;

    @Test
    void createsCompleteSpecialModuleSchema() {
        assertAll(
            () -> assertTableExists("TEST_MODULE_CONFIG"),
            () -> assertTableExists("DEMAND_SPECIAL_MODULE"),
            () -> assertTableExists("TEST_STAFF_MODULE"),
            () -> assertTableExists("AUDIT_LOG"),
            () -> assertColumnExists("SCHEDULE", "DEMAND_MANPOWER_DETAIL_ID"),
            () -> assertColumnExists("SCHEDULE", "DEMAND_SPECIAL_MODULE_ID"),
            () -> assertColumnExists("SCHEDULE", "LOCK_VERSION"),
            () -> assertColumnExists("TEST_DEMAND", "LOCK_VERSION"),
            () -> assertColumnExists("TEST_STAFF", "LOCK_VERSION"),
            () -> assertColumnExists("TEST_MODULE_CONFIG", "LOCK_VERSION")
        );

        assertEquals(List.of("1", "2", "3"), jdbc.queryForList(
            "select \"version\" from \"flyway_schema_history\" "
                + "where \"success\" = true and \"type\" = 'SQL' order by \"installed_rank\"",
            String.class));
        assertEquals(0, jdbc.queryForObject(
            "select count(*) from \"flyway_schema_history\" where \"type\" = 'BASELINE'",
            Integer.class));
    }

    @Test
    void createsScheduleIndexesForEligibilityQueries() {
        assertAll(
            () -> assertIndexExists("IDX_SCHEDULE_DEMAND_ID"),
            () -> assertIndexExists("IDX_SCHEDULE_STAFF_DATE"),
            () -> assertIndexExists("IDX_SCHEDULE_SPECIAL_MODULE_ID"),
            () -> assertIndexExists("IDX_SCHEDULE_MANPOWER_DETAIL_ID")
        );
    }

    @Test
    void enforcesRepresentativeV2Constraints() {
        String moduleName = "module-" + UUID.randomUUID();
        jdbc.update(
            "insert into test_module_config (module_name, test_type, created_at, updated_at) "
                + "values (?, 'functional', current_timestamp, current_timestamp)",
            moduleName);
        Long moduleId = jdbc.queryForObject(
            "select id from test_module_config where module_name = ?", Long.class, moduleName);

        String product = "product-" + UUID.randomUUID();
        jdbc.update(
            "insert into test_demand (product, version_type) values (?, 'release')", product);
        Long demandId = jdbc.queryForObject(
            "select id from test_demand where product = ?", Long.class, product);

        assertAll(
            () -> assertThrows(DataIntegrityViolationException.class, () -> jdbc.update(
                "insert into test_module_config (module_name, test_type, created_at, updated_at) "
                    + "values (?, 'performance', current_timestamp, current_timestamp)",
                moduleName)),
            () -> assertThrows(DataIntegrityViolationException.class, () -> jdbc.update(
                "insert into demand_special_module "
                    + "(demand_id, module_id, manpower_demand, created_at, updated_at) "
                    + "values (?, ?, 0, current_timestamp, current_timestamp)",
                demandId, moduleId)),
            () -> assertThrows(DataIntegrityViolationException.class, () -> jdbc.update(
                "insert into demand_special_module "
                    + "(demand_id, module_id, manpower_demand, created_at, updated_at) "
                    + "values (-1, ?, 1, current_timestamp, current_timestamp)",
                moduleId)),
            () -> assertThrows(DataIntegrityViolationException.class, () -> jdbc.update(
                "insert into schedule (demand_manpower_detail_id) values (-1)")),
            () -> assertThrows(DataIntegrityViolationException.class, () -> jdbc.update(
                "insert into schedule (demand_special_module_id) values (-1)"))
        );
    }

    private void assertTableExists(String tableName) {
        assertEquals(1, jdbc.queryForObject(
            "select count(*) from information_schema.tables where table_name = ?",
            Integer.class, tableName));
    }

    private void assertColumnExists(String tableName, String columnName) {
        assertEquals(1, jdbc.queryForObject(
            "select count(*) from information_schema.columns where table_name = ? and column_name = ?",
            Integer.class, tableName, columnName));
    }

    private void assertIndexExists(String indexName) {
        assertEquals(1, jdbc.queryForObject(
            "select count(*) from information_schema.indexes where index_name = ?",
            Integer.class, indexName));
    }
}
