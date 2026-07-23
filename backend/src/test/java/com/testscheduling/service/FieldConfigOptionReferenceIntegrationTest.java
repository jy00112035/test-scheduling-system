package com.testscheduling.service;

import com.testscheduling.entity.DemandManpowerDetail;
import com.testscheduling.entity.FieldConfig;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.repository.FieldConfigRepository;
import com.testscheduling.repository.TestStaffRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@Transactional
class FieldConfigOptionReferenceIntegrationTest {

    private static final String DATABASE_URL = "jdbc:h2:mem:field-option-references-"
        + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1";

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> DATABASE_URL);
    }

    @Autowired FieldConfigService service;
    @Autowired FieldConfigRepository configRepository;
    @Autowired TestStaffRepository staffRepository;
    @Autowired TestDemandService demandService;

    @Test
    void manualUpdateRemovesUnreferencedOption() {
        FieldConfig config = savedConfig("groupName", "保留项目,未引用项目");

        FieldConfig updated = service.update(config.getId(),
            changes("groupName", "保留项目"));

        assertTrue(options(updated).contains("保留项目"));
        assertFalse(options(updated).contains("未引用项目"));
    }

    @Test
    void manualUpdateRetainsStaffAndDemandReferencesButRemovesUnreferencedOptions() {
        TestStaff staff = new TestStaff();
        staff.setName("引用人员");
        staff.setEmpNo("FIELD-REF-" + UUID.randomUUID());
        staff.setGroupName("人员引用项目");
        staff.setTestType("人员引用类型");
        staffRepository.saveAndFlush(staff);

        TestDemand demand = new TestDemand();
        demand.setProduct("字段引用需求-" + UUID.randomUUID());
        demand.setVersionType("release");
        DemandManpowerDetail detail = new DemandManpowerDetail();
        detail.setTestType("需求引用类型");
        detail.setManpowerDemand(BigDecimal.ONE);
        demand.setManpowerDetails(List.of(detail));
        demandService.create(demand, "field-reference-submitter");

        FieldConfig group = savedConfig(
            "groupName", "管理员项目,人员引用项目,未引用项目");
        FieldConfig testType = savedConfig(
            "testType", "管理员类型,人员引用类型,需求引用类型,未引用类型");

        FieldConfig updatedGroup = service.update(group.getId(),
            changes("groupName", "管理员项目"));
        FieldConfig updatedTestType = service.update(testType.getId(),
            changes("testType", "管理员类型"));

        assertTrue(options(updatedGroup).containsAll(Set.of("管理员项目", "人员引用项目")));
        assertFalse(options(updatedGroup).contains("未引用项目"));
        assertTrue(options(updatedTestType).containsAll(
            Set.of("管理员类型", "人员引用类型", "需求引用类型")));
        assertFalse(options(updatedTestType).contains("未引用类型"));
    }

    private FieldConfig savedConfig(String fieldName, String options) {
        FieldConfig config = configRepository.findByFieldName(fieldName)
            .orElseGet(() -> changes(fieldName, options));
        config.setFieldType("select");
        config.setOptions(options);
        config.setRequired(false);
        config.setSortOrder(10);
        return configRepository.saveAndFlush(config);
    }

    private FieldConfig changes(String fieldName, String options) {
        FieldConfig config = new FieldConfig();
        config.setFieldName(fieldName);
        config.setFieldType("select");
        config.setOptions(options);
        config.setRequired(false);
        config.setSortOrder(10);
        return config;
    }

    private Set<String> options(FieldConfig config) {
        return Set.copyOf(Arrays.asList(config.getOptions().split(",")));
    }
}
