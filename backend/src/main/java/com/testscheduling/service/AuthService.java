package com.testscheduling.service;

import com.testscheduling.dto.LoginRequest;
import com.testscheduling.dto.LoginResponse;
import com.testscheduling.dto.RegisterRequest;
import com.testscheduling.entity.User;
import com.testscheduling.repository.UserRepository;
import com.testscheduling.util.JwtUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

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

        // 设置所属测试组
        if (request.getTestGroup() != null && !request.getTestGroup().isEmpty()) {
            user.setTestGroup(request.getTestGroup());
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
        // 获取当前审批人信息
        User approver = userRepository.findByUsername(approverUsername)
            .orElseThrow(() -> new RuntimeException("审批人不存在"));

        if (approverRoles.contains("testLead") && approverRoles.contains("projectManager")) {
            // 同时是测试组长和项目经理，可以看到所有待审批
            return userRepository.findByEnabledFalse();
        } else if (approverRoles.contains("testLead")) {
            // 测试组长：只能看到自己负责的测试组的测试执行人员
            String approverTestGroup = approver.getTestGroup();
            if (approverTestGroup == null || approverTestGroup.isEmpty()) {
                return new ArrayList<>();
            }
            return userRepository.findPendingTestExecutorsByTestGroup(approverTestGroup);
        } else if (approverRoles.contains("projectManager")) {
            // 项目经理：可以看到除测试执行人员外的所有待审批
            List<User> all = userRepository.findByEnabledFalse();
            List<User> filtered = new ArrayList<>();
            for (User u : all) {
                if (!"testExecutor".equals(u.getRole())) {
                    filtered.add(u);
                }
            }
            return filtered;
        }
        return new ArrayList<>();
    }

    @Transactional
    public void approveUser(Long id) {
        User user = userRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("用户不存在"));
        user.setEnabled(true);
        userRepository.save(user);
    }

    @Transactional
    public void rejectUser(Long id) {
        userRepository.deleteById(id);
    }

    @Transactional
    public void batchApprove(List<Long> ids) {
        for (Long id : ids) {
            userRepository.findById(id).ifPresent(user -> {
                user.setEnabled(true);
                userRepository.save(user);
            });
        }
    }

    @Transactional
    public void batchReject(List<Long> ids) {
        userRepository.deleteAllById(ids);
    }
}
