package com.testscheduling.config;

import com.testscheduling.entity.*;
import com.testscheduling.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;

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
        initStaff();
        initFieldConfigs();
    }

    private void initUsers() {
        if (userRepository.count() == 0) {
            User admin = new User();
            admin.setUsername("admin");
            admin.setPassword(passwordEncoder.encode("admin123"));
            admin.setRole("fieldAdmin");
            admin.setDisplayName("管理员");
            admin.setEnabled(true);
            userRepository.save(admin);

            User testManager = new User();
            testManager.setUsername("testmanager");
            testManager.setPassword(passwordEncoder.encode("test123"));
            testManager.setRole("testManager");
            testManager.setDisplayName("测试经理");
            testManager.setEnabled(true);
            userRepository.save(testManager);

            User resourceManager = new User();
            resourceManager.setUsername("resourcemanager");
            resourceManager.setPassword(passwordEncoder.encode("resource123"));
            resourceManager.setRole("resourceManager");
            resourceManager.setDisplayName("资源主管");
            resourceManager.setEnabled(true);
            userRepository.save(resourceManager);

            User projectManager = new User();
            projectManager.setUsername("projectmanager");
            projectManager.setPassword(passwordEncoder.encode("project123"));
            projectManager.setRole("projectManager");
            projectManager.setDisplayName("项目经理");
            projectManager.setEnabled(true);
            userRepository.save(projectManager);

            User testExecutor = new User();
            testExecutor.setUsername("testexecutor");
            testExecutor.setPassword(passwordEncoder.encode("test123"));
            testExecutor.setRole("testExecutor");
            testExecutor.setDisplayName("测试执行人员");
            testExecutor.setEnabled(true);
            userRepository.save(testExecutor);
        }
    }

    private void initStaff() {
        if (testStaffRepository.count() == 0) {
            TestStaff s1 = new TestStaff();
            s1.setName("张三");
            s1.setEmpNo("TS001");
            s1.setJoinDate(LocalDate.now().minusMonths(8));
            s1.setGroupName("功能测试组");
            s1.setInitialCoefficient(new BigDecimal("0.30"));
            s1.setCurrentCoefficient(new BigDecimal("1.00"));
            s1.setStatus(TestStaff.StaffStatus.active);
            testStaffRepository.save(s1);

            TestStaff s2 = new TestStaff();
            s2.setName("李四");
            s2.setEmpNo("TS002");
            s2.setJoinDate(LocalDate.now().minusMonths(6));
            s2.setGroupName("功能测试组");
            s2.setInitialCoefficient(new BigDecimal("0.30"));
            s2.setCurrentCoefficient(new BigDecimal("1.00"));
            s2.setStatus(TestStaff.StaffStatus.active);
            testStaffRepository.save(s2);

            TestStaff s3 = new TestStaff();
            s3.setName("王五");
            s3.setEmpNo("TS003");
            s3.setJoinDate(LocalDate.now().minusMonths(3));
            s3.setGroupName("自动化测试组");
            s3.setInitialCoefficient(new BigDecimal("0.30"));
            s3.setCurrentCoefficient(new BigDecimal("0.70"));
            s3.setStatus(TestStaff.StaffStatus.active);
            testStaffRepository.save(s3);

            TestStaff s4 = new TestStaff();
            s4.setName("赵六");
            s4.setEmpNo("TS004");
            s4.setJoinDate(LocalDate.now().minusWeeks(1));
            s4.setGroupName("功能测试组");
            s4.setInitialCoefficient(new BigDecimal("0.30"));
            s4.setCurrentCoefficient(new BigDecimal("0.30"));
            s4.setStatus(TestStaff.StaffStatus.active);
            testStaffRepository.save(s4);

            TestStaff s5 = new TestStaff();
            s5.setName("钱七");
            s5.setEmpNo("TS005");
            s5.setJoinDate(LocalDate.now().minusWeeks(2));
            s5.setGroupName("性能测试组");
            s5.setInitialCoefficient(new BigDecimal("0.30"));
            s5.setCurrentCoefficient(new BigDecimal("0.50"));
            s5.setStatus(TestStaff.StaffStatus.active);
            testStaffRepository.save(s5);
        }
    }

    private void initFieldConfigs() {
        if (fieldConfigRepository.count() == 0) {
            FieldConfig f1 = new FieldConfig();
            f1.setFieldName("versionType");
            f1.setFieldType("select");
            f1.setOptions("维护,在研,升级");
            f1.setDescription("版本类型");
            f1.setRequired(true);
            f1.setSortOrder(1);
            fieldConfigRepository.save(f1);

            FieldConfig f2 = new FieldConfig();
            f2.setFieldName("versionPhase");
            f2.setFieldType("select");
            f2.setOptions("月度维护,紧急版本,第一版,第二版,第三版,第四版,第五版,Tag线版本,合格版本,合同期维护版本");
            f2.setDescription("版本所处阶段");
            f2.setRequired(true);
            f2.setSortOrder(2);
            fieldConfigRepository.save(f2);

            FieldConfig f3 = new FieldConfig();
            f3.setFieldName("productName");
            f3.setFieldType("input");
            f3.setOptions("");
            f3.setDescription("产品名称");
            f3.setRequired(true);
            f3.setSortOrder(3);
            fieldConfigRepository.save(f3);

            FieldConfig f4 = new FieldConfig();
            f4.setFieldName("testType");
            f4.setFieldType("select");
            f4.setOptions("功能测试,性能测试,安全测试,兼容性测试");
            f4.setDescription("测试类型");
            f4.setRequired(false);
            f4.setSortOrder(4);
            fieldConfigRepository.save(f4);

            FieldConfig f5 = new FieldConfig();
            f5.setFieldName("groupName");
            f5.setFieldType("select");
            f5.setOptions("功能测试组,自动化测试组,性能测试组");
            f5.setDescription("所属组");
            f5.setRequired(true);
            f5.setSortOrder(5);
            fieldConfigRepository.save(f5);
        }
    }
}
