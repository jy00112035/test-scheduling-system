package com.testscheduling.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "users")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String username;

    @Column(nullable = false)
    private String password;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "user_roles", joinColumns = @JoinColumn(name = "user_id"))
    @Column(name = "role", nullable = false)
    private List<String> roles = new ArrayList<>();

    private String displayName;

    private String testType;

    @Column(length = 500)
    private String familiarModules;

    @Column
    private Boolean confidentialClearance = false;

    private Boolean enabled = true;

    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }

    public String getRole() {
        return (roles != null && !roles.isEmpty()) ? roles.get(0) : null;
    }

    public void setRole(String role) {
        if (roles == null) roles = new ArrayList<>();
        if (role != null && !role.isEmpty()) {
            if (roles.isEmpty()) roles.add(role);
            else roles.set(0, role);
        }
    }
}
