package com.testscheduling.config;

import com.testscheduling.util.JwtUtil;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.core.io.FileSystemResource;

import java.util.List;
import java.util.Properties;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
class JwtConfigurationTest {

    @Autowired JwtUtil jwtUtil;

    @Value("${jwt.secret}")
    String testSecret;

    @Test
    void mainRuntimeRequiresJwtSecretEnvironmentVariableWithoutFallback() {
        YamlPropertiesFactoryBean yaml = new YamlPropertiesFactoryBean();
        yaml.setResources(new FileSystemResource("src/main/resources/application.yml"));
        Properties properties = yaml.getObject();

        assertEquals("${JWT_SECRET}", properties.getProperty("jwt.secret"));
    }

    @Test
    void testClasspathUsesAnIsolatedTestOnlySecret() {
        assertTrue(testSecret.startsWith("test-only-"));
        String token = jwtUtil.generateToken("test-user", List.of("testExecutor"));
        assertEquals("test-user", jwtUtil.getUsernameFromToken(token));
    }

    @Test
    void blankOrShortSecretFailsFastWithoutExposingItsValue() {
        IllegalStateException blank = assertThrows(IllegalStateException.class,
            () -> new JwtUtil(" ", 86_400_000L));
        IllegalStateException shortSecret = assertThrows(IllegalStateException.class,
            () -> new JwtUtil("too-short", 86_400_000L));

        assertEquals("JWT signing secret must be supplied through JWT_SECRET and contain at least 32 characters",
            blank.getMessage());
        assertEquals(blank.getMessage(), shortSecret.getMessage());
        assertFalse(blank.getMessage().contains("too-short"));
    }
}
