package com.testscheduling.service;

import com.testscheduling.dto.LegacyModuleMigrationReport;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.entity.TestStaffModule;
import com.testscheduling.entity.User;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.TestModuleConfigRepository;
import com.testscheduling.repository.TestStaffModuleRepository;
import com.testscheduling.repository.TestStaffRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class StaffModuleService {

    private static final String AUDIT_ENTITY_TYPE = "TEST_STAFF";

    private final TestStaffModuleRepository staffModuleRepository;
    private final TestModuleConfigRepository moduleRepository;
    private final TestStaffRepository staffRepository;
    private final AuditLogService auditLogService;

    public StaffModuleService(
            TestStaffModuleRepository staffModuleRepository,
            TestModuleConfigRepository moduleRepository,
            TestStaffRepository staffRepository,
            AuditLogService auditLogService) {
        this.staffModuleRepository = staffModuleRepository;
        this.moduleRepository = moduleRepository;
        this.staffRepository = staffRepository;
        this.auditLogService = auditLogService;
    }

    @Transactional
    public List<TestModuleConfig> replaceModules(TestStaff staff, List<Long> requestedModuleIds) {
        Long staffId = requireStaffId(staff);
        List<Long> existingIds = staffModuleRepository.findModuleIdsByStaffId(staffId);
        List<Long> requestedIds = distinctIds(requestedModuleIds);
        Map<Long, TestModuleConfig> modulesById = loadRequestedModules(requestedIds);

        Set<Long> existingIdSet = new LinkedHashSet<>(existingIds);
        for (Long moduleId : requestedIds) {
            TestModuleConfig module = modulesById.get(moduleId);
            if (!Boolean.TRUE.equals(module.getEnabled()) && !existingIdSet.contains(moduleId)) {
                throw new BusinessException(
                    "MODULE_DISABLED_FOR_NEW_STAFF", "停用模块不能新增为人员熟悉模块");
            }
        }

        staffModuleRepository.deleteByStaffId(staffId);
        staffModuleRepository.flush();
        if (!requestedIds.isEmpty()) {
            List<TestStaffModule> replacements = requestedIds.stream()
                .map(moduleId -> new TestStaffModule(staffId, moduleId))
                .toList();
            staffModuleRepository.saveAll(replacements);
        }
        auditLogService.record(
            "STAFF_MODULES_REPLACED", AUDIT_ENTITY_TYPE, staffId, existingIds, requestedIds);
        return requestedIds.stream().map(modulesById::get).toList();
    }

    @Transactional(readOnly = true)
    public Map<Long, List<TestModuleConfig>> findModulesByStaffIds(List<Long> staffIds) {
        if (staffIds == null || staffIds.isEmpty()) {
            return Map.of();
        }
        List<Long> distinctStaffIds = distinctIds(staffIds);
        List<TestStaffModule> relations = staffModuleRepository
            .findByIdStaffIdInOrderByIdStaffIdAscIdModuleIdAsc(distinctStaffIds);
        if (relations.isEmpty()) {
            return Map.of();
        }

        List<Long> moduleIds = relations.stream()
            .map(relation -> relation.getId().getModuleId())
            .distinct()
            .toList();
        Map<Long, TestModuleConfig> modulesById = moduleRepository.findAllById(moduleIds).stream()
            .collect(Collectors.toMap(TestModuleConfig::getId, Function.identity()));
        if (modulesById.size() != moduleIds.size()) {
            throw new BusinessException("MODULE_NOT_FOUND", "人员熟悉模块不存在");
        }

        Map<Long, List<TestModuleConfig>> result = new LinkedHashMap<>();
        for (TestStaffModule relation : relations) {
            result.computeIfAbsent(relation.getId().getStaffId(), ignored -> new ArrayList<>())
                .add(modulesById.get(relation.getId().getModuleId()));
        }
        return result;
    }

    @Transactional(readOnly = true)
    public List<TestModuleConfig> findModulesByStaffId(Long staffId) {
        return findModulesByStaffIds(List.of(staffId)).getOrDefault(staffId, List.of());
    }

    @Transactional
    public void deleteForStaff(Long staffId) {
        staffModuleRepository.deleteByStaffId(staffId);
        staffModuleRepository.flush();
    }

    @Transactional
    public void deleteForStaffIds(List<Long> staffIds) {
        if (staffIds == null || staffIds.isEmpty()) {
            return;
        }
        staffModuleRepository.deleteByStaffIdIn(distinctIds(staffIds));
        staffModuleRepository.flush();
    }

    @Transactional
    public LegacyModuleMigrationReport migrateLegacy(List<User> users) {
        Map<String, TestModuleConfig> modulesByName = moduleRepository.findAll().stream()
            .collect(Collectors.toMap(
                TestModuleConfig::getModuleName,
                Function.identity(),
                (first, ignored) -> first,
                LinkedHashMap::new));
        Map<String, List<String>> duplicateNames = new LinkedHashMap<>();
        Map<String, List<String>> unmatched = new LinkedHashMap<>();
        List<String> missingStaffAccounts = new ArrayList<>();
        int createdRelations = 0;

        for (User user : users == null ? List.<User>of() : users) {
            List<String> names = parseLegacyNames(user.getFamiliarModules());
            if (names.isEmpty()) {
                continue;
            }
            List<String> duplicates = duplicateNames(names);
            if (!duplicates.isEmpty()) {
                duplicateNames.put(user.getUsername(), duplicates);
            }

            TestStaff staff = staffRepository.findByEmpNo(user.getUsername()).orElse(null);
            if (staff == null) {
                missingStaffAccounts.add(user.getUsername());
                continue;
            }

            Set<Long> existingIds = new LinkedHashSet<>(
                staffModuleRepository.findModuleIdsByStaffId(staff.getId()));
            List<TestStaffModule> additions = new ArrayList<>();
            List<String> unknownNames = new ArrayList<>();
            for (String name : new LinkedHashSet<>(names)) {
                TestModuleConfig module = modulesByName.get(name);
                if (module == null) {
                    unknownNames.add(name);
                } else if (existingIds.add(module.getId())) {
                    additions.add(new TestStaffModule(staff.getId(), module.getId()));
                }
            }
            if (!unknownNames.isEmpty()) {
                unmatched.put(user.getUsername(), unknownNames);
            }
            if (!additions.isEmpty()) {
                staffModuleRepository.saveAll(additions);
                createdRelations += additions.size();
            }
        }

        return new LegacyModuleMigrationReport(
            createdRelations, duplicateNames, unmatched, missingStaffAccounts);
    }

    private Long requireStaffId(TestStaff staff) {
        if (staff == null || staff.getId() == null) {
            throw new BusinessException("STAFF_REQUIRED", "人员必须先保存");
        }
        return staff.getId();
    }

    private List<Long> distinctIds(List<Long> ids) {
        if (ids == null) {
            return List.of();
        }
        if (ids.stream().anyMatch(id -> id == null)) {
            throw new BusinessException("MODULE_REQUIRED", "人员熟悉模块不能为空");
        }
        return new ArrayList<>(new LinkedHashSet<>(ids));
    }

    private Map<Long, TestModuleConfig> loadRequestedModules(List<Long> moduleIds) {
        if (moduleIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, TestModuleConfig> modulesById = moduleRepository.findAllById(moduleIds).stream()
            .collect(Collectors.toMap(TestModuleConfig::getId, Function.identity()));
        if (modulesById.size() != moduleIds.size()) {
            throw new BusinessException("MODULE_NOT_FOUND", "人员熟悉模块不存在");
        }
        return modulesById;
    }

    private List<String> parseLegacyNames(String legacyText) {
        if (legacyText == null || legacyText.isBlank()) {
            return List.of();
        }
        return List.of(legacyText.split("[，,；;]", -1)).stream()
            .map(String::trim)
            .filter(name -> !name.isEmpty())
            .toList();
    }

    private List<String> duplicateNames(List<String> names) {
        Set<String> seen = new LinkedHashSet<>();
        Set<String> duplicates = new LinkedHashSet<>();
        for (String name : names) {
            if (!seen.add(name)) {
                duplicates.add(name);
            }
        }
        return new ArrayList<>(duplicates);
    }
}
