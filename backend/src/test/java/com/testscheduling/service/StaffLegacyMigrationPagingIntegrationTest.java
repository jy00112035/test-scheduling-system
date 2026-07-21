package com.testscheduling.service;

import com.testscheduling.dto.LegacyModuleMigrationReport;
import com.testscheduling.entity.User;
import com.testscheduling.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest
class StaffLegacyMigrationPagingIntegrationTest {

    private static final String DATABASE_URL = "jdbc:h2:mem:legacy-paging-" + UUID.randomUUID()
        + ";MODE=MySQL;DB_CLOSE_DELAY=-1";

    @DynamicPropertySource
    static void useUniqueDatabase(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> DATABASE_URL);
    }

    @Autowired
    private TestStaffService testStaffService;

    @Autowired
    private UserRepository userRepository;

    @Test
    void migratesMoreThanOnePageInStableOrderAndSkipsBlankLegacyText() {
        List<String> usernames = IntStream.range(0, 201)
            .mapToObj(index -> "PAGE-" + index)
            .toList();
        List<User> users = new ArrayList<>(usernames.stream()
            .map(username -> user(username, "模块-" + username))
            .toList());
        users.add(user("PAGE-BLANK", "   "));
        userRepository.saveAll(users);
        userRepository.flush();

        LegacyModuleMigrationReport first = testStaffService.migrateLegacyModules();
        LegacyModuleMigrationReport second = testStaffService.migrateLegacyModules();

        assertEquals(usernames, first.missingStaffAccounts());
        assertEquals(usernames, second.missingStaffAccounts());
        assertEquals(0, first.createdRelations());
        assertEquals(0, second.createdRelations());
    }

    private User user(String username, String familiarModules) {
        User user = new User();
        user.setUsername(username);
        user.setPassword("encoded");
        user.setRoles(List.of("testExecutor"));
        user.setDisplayName(username);
        user.setFamiliarModules(familiarModules);
        user.setEnabled(true);
        return user;
    }
}
