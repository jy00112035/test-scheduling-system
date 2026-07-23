package com.testscheduling.service;

import com.testscheduling.dto.LoginRequest;
import com.testscheduling.dto.LoginResponse;
import com.testscheduling.dto.RegisterRequest;
import com.testscheduling.entity.User;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.UserRepository;
import com.testscheduling.util.JwtUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
public class AuthService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtUtil jwtUtil;

    public LoginResponse login(LoginRequest request) {
        User user = userRepository.findByUsername(request.getUsername())
            .orElseThrow(() -> new RuntimeException("用户名或密码错误"));

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new RuntimeException("用户名或密码错误");
        }

        if (!user.getEnabled()) {
            throw new RuntimeException("账户已被禁用，请等待管理员审批");
        }

        String token = jwtUtil.generateToken(user.getUsername(), user.getRoles());

        return new LoginResponse(
            token,
            user.getUsername(),
            user.getRole(),
            user.getRoles(),
            user.getDisplayName(),
            user.getTestType()
        );
    }

    public void changePassword(String username, String oldPassword, String newPassword) {
        User user = userRepository.findByUsername(username)
            .orElseThrow(() -> new RuntimeException("用户不存在"));

        if (!passwordEncoder.matches(oldPassword, user.getPassword())) {
            throw new RuntimeException("原密码错误");
        }

        user.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(user);
    }

    public void register(RegisterRequest request) {
        if (!request.getPassword().equals(request.getConfirmPassword())) {
            throw new RuntimeException("两次输入的密码不一致");
        }

        if (userRepository.existsByUsername(request.getUsername())) {
            throw new RuntimeException("该用户名已被注册");
        }

        User user = new User();
        user.setUsername(request.getUsername());
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setDisplayName(request.getDisplayName());
        user.setFamiliarModules(request.getFamiliarModules());

        // 设置测试类型
        if (request.getTestType() != null && !request.getTestType().isEmpty()) {
            user.setTestType(request.getTestType());
        }

        if (request.getRoles() != null && !request.getRoles().isEmpty()) {
            user.setRoles(request.getRoles());
        } else {
            user.setRole(request.getRole());
        }
        user.setEnabled(false);
        userRepository.save(user);
    }

    public List<User> getPendingApprovals(List<String> approverRoles, String approverUsername) {
        // admin：审批字段管理员和项目经理
        if (approverRoles.contains("admin")) {
            return userRepository.findPendingByRoles(List.of("fieldAdmin", "projectManager"));
        }

        // 项目经理：审批测试经理、资源经理、测试组长
        if (approverRoles.contains("projectManager")) {
            return userRepository.findPendingByRoles(List.of("testManager", "resourceManager", "testLead"));
        }

        // 资源经理 + 测试组长（双角色）：合并两者的审批范围
        if (approverRoles.contains("resourceManager") && approverRoles.contains("testLead")) {
            User approver = userRepository.findByUsername(approverUsername)
                .orElseThrow(() -> new RuntimeException("审批人不存在"));
            List<User> result = new ArrayList<>(userRepository.findPendingTestExecutors());
            String approverTestType = approver.getTestType();
            if (approverTestType != null && !approverTestType.isEmpty()) {
                List<User> byTestType = userRepository.findPendingTestExecutorsByTestType(approverTestType);
                for (User u : byTestType) {
                    if (result.stream().noneMatch(existing -> existing.getId().equals(u.getId()))) {
                        result.add(u);
                    }
                }
            }
            return result;
        }

        // 资源经理：审批所有测试执行人员（不过滤testType）
        if (approverRoles.contains("resourceManager")) {
            return userRepository.findPendingTestExecutors();
        }

        // 测试组长：审批同testType的测试执行人员
        if (approverRoles.contains("testLead")) {
            User approver = userRepository.findByUsername(approverUsername)
                .orElseThrow(() -> new RuntimeException("审批人不存在"));
            String approverTestType = approver.getTestType();
            if (approverTestType == null || approverTestType.isEmpty()) {
                return new ArrayList<>();
            }
            return userRepository.findPendingTestExecutorsByTestType(approverTestType);
        }

        return new ArrayList<>();
    }

    @Transactional
    public void approveUser(Long id, List<String> approverRoles, String approverUsername) {
        User user = requireApprovalTarget(id, approverRoles, approverUsername);
        user.setEnabled(true);
        userRepository.save(user);
    }

    @Transactional
    public void rejectUser(Long id, List<String> approverRoles, String approverUsername) {
        User user = requireApprovalTarget(id, approverRoles, approverUsername);
        userRepository.delete(user);
    }

    @Transactional
    public void batchApprove(
            List<Long> ids, List<String> approverRoles, String approverUsername) {
        List<User> users = requireApprovalTargets(ids, approverRoles, approverUsername);
        for (User user : users) {
            user.setEnabled(true);
            userRepository.save(user);
        }
    }

    @Transactional
    public void batchReject(
            List<Long> ids, List<String> approverRoles, String approverUsername) {
        userRepository.deleteAll(requireApprovalTargets(ids, approverRoles, approverUsername));
    }

    private List<User> requireApprovalTargets(
            Collection<Long> ids, List<String> approverRoles, String approverUsername) {
        if (ids == null || ids.isEmpty() || ids.stream().anyMatch(java.util.Objects::isNull)) {
            throw approvalForbidden();
        }
        List<User> users = ids.stream().distinct().sorted()
            .map(id -> requireApprovalTarget(id, approverRoles, approverUsername))
            .toList();
        if (users.size() != new HashSet<>(ids).size()) {
            throw approvalForbidden();
        }
        return users;
    }

    private User requireApprovalTarget(
            Long id, List<String> approverRoles, String approverUsername) {
        if (approverRoles == null || approverRoles.isEmpty()) {
            throw approvalForbidden();
        }
        User target = userRepository.findById(id)
            .orElseThrow(this::approvalForbidden);
        if (Boolean.TRUE.equals(target.getEnabled())) {
            throw approvalForbidden();
        }
        Set<String> targetRoles = target.getRoles() == null
            ? Set.of() : new HashSet<>(target.getRoles());
        if (approverRoles.contains("admin")
                && onlyContains(targetRoles, Set.of("fieldAdmin", "projectManager"))) {
            return target;
        }
        if (approverRoles.contains("projectManager")
                && onlyContains(targetRoles,
                    Set.of("testManager", "resourceManager", "testLead"))) {
            return target;
        }
        if (approverRoles.contains("resourceManager")
                && onlyContains(targetRoles, Set.of("testExecutor"))) {
            return target;
        }
        if (approverRoles.contains("testLead")
                && onlyContains(targetRoles, Set.of("testExecutor"))) {
            User approver = userRepository.findByUsername(approverUsername)
                .orElseThrow(this::approvalForbidden);
            if (approver.getTestType() != null
                    && approver.getTestType().equals(target.getTestType())) {
                return target;
            }
        }
        throw approvalForbidden();
    }

    private boolean onlyContains(Set<String> requested, Set<String> allowed) {
        return !requested.isEmpty() && allowed.containsAll(requested);
    }

    private BusinessException approvalForbidden() {
        return new BusinessException("APPROVAL_SCOPE_FORBIDDEN", "无权审批该注册申请");
    }
}
