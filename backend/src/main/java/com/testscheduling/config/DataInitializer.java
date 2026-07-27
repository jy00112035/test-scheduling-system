package com.testscheduling.config;

import com.testscheduling.entity.*;
import com.testscheduling.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.stream.Collectors;

@Component
public class DataInitializer implements CommandLineRunner {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TestStaffRepository testStaffRepository;

    @Autowired
    private FieldConfigRepository fieldConfigRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) {
        initUsers();
        migrateAdminRole();
        migrateChineseRoles();
        initStaff();
        initFieldConfigs();
    }

    /**
     * 修复数据库中存储的中文角色名称，将其转换为英文 code
     */
    private void migrateChineseRoles() {
        java.util.Map<String, String> chineseToEnglish = java.util.Map.of(
            "测试经理", "testManager",
            "资源主管", "resourceManager",
            "资源经理", "resourceManager",
            "项目经理", "projectManager",
            "测试执行人员", "testExecutor",
            "字段管理员", "fieldAdmin",
            "测试组长", "testLead"
        );
        List<User> allUsers = userRepository.findAll();
        boolean changed = false;
        for (User user : allUsers) {
            List<String> roles = user.getRoles();
            if (roles == null || roles.isEmpty()) continue;
            List<String> migrated = new java.util.ArrayList<>();
            boolean userChanged = false;
            for (String role : roles) {
                String english = chineseToEnglish.get(role);
                if (english != null) {
                    migrated.add(english);
                    userChanged = true;
                } else {
                    migrated.add(role);
                }
            }
            if (userChanged) {
                // 去重
                List<String> deduplicated = migrated.stream().distinct().collect(Collectors.toList());
                user.setRoles(deduplicated);
                userRepository.save(user);
                changed = true;
            }
        }
        if (changed) {
            System.out.println("[DataInitializer] 已迁移中文角色名称为英文 code");
        }
    }

    /**
     * 给现有 admin 账号补上 admin 角色（兼容旧数据库）
     */
    private void migrateAdminRole() {
        userRepository.findByUsername("admin").ifPresent(admin -> {
            if (!admin.getRoles().contains("admin")) {
                List<String> roles = new java.util.ArrayList<>(admin.getRoles());
                roles.add(0, "admin");
                admin.setRoles(roles);
                userRepository.save(admin);
            }
        });
    }

    private void initUsers() {
        if (userRepository.count() == 0) {
            User admin = new User();
            admin.setUsername("admin");
            admin.setPassword(passwordEncoder.encode("admin123"));
            admin.setRoles(List.of("admin", "fieldAdmin", "testManager"));
            admin.setDisplayName("管理员");
            admin.setEnabled(true);
            userRepository.save(admin);

            User testManager = new User();
            testManager.setUsername("testmanager");
            testManager.setPassword(passwordEncoder.encode("test123"));
            testManager.setRoles(List.of("testManager"));
            testManager.setDisplayName("测试经理");
            testManager.setEnabled(true);
            userRepository.save(testManager);

            User resourceManager = new User();
            resourceManager.setUsername("resourcemanager");
            resourceManager.setPassword(passwordEncoder.encode("resource123"));
            resourceManager.setRoles(List.of("resourceManager"));
            resourceManager.setDisplayName("资源主管");
            resourceManager.setEnabled(true);
            userRepository.save(resourceManager);

            User projectManager = new User();
            projectManager.setUsername("projectmanager");
            projectManager.setPassword(passwordEncoder.encode("project123"));
            projectManager.setRoles(List.of("projectManager"));
            projectManager.setDisplayName("项目经理");
            projectManager.setEnabled(true);
            userRepository.save(projectManager);

            User testExecutor = new User();
            testExecutor.setUsername("testexecutor");
            testExecutor.setPassword(passwordEncoder.encode("test123"));
            testExecutor.setRoles(List.of("testExecutor"));
            testExecutor.setDisplayName("测试执行人员");
            testExecutor.setEnabled(true);
            userRepository.save(testExecutor);

            User testLead = new User();
            testLead.setUsername("testlead");
            testLead.setPassword(passwordEncoder.encode("test123"));
            testLead.setRoles(List.of("testLead"));
            testLead.setDisplayName("测试组长");
            testLead.setTestType("功能测试");
            testLead.setEnabled(true);
            userRepository.save(testLead);
        }
    }

    private void initStaff() {
        if (testStaffRepository.count() == 0) {
            TestStaff s1 = new TestStaff();
            s1.setName("张三");
            s1.setEmpNo("TS001");
            s1.setJoinDate(LocalDate.now().minusMonths(8));
            s1.setGroupName("功能测试组");
            s1.setTestType("功能测试");
            s1.setInitialCoefficient(new BigDecimal("0.30"));
            s1.setCurrentCoefficient(new BigDecimal("1.00"));
            s1.setStatus(TestStaff.StaffStatus.active);
            testStaffRepository.save(s1);

            TestStaff s2 = new TestStaff();
            s2.setName("李四");
            s2.setEmpNo("TS002");
            s2.setJoinDate(LocalDate.now().minusMonths(6));
            s2.setGroupName("功能测试组");
            s2.setTestType("功能测试");
            s2.setInitialCoefficient(new BigDecimal("0.30"));
            s2.setCurrentCoefficient(new BigDecimal("1.00"));
            s2.setStatus(TestStaff.StaffStatus.active);
            testStaffRepository.save(s2);

            TestStaff s3 = new TestStaff();
            s3.setName("王五");
            s3.setEmpNo("TS003");
            s3.setJoinDate(LocalDate.now().minusMonths(3));
            s3.setGroupName("自动化测试组");
            s3.setTestType("自动化测试");
            s3.setInitialCoefficient(new BigDecimal("0.30"));
            s3.setCurrentCoefficient(new BigDecimal("0.70"));
            s3.setStatus(TestStaff.StaffStatus.active);
            testStaffRepository.save(s3);

            TestStaff s4 = new TestStaff();
            s4.setName("赵六");
            s4.setEmpNo("TS004");
            s4.setJoinDate(LocalDate.now().minusWeeks(1));
            s4.setGroupName("功能测试组");
            s4.setTestType("功能测试");
            s4.setInitialCoefficient(new BigDecimal("0.30"));
            s4.setCurrentCoefficient(new BigDecimal("0.30"));
            s4.setStatus(TestStaff.StaffStatus.active);
            testStaffRepository.save(s4);

            TestStaff s5 = new TestStaff();
            s5.setName("钱七");
            s5.setEmpNo("TS005");
            s5.setJoinDate(LocalDate.now().minusWeeks(2));
            s5.setGroupName("性能测试组");
            s5.setTestType("性能测试");
            s5.setInitialCoefficient(new BigDecimal("0.30"));
            s5.setCurrentCoefficient(new BigDecimal("0.50"));
            s5.setStatus(TestStaff.StaffStatus.active);
            testStaffRepository.save(s5);
        }
    }

    private void initFieldConfigs() {
        // 使用 ensureFieldConfig 逐个创建，兼容 Flyway 迁移已部分插入的场景
        ensureFieldConfig("versionType", "select", "维护,在研,升级", "版本类型", true, 1);
        ensureFieldConfig("versionPhase", "select", "月度维护,紧急版本,第一版,第二版,第三版,第四版,第五版,Tag线版本,合格版本,合同期维护版本", "版本所处阶段", true, 2);
        ensureFieldConfig("productName", "input", "", "产品名称", true, 3);
        ensureFieldConfig("testType", "select", "功能测试,自动化测试,性能测试,安全测试,兼容性测试", "测试类型", false, 4);
        ensureFieldConfig("groupName", "select", "功能测试组,自动化测试组,性能测试组", "所属组", true, 5);
        ensureFieldConfig("priority", "select", "高,中,低", "需求优先级", true, 6);
        ensureFieldConfig("officeLocation", "select", "", "办公地点", true, 7);
    }

    private void ensureFieldConfig(String fieldName, String fieldType,
            String options, String description, boolean required, int sortOrder) {
        if (fieldConfigRepository.findByFieldName(fieldName).isEmpty()) {
            FieldConfig config = new FieldConfig();
            config.setFieldName(fieldName);
            config.setFieldType(fieldType);
            config.setOptions(options);
            config.setDescription(description);
            config.setRequired(required);
            config.setSortOrder(sortOrder);
            fieldConfigRepository.save(config);
        }
    }
}
