package com.testscheduling.service;

import com.testscheduling.dto.LegacyModuleMigrationReport;
import com.testscheduling.dto.StaffCreateResponse;
import com.testscheduling.dto.StaffRequest;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.entity.User;
import com.testscheduling.repository.TestStaffRepository;
import com.testscheduling.repository.UserRepository;
import com.testscheduling.util.PasswordGenerator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class TestStaffService {

    @Autowired
    private TestStaffRepository testStaffRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private StaffModuleService staffModuleService;

    public List<TestStaff> findAll() {
        List<TestStaff> staffs = testStaffRepository.findAll();
        enrichWithRole(staffs);
        return staffs;
    }

    public TestStaff findById(Long id) {
        TestStaff staff = testStaffRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("人员不存在"));
        enrichWithRole(staff);
        return staff;
    }

    public List<TestStaff> findActive() {
        List<TestStaff> staffs = testStaffRepository.findByStatus(TestStaff.StaffStatus.active);
        enrichWithRole(staffs);
        return staffs;
    }

    public List<TestStaff> findByGroupName(String groupName) {
        List<TestStaff> staffs = testStaffRepository.findByGroupName(groupName);
        enrichWithRole(staffs);
        return staffs;
    }

    private void enrichWithRole(TestStaff staff) {
        if (staff != null) {
            userRepository.findByUsername(staff.getEmpNo())
                .ifPresent(user -> {
                    staff.setRole(user.getRole());
                    staff.setRoles(user.getRoles());
                    staff.setLegacyFamiliarModules(user.getFamiliarModules());
                    staff.setConfidentialClearance(user.getConfidentialClearance());
                });
            staff.setFamiliarModules(staffModuleService.findModulesByStaffId(staff.getId()));
        }
    }

    private void enrichWithRole(List<TestStaff> staffs) {
        Map<Long, List<TestModuleConfig>> modulesByStaffId = staffModuleService
            .findModulesByStaffIds(staffs.stream().map(TestStaff::getId).toList());
        for (TestStaff staff : staffs) {
            userRepository.findByUsername(staff.getEmpNo())
                .ifPresent(user -> {
                    staff.setRole(user.getRole());
                    staff.setRoles(user.getRoles());
                    staff.setLegacyFamiliarModules(user.getFamiliarModules());
                    staff.setConfidentialClearance(user.getConfidentialClearance());
                });
            staff.setFamiliarModules(modulesByStaffId.getOrDefault(staff.getId(), List.of()));
        }
    }

    @Transactional
    public StaffCreateResponse create(StaffRequest request) {
        TestStaff staff = new TestStaff();
        staff.setName(request.getName());
        staff.setEmpNo(request.getEmpNo());
        staff.setJoinDate(request.getJoinDate());
        staff.setGroupName(request.getGroupName());
        staff.setTestType(request.getTestType());
        staff.setInitialCoefficient(request.getInitialCoefficient());
        staff.setCurrentCoefficient(request.getCurrentCoefficient());
        if (request.getStatus() != null) {
            staff.setStatus(TestStaff.StaffStatus.valueOf(request.getStatus()));
        }
        TestStaff savedStaff = testStaffRepository.save(staff);

        if (userRepository.existsByUsername(request.getEmpNo())) {
            throw new RuntimeException("该工号对应的用户账号已存在");
        }

        String plainPassword = "12345678";
        User user = new User();
        user.setUsername(request.getEmpNo());
        user.setPassword(passwordEncoder.encode(plainPassword));
        if (request.getRoles() != null && !request.getRoles().isEmpty()) {
            user.setRoles(request.getRoles());
        } else {
            user.setRole(request.getRole() != null ? request.getRole() : "testExecutor");
        }
        user.setDisplayName(request.getName());
        user.setFamiliarModules(request.getFamiliarModules());
        user.setConfidentialClearance(request.getConfidentialClearance() != null ? request.getConfidentialClearance() : false);
        user.setEnabled(true);
        userRepository.save(user);

        if (request.getFamiliarModuleIds() != null) {
            staffModuleService.replaceModules(savedStaff, request.getFamiliarModuleIds());
        }
        enrichWithRole(savedStaff);

        return new StaffCreateResponse(savedStaff, plainPassword);
    }

    @Transactional
    public TestStaff update(Long id, StaffRequest request) {
        TestStaff existing = testStaffRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("人员不存在"));
        String oldEmpNo = existing.getEmpNo();

        existing.setName(request.getName());
        existing.setEmpNo(request.getEmpNo());
        existing.setJoinDate(request.getJoinDate());
        existing.setGroupName(request.getGroupName());
        existing.setTestType(request.getTestType());
        existing.setInitialCoefficient(request.getInitialCoefficient());
        existing.setCurrentCoefficient(request.getCurrentCoefficient());
        if (request.getStatus() != null) {
            existing.setStatus(TestStaff.StaffStatus.valueOf(request.getStatus()));
        }
        TestStaff saved = testStaffRepository.save(existing);

        User user = userRepository.findByUsername(oldEmpNo).orElse(null);
        if (user == null) {
            user = new User();
            user.setUsername(request.getEmpNo());
            user.setPassword(passwordEncoder.encode(PasswordGenerator.generateRandomPassword()));
            user.setDisplayName(request.getName());
            user.setEnabled(true);
        } else if (!oldEmpNo.equals(request.getEmpNo())) {
            user.setUsername(request.getEmpNo());
        }

        if (request.getRoles() != null && !request.getRoles().isEmpty()) {
            user.setRoles(request.getRoles());
        } else if (request.getRole() != null) {
            user.setRole(request.getRole());
        } else if (user.getRole() == null) {
            user.setRole("testExecutor");
        }
        if (request.getFamiliarModules() != null) {
            user.setFamiliarModules(request.getFamiliarModules());
        }
        user.setConfidentialClearance(request.getConfidentialClearance() != null ? request.getConfidentialClearance() : false);
        userRepository.save(user);

        if (request.getFamiliarModuleIds() != null) {
            staffModuleService.replaceModules(saved, request.getFamiliarModuleIds());
        }
        enrichWithRole(saved);

        return saved;
    }

    @Transactional
    public void delete(Long id) {
        TestStaff staff = findById(id);
        staffModuleService.deleteForStaff(id);
        userRepository.findByUsername(staff.getEmpNo()).ifPresent(user -> userRepository.delete(user));
        testStaffRepository.deleteById(id);
    }

    @Transactional
    public void deleteBatch(List<Long> ids) {
        List<String> empNos = testStaffRepository.findAllById(ids).stream()
            .map(TestStaff::getEmpNo)
            .collect(Collectors.toList());
        if (!empNos.isEmpty()) {
            staffModuleService.deleteForStaffIds(ids);
            userRepository.deleteByUsernameIn(empNos);
        }
        testStaffRepository.deleteAllById(ids);
    }

    @Transactional
    public LegacyModuleMigrationReport migrateLegacyModules() {
        return staffModuleService.migrateLegacy(userRepository.findAll());
    }

    public String getRoleByEmpNo(String empNo) {
        return userRepository.findByUsername(empNo)
            .map(User::getRole)
            .orElse(null);
    }

    public List<String> getRolesByEmpNo(String empNo) {
        return userRepository.findByUsername(empNo)
            .map(User::getRoles)
            .orElse(List.of());
    }
}
