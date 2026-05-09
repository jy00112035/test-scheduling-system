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

        String token = jwtUtil.generateToken(user.getUsername(), user.getRole());

        return new LoginResponse(
            token,
            user.getUsername(),
            user.getRole(),
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
        user.setRole(request.getRole());
        user.setEnabled(false);
        userRepository.save(user);
    }

    public List<User> getPendingApprovals(String approverRole) {
        if ("resourceManager".equals(approverRole)) {
            return userRepository.findByEnabledFalseAndRole("testExecutor");
        } else if ("projectManager".equals(approverRole)) {
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
