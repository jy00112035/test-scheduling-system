package com.testscheduling.migration;

import com.testscheduling.TestSchedulingApplication;
import jakarta.persistence.EntityManagerFactory;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.mock.web.MockHttpServletRequest;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
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

    @TempDir Path tempDirectory;

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

        assertEquals(List.of("1", "2", "3", "4"), jdbc.queryForList(
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

    @Test
    void upgradesLegacyV1FileAndJpaValidatesMigratedSchema() throws Exception {
        String databaseUrl = fileDatabaseUrl("legacy-v1");
        try (Connection connection = DriverManager.getConnection(databaseUrl, "sa", "")) {
            ScriptUtils.executeSqlScript(
                connection, new ClassPathResource("db/migration/V1__baseline_schema.sql"));
            try (Statement statement = connection.createStatement()) {
                statement.executeUpdate(
                    "insert into users (username, password, display_name) "
                        + "values ('legacy-smoke-user', 'hash', 'Legacy Smoke User')");
                statement.executeUpdate(
                    "insert into test_staff (name, emp_no, group_name, test_type, status) "
                        + "values ('Legacy Staff', 'LEGACY-SMOKE', '功能测试组', '功能测试', 'active')");
                statement.executeUpdate(
                    "insert into test_demand (product, version_type, status) "
                        + "values ('Legacy Demand', '维护', 'pending')");
                statement.executeUpdate(
                    "insert into schedule (demand_id, staff_id, date, percentage, product, published) "
                        + "select d.id, s.id, date '2026-07-27', 50, d.product, false "
                        + "from test_demand d cross join test_staff s "
                        + "where d.product = 'Legacy Demand' and s.emp_no = 'LEGACY-SMOKE'");
            }
        }

        try (ConfigurableApplicationContext context = startApplication(databaseUrl)) {
            JdbcTemplate migrated = context.getBean(JdbcTemplate.class);
            assertAll(
                () -> assertNotNull(context.getBean(EntityManagerFactory.class)),
                () -> assertEquals(List.of("1:BASELINE", "2:SQL", "3:SQL", "4:SQL"),
                    successfulVersionedMigrations(migrated)),
                () -> assertEquals(1, migrated.queryForObject(
                    "select count(*) from users where username = 'legacy-smoke-user'",
                    Integer.class)),
                () -> assertEquals(1, migrated.queryForObject(
                    "select count(*) from schedule s "
                        + "join test_demand d on d.id = s.demand_id "
                        + "join test_staff t on t.id = s.staff_id "
                        + "where d.product = 'Legacy Demand' and t.emp_no = 'LEGACY-SMOKE'",
                    Integer.class)),
                () -> assertEquals(1, migrated.queryForObject(
                    "select count(*) from information_schema.columns "
                        + "where table_name = 'SCHEDULE' and column_name = 'DEMAND_SPECIAL_MODULE_ID'",
                    Integer.class))
            );
        }
    }

    @Test
    void restartsCurrentFileAtV4WithoutRerunningMigrationsAndJpaValidates() {
        String databaseUrl = fileDatabaseUrl("current-v4");
        try (ConfigurableApplicationContext first = startApplication(databaseUrl)) {
            JdbcTemplate current = first.getBean(JdbcTemplate.class);
            current.update(
                "insert into test_demand (product, version_type, status, lock_version) "
                    + "values ('current-file-sentinel', '维护', 'pending', 0)");
            assertEquals(List.of("1:SQL", "2:SQL", "3:SQL", "4:SQL"),
                successfulVersionedMigrations(current));
        }

        try (ConfigurableApplicationContext restarted = startApplication(databaseUrl)) {
            JdbcTemplate current = restarted.getBean(JdbcTemplate.class);
            assertAll(
                () -> assertNotNull(restarted.getBean(EntityManagerFactory.class)),
                () -> assertEquals(List.of("1:SQL", "2:SQL", "3:SQL", "4:SQL"),
                    successfulVersionedMigrations(current)),
                () -> assertEquals(4, current.queryForObject(
                    "select count(*) from \"flyway_schema_history\" "
                        + "where \"success\" = true and \"type\" = 'SQL'",
                    Integer.class)),
                () -> assertEquals(1, current.queryForObject(
                    "select count(*) from test_demand where product = 'current-file-sentinel'",
                    Integer.class))
            );
        }
    }

    private ConfigurableApplicationContext startApplication(String databaseUrl) {
        return new SpringApplicationBuilder(TestSchedulingApplication.class)
            .web(WebApplicationType.NONE)
            .initializers(context -> context.getBeanFactory().registerResolvableDependency(
                HttpServletRequest.class, new MockHttpServletRequest()))
            .run(
                "--spring.datasource.url=" + databaseUrl,
                "--spring.datasource.username=sa",
                "--spring.datasource.password=",
                "--spring.h2.console.enabled=false",
                "--spring.jpa.hibernate.ddl-auto=validate",
                "--spring.jpa.open-in-view=false",
                "--logging.level.root=ERROR");
    }

    private String fileDatabaseUrl(String name) {
        return "jdbc:h2:file:" + tempDirectory.resolve(name).toAbsolutePath()
            + ";MODE=MySQL;DB_CLOSE_ON_EXIT=FALSE";
    }

    private List<String> successfulVersionedMigrations(JdbcTemplate database) {
        return database.query(
            "select \"version\", \"type\" from \"flyway_schema_history\" "
                + "where \"success\" = true and \"version\" is not null "
                + "order by \"installed_rank\"",
            (resultSet, rowNumber) -> resultSet.getString("version")
                + ":" + resultSet.getString("type"));
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
