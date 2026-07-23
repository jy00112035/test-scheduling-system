package com.testscheduling.repository;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.entity.TestStaffModule;
import com.testscheduling.entity.TestStaffModuleId;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.Persistable;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(properties = {
    "spring.jpa.properties.hibernate.generate_statistics=true",
    "logging.level.org.hibernate.engine.internal.StatisticalLoggingSessionEventListener=OFF"
})
@Transactional
class TestStaffModulePersistenceIntegrationTest {

    private static final String DATABASE_URL = "jdbc:h2:mem:staff-module-newness-"
        + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1";

    @DynamicPropertySource
    static void useUniqueDatabase(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> DATABASE_URL);
    }

    @Autowired
    private TestStaffModuleRepository staffModuleRepository;

    @Autowired
    private TestStaffRepository staffRepository;

    @Autowired
    private TestModuleConfigRepository moduleRepository;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void constructedRelationsInsertWithoutExistenceSelects() {
        TestStaff staff = staffRepository.saveAndFlush(staff("STAT-T1001"));
        List<TestModuleConfig> modules = moduleRepository.saveAllAndFlush(List.of(
            module("统计模块一"), module("统计模块二"), module("统计模块三")));
        entityManager.clear();
        Statistics statistics = statistics();
        statistics.clear();

        staffModuleRepository.saveAll(modules.stream()
            .map(module -> new TestStaffModule(staff.getId(), module.getId()))
            .toList());
        staffModuleRepository.flush();

        assertEquals(3, statistics.getEntityInsertCount());
        assertEquals(3, statistics.getPrepareStatementCount());
    }

    @Test
    void loadedRelationIsNotNewAndSavingItDoesNotInsertAgain() {
        TestStaff staff = staffRepository.saveAndFlush(staff("STAT-T1002"));
        TestModuleConfig module = moduleRepository.saveAndFlush(module("已存在统计模块"));
        TestStaffModule relation = new TestStaffModule(staff.getId(), module.getId());
        staffModuleRepository.saveAndFlush(relation);
        entityManager.clear();
        Statistics statistics = statistics();
        statistics.clear();

        TestStaffModule loaded = staffModuleRepository.findById(relation.getId()).orElseThrow();
        Persistable<?> persistable = assertInstanceOf(Persistable.class, loaded);
        assertFalse(persistable.isNew());
        entityManager.detach(loaded);
        staffModuleRepository.saveAndFlush(loaded);

        assertEquals(0, statistics.getEntityInsertCount());
        assertEquals(1, staffModuleRepository.count());
    }

    @Test
    void constructedRelationIsNewAndEqualityUsesOnlyEmbeddedId() throws Exception {
        TestStaffModule first = new TestStaffModule(101L, 11L);
        TestStaffModule sameId = new TestStaffModule(101L, 11L);
        first.setCreatedAt(LocalDateTime.now());

        Persistable<?> persistable = assertInstanceOf(Persistable.class, first);
        assertTrue(persistable.isNew());
        assertEquals(first, sameId);
        assertEquals(first.hashCode(), sameId.hashCode());
        assertEquals(new TestStaffModuleId(101L, 11L), first.getId());
        String json = objectMapper.writeValueAsString(first);
        assertFalse(json.contains("newEntity"));
        assertFalse(json.contains("\"new\""));
    }

    private Statistics statistics() {
        return entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
    }

    private TestStaff staff(String empNo) {
        TestStaff staff = new TestStaff();
        staff.setName(empNo);
        staff.setEmpNo(empNo);
        return staff;
    }

    private TestModuleConfig module(String name) {
        TestModuleConfig module = new TestModuleConfig();
        module.setModuleName(name);
        module.setTestType("功能测试");
        module.setEnabled(true);
        module.setSortOrder(10);
        return module;
    }
}
