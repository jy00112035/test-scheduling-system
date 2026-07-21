package com.testscheduling.migration;

import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;

class MysqlProfileConfigurationTest {
    @Test
    void requiresExternalCredentialsAndDisablesH2Console() throws Exception {
        PropertySource<?> properties = new YamlPropertySourceLoader()
            .load("mysql-profile", new ClassPathResource("application-mysql.yml"))
            .get(0);

        assertAll(
            () -> assertEquals("${MYSQL_URL}", properties.getProperty("spring.datasource.url")),
            () -> assertEquals("${MYSQL_USERNAME}", properties.getProperty("spring.datasource.username")),
            () -> assertEquals("${MYSQL_PASSWORD}", properties.getProperty("spring.datasource.password")),
            () -> assertEquals("${JWT_SECRET}", properties.getProperty("jwt.secret")),
            () -> assertEquals(false, properties.getProperty("spring.h2.console.enabled"))
        );
    }
}
