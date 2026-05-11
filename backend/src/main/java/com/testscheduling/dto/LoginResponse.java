package com.testscheduling.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;

@Data
@AllArgsConstructor
public class LoginResponse {
    private String token;
    private String username;
    private String role;
    private List<String> roles;
    private String displayName;
    private String testType;
}
