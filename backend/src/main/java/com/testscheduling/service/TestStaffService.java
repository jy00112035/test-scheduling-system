package com.testscheduling.service;

import com.testscheduling.dto.StaffCreateResponse;
import com.testscheduling.dto.StaffRequest;
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
import java.util.stream.Collectors;

@Service
public class TestStaffService {

    @Autowired
    private TestStaffRepository testStaffRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

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
                    staff.setFamiliarModules(user.getFamiliarModules());
                    staff.setConfidentialClearance(user.getConfidentialClearance());
                });
        }
    }

    private void enrichWithRole(List<TestStaff> staffs) {
        for (TestStaff staff : staffs) {
            enrichWithRole(staff);
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

        return new StaffCreateResponse(savedStaff, plainPassword);
    }

    @Transactional
    public TestStaff update(Long id, StaffRequest request) {
        TestStaff existing = findById(id);
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
        user.setFamiliarModules(request.getFamiliarModules());
        user.setConfidentialClearance(request.getConfidentialClearance() != null ? request.getConfidentialClearance() : false);
        userRepository.save(user);

        return saved;
    }

    @Transactional
    public void delete(Long id) {
        TestStaff staff = findById(id);
        userRepository.findByUsername(staff.getEmpNo()).ifPresent(user -> userRepository.delete(user));
        testStaffRepository.deleteById(id);
    }

    @Transactional
    public void deleteBatch(List<Long> ids) {
        List<String> empNos = testStaffRepository.findAllById(ids).stream()
            .map(TestStaff::getEmpNo)
            .collect(Collectors.toList());
        if (!empNos.isEmpty()) {
            userRepository.deleteByUsernameIn(empNos);
        }
        testStaffRepository.deleteAllById(ids);
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
