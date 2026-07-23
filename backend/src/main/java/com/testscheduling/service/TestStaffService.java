package com.testscheduling.service;

import com.testscheduling.dto.LegacyModuleMigrationReport;
import com.testscheduling.dto.LegacyModuleUser;
import com.testscheduling.dto.StaffCreateResponse;
import com.testscheduling.dto.StaffRequest;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.entity.User;
import com.testscheduling.repository.TestStaffRepository;
import com.testscheduling.repository.UserRepository;
import com.testscheduling.security.StaffRoleAssignmentPolicy;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.util.PasswordGenerator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Slice;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class TestStaffService {

    private static final int LEGACY_MIGRATION_PAGE_SIZE = 200;

    @Autowired
    private TestStaffRepository testStaffRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private StaffModuleService staffModuleService;

    @Autowired
    private StaffRoleAssignmentPolicy roleAssignmentPolicy;

    @Autowired
    private FieldConfigService fieldConfigService;

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
                .ifPresent(user -> applyUserDetails(staff, user));
            staff.setFamiliarModules(staffModuleService.findModulesByStaffId(staff.getId()));
        }
    }

    private void enrichWithRole(List<TestStaff> staffs) {
        if (staffs.isEmpty()) {
            return;
        }
        Map<Long, List<TestModuleConfig>> modulesByStaffId = staffModuleService
            .findModulesByStaffIds(staffs.stream().map(TestStaff::getId).toList());
        List<String> empNos = staffs.stream().map(TestStaff::getEmpNo).distinct().toList();
        Map<String, User> usersByUsername = userRepository.findByUsernameIn(empNos).stream()
            .collect(Collectors.toMap(User::getUsername, Function.identity()));
        for (TestStaff staff : staffs) {
            User user = usersByUsername.get(staff.getEmpNo());
            if (user != null) {
                applyUserDetails(staff, user);
            }
            staff.setFamiliarModules(modulesByStaffId.getOrDefault(staff.getId(), List.of()));
        }
    }

    private void applyUserDetails(TestStaff staff, User user) {
        staff.setRole(user.getRole());
        staff.setRoles(user.getRoles());
        staff.setLegacyFamiliarModules(user.getFamiliarModules());
        staff.setConfidentialClearance(user.getConfidentialClearance());
    }

    @Transactional
    public StaffCreateResponse create(StaffRequest request, String actorUsername) {
        User actor = requireActor(actorUsername);
        List<String> assignedRoles = roleAssignmentPolicy.authorizeCreate(actor, request);
        if (userRepository.existsByUsername(request.getEmpNo())) {
            throw duplicateAccount();
        }

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
        testStaffRepository.flush();

        String plainPassword = "12345678";
        User user = new User();
        user.setUsername(request.getEmpNo());
        user.setPassword(passwordEncoder.encode(plainPassword));
        user.setRoles(assignedRoles);
        user.setDisplayName(request.getName());
        user.setFamiliarModules(request.getFamiliarModules());
        user.setConfidentialClearance(request.getConfidentialClearance() != null ? request.getConfidentialClearance() : false);
        user.setEnabled(true);
        userRepository.save(user);
        fieldConfigService.appendStaffOptions(request.getGroupName(), request.getTestType());

        if (request.getFamiliarModuleIds() != null) {
            staffModuleService.replaceModules(savedStaff, request.getFamiliarModuleIds());
        }
        enrichWithRole(savedStaff);

        return new StaffCreateResponse(savedStaff, plainPassword);
    }

    @Transactional
    public TestStaff update(Long id, StaffRequest request, String actorUsername) {
        if (request.getFamiliarModuleIds() != null) {
            staffModuleService.lockModulesForStaffUpdate(request.getFamiliarModuleIds());
        }
        TestStaff existing = testStaffRepository.findByIdForUpdate(id)
            .orElseThrow(() -> new RuntimeException("人员不存在"));
        String oldEmpNo = existing.getEmpNo();
        User user = userRepository.findByUsernameForUpdate(oldEmpNo).orElse(null);
        User actor = requireActor(actorUsername);
        List<String> assignedRoles = roleAssignmentPolicy.authorizeUpdate(
            actor, user, existing, request);
        if (!Objects.equals(oldEmpNo, request.getEmpNo())) {
            User targetUser = userRepository.findByUsername(request.getEmpNo()).orElse(null);
            if (targetUser != null
                    && (user == null || !Objects.equals(targetUser.getId(), user.getId()))) {
                throw duplicateAccount();
            }
        }

        if (request.getFamiliarModuleIds() != null) {
            staffModuleService.replaceModules(existing, request.getFamiliarModuleIds());
        }

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

        if (user == null) {
            user = new User();
            user.setUsername(request.getEmpNo());
            user.setPassword(passwordEncoder.encode(PasswordGenerator.generateRandomPassword()));
            user.setDisplayName(request.getName());
            user.setEnabled(true);
        } else if (!oldEmpNo.equals(request.getEmpNo())) {
            user.setUsername(request.getEmpNo());
        }

        user.setRoles(assignedRoles);
        if (request.getFamiliarModules() != null) {
            user.setFamiliarModules(request.getFamiliarModules());
        }
        user.setConfidentialClearance(request.getConfidentialClearance() != null ? request.getConfidentialClearance() : false);
        userRepository.save(user);
        fieldConfigService.appendStaffOptions(request.getGroupName(), request.getTestType());

        enrichWithRole(saved);

        return saved;
    }

    private RuntimeException duplicateAccount() {
        return new RuntimeException("该工号对应的用户账号已存在");
    }

    @Transactional
    public void delete(Long id, String actorUsername) {
        TestStaff staff = testStaffRepository.findByIdForUpdate(id)
            .orElseThrow(() -> new RuntimeException("人员不存在"));
        roleAssignmentPolicy.authorizeDelete(requireActor(actorUsername),
            userRepository.findByUsername(staff.getEmpNo()).orElse(null), staff);
        staffModuleService.deleteForStaff(id);
        userRepository.findByUsername(staff.getEmpNo()).ifPresent(user -> userRepository.delete(user));
        testStaffRepository.deleteById(id);
    }

    @Transactional
    public void deleteBatch(List<Long> ids, String actorUsername) {
        User actor = requireActor(actorUsername);
        List<TestStaff> staffs = ids.stream().filter(Objects::nonNull).distinct().sorted()
            .map(id -> testStaffRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new RuntimeException("人员不存在")))
            .toList();
        staffs.forEach(staff -> roleAssignmentPolicy.authorizeDelete(actor,
            userRepository.findByUsername(staff.getEmpNo()).orElse(null), staff));
        List<String> empNos = staffs.stream()
            .map(TestStaff::getEmpNo)
            .collect(Collectors.toList());
        if (!empNos.isEmpty()) {
            staffModuleService.deleteForStaffIds(ids);
            userRepository.deleteByUsernameIn(empNos);
        }
        testStaffRepository.deleteAllById(ids);
    }

    private User requireActor(String actorUsername) {
        User actor = actorUsername == null ? null
            : userRepository.findByUsername(actorUsername).orElse(null);
        if (actor == null || !Boolean.TRUE.equals(actor.getEnabled())) {
            throw new BusinessException("FORBIDDEN", "无权限执行此操作");
        }
        return actor;
    }

    public LegacyModuleMigrationReport migrateLegacyModules() {
        int createdRelations = 0;
        Map<String, List<String>> duplicateNames = new LinkedHashMap<>();
        Map<String, List<String>> unmatched = new LinkedHashMap<>();
        List<String> missingStaffAccounts = new ArrayList<>();
        int pageNumber = 0;
        Slice<LegacyModuleUser> page;

        do {
            page = userRepository.findLegacyModuleUsers(
                PageRequest.of(pageNumber, LEGACY_MIGRATION_PAGE_SIZE));
            LegacyModuleMigrationReport pageReport = staffModuleService
                .migrateLegacyPage(page.getContent());
            createdRelations += pageReport.createdRelations();
            duplicateNames.putAll(pageReport.duplicateNames());
            unmatched.putAll(pageReport.unmatched());
            missingStaffAccounts.addAll(pageReport.missingStaffAccounts());
            pageNumber++;
        } while (page.hasNext());

        return new LegacyModuleMigrationReport(
            createdRelations, duplicateNames, unmatched, missingStaffAccounts);
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
