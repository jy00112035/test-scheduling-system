package com.testscheduling.migration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest
class MigrationSmokeTest {
    @Autowired JdbcTemplate jdbc;

    @Test
    void createsSpecialModuleTablesAndScheduleColumns() {
        assertEquals(1, jdbc.queryForObject(
            "select count(*) from information_schema.tables where table_name = 'TEST_MODULE_CONFIG'",
            Integer.class));
        assertEquals(1, jdbc.queryForObject(
            "select count(*) from information_schema.columns where table_name = 'SCHEDULE' and column_name = 'DEMAND_SPECIAL_MODULE_ID'",
            Integer.class));
    }
}
