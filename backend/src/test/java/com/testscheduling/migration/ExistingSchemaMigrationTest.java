package com.testscheduling.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ExistingSchemaMigrationTest {
    @Test
    void baselinesLegacySchemaAppliesV2AndPreservesData() throws Exception {
        String databaseUrl = "jdbc:h2:mem:legacy-" + UUID.randomUUID() + ";MODE=MySQL";

        try (Connection keeper = DriverManager.getConnection(databaseUrl, "sa", "")) {
            ScriptUtils.executeSqlScript(
                keeper, new ClassPathResource("db/migration/V1__baseline_schema.sql"));
            try (Statement statement = keeper.createStatement()) {
                statement.executeUpdate(
                    "insert into users (username, password, display_name) "
                        + "values ('legacy-sentinel', 'hash', 'Legacy User')");
            }

            JdbcTemplate jdbc = new JdbcTemplate(new DriverManagerDataSource(databaseUrl, "sa", ""));
            assertEquals(0, jdbc.queryForObject(
                "select count(*) from information_schema.tables "
                    + "where lower(table_name) = 'flyway_schema_history'",
                Integer.class));

            int migrationsExecuted = Flyway.configure()
                .dataSource(databaseUrl, "sa", "")
                .locations("classpath:db/migration")
                .baselineOnMigrate(true)
                .baselineVersion("1")
                .load()
                .migrate()
                .migrationsExecuted;

            assertEquals(3, migrationsExecuted);
            assertEquals(5, jdbc.queryForObject(
                "select count(*) from \"flyway_schema_history\" where \"success\" = true",
                Integer.class));
            assertEquals(1, jdbc.queryForObject(
                "select count(*) from \"flyway_schema_history\" "
                    + "where \"version\" is null and \"type\" = 'TABLE'",
                Integer.class));
            assertEquals(List.of("1:BASELINE", "2:SQL", "3:SQL", "4:SQL"), jdbc.query(
                "select \"version\", \"type\" from \"flyway_schema_history\" "
                    + "where \"success\" = true and \"version\" is not null "
                    + "order by \"installed_rank\"",
                (resultSet, rowNumber) -> resultSet.getString("version")
                    + ":" + resultSet.getString("type")));
            assertEquals(0, jdbc.queryForObject(
                "select count(*) from \"flyway_schema_history\" "
                    + "where \"script\" = 'V1__baseline_schema.sql'",
                Integer.class));
            assertEquals(4, jdbc.queryForObject(
                "select count(*) from information_schema.tables where table_name in "
                    + "('TEST_MODULE_CONFIG', 'DEMAND_SPECIAL_MODULE', 'TEST_STAFF_MODULE', 'AUDIT_LOG')",
                Integer.class));
            assertEquals(1, jdbc.queryForObject(
                "select count(*) from users where username = 'legacy-sentinel' "
                    + "and display_name = 'Legacy User'",
                Integer.class));
            assertEquals(1, jdbc.queryForObject(
                "select count(*) from information_schema.indexes "
                    + "where index_name = 'IDX_SCHEDULE_STAFF_DATE'", Integer.class));
        }
    }

    @Test
    void v4MergesDuplicateFieldOptionsIntoStableSurvivorAndAddsUniqueness() {
        String databaseUrl = "jdbc:h2:mem:field-config-v4-" + UUID.randomUUID()
            + ";MODE=MySQL;DB_CLOSE_DELAY=-1";
        Flyway.configure()
            .dataSource(databaseUrl, "sa", "")
            .locations("classpath:db/migration")
            .target("3")
            .load()
            .migrate();

        JdbcTemplate jdbc = new JdbcTemplate(new DriverManagerDataSource(databaseUrl, "sa", ""));
        jdbc.update("insert into field_config "
            + "(field_name, field_type, options, description, required, sort_order) "
            + "values ('testType', 'select', '功能测试, 自动化测试', 'stable survivor', true, 1)");
        Long survivorId = jdbc.queryForObject(
            "select min(id) from field_config where field_name = 'testType'", Long.class);
        jdbc.update("insert into field_config "
            + "(field_name, field_type, options, description, required, sort_order) "
            + "values ('testType', 'select', '自动化测试,性能测试', 'duplicate two', false, 2)");
        jdbc.update("insert into field_config "
            + "(field_name, field_type, options, description, required, sort_order) "
            + "values ('testType', 'select', ' 安全测试 ,功能测试', 'duplicate three', false, 3)");

        int migrationsExecuted = Flyway.configure()
            .dataSource(databaseUrl, "sa", "")
            .locations("classpath:db/migration")
            .load()
            .migrate()
            .migrationsExecuted;

        assertEquals(1, migrationsExecuted);
        assertEquals(1, jdbc.queryForObject(
            "select count(*) from field_config where field_name = 'testType'", Integer.class));
        assertEquals(survivorId, jdbc.queryForObject(
            "select id from field_config where field_name = 'testType'", Long.class));
        assertEquals("功能测试,自动化测试,性能测试,安全测试", jdbc.queryForObject(
            "select options from field_config where field_name = 'testType'", String.class));
        assertEquals("stable survivor", jdbc.queryForObject(
            "select description from field_config where field_name = 'testType'", String.class));
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.update(
            "insert into field_config (field_name, field_type) values ('testType', 'select')"));
    }
}
