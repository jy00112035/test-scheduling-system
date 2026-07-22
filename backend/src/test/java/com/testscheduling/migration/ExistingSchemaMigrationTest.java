package com.testscheduling.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

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

            assertEquals(2, migrationsExecuted);
            assertEquals(4, jdbc.queryForObject(
                "select count(*) from \"flyway_schema_history\" where \"success\" = true",
                Integer.class));
            assertEquals(1, jdbc.queryForObject(
                "select count(*) from \"flyway_schema_history\" "
                    + "where \"version\" is null and \"type\" = 'TABLE'",
                Integer.class));
            assertEquals(List.of("1:BASELINE", "2:SQL", "3:SQL"), jdbc.query(
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
}
