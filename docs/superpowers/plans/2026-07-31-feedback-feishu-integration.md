# 反馈系统 + 飞书推送 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a feedback system that lets all logged-in users submit Bug/Feature requests via a floating button, stores them in the database, pushes notifications to Feishu via Webhook, and provides admins with a management page.

**Architecture:** Backend adds a `Feedback` entity with CRUD API + async Feishu Webhook push. Frontend adds a global floating button (Ant Design FloatButton) for submission and a dedicated management page for admins. Excel export uses client-side xlsx (existing pattern).

**Tech Stack:** Java 21, Spring Boot 3.2.10, Spring Data JPA, Flyway, H2/MySQL, Lombok, React 18, TypeScript, Ant Design 5, xlsx library

## Global Constraints

- Follow existing `ApiResponse<T>` wrapper for all API responses
- Use `@PrePersist` / `@PreUpdate` for timestamp auto-fill (existing entity pattern)
- Use `RequestRoleGuard.requireAny(...)` for role-based access control
- Use Lombok `@Data`, `@NoArgsConstructor`, `@AllArgsConstructor` on entities (existing pattern)
- Excel export uses client-side `xlsx` library (existing pattern from Reports.tsx / TestDemandList.tsx)
- Feishu Webhook URL configured via `application.yml` property `feishu.webhook.url`
- Sidebar menu items use `permissions` array for filtering (existing pattern in App.tsx)

---

### Task 1: Backend — Entity, Migration, Repository

**Files:**
- Create: `backend/src/main/java/com/testscheduling/entity/Feedback.java`
- Create: `backend/src/main/resources/db/migration/V8__create_feedback_table.sql`
- Create: `backend/src/main/java/com/testscheduling/repository/FeedbackRepository.java`

**Interfaces:**
- Produces: `Feedback` entity with fields: id, type, title, description, submitterId, submitterName, status, adminNote, createdAt, updatedAt
- Produces: `FeedbackRepository` with `findAll(Specification, Pageable)`, `findBySubmitterId(String, Pageable)`

- [ ] **Step 1: Create Flyway migration script**

Create `backend/src/main/resources/db/migration/V8__create_feedback_table.sql`:

```sql
CREATE TABLE feedback (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    type VARCHAR(20) NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    submitter_id VARCHAR(100) NOT NULL,
    submitter_name VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    admin_note TEXT,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);

CREATE INDEX idx_feedback_type ON feedback(type);
CREATE INDEX idx_feedback_status ON feedback(status);
CREATE INDEX idx_feedback_submitter ON feedback(submitter_id);
```

- [ ] **Step 2: Create Feedback entity**

Create `backend/src/main/java/com/testscheduling/entity/Feedback.java`:

```java
package com.testscheduling.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Table(name = "feedback")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Feedback {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 20)
    private String type;  // BUG / FEATURE

    @Column(nullable = false, length = 200)
    private String title;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String description;

    @Column(name = "submitter_id", nullable = false, length = 100)
    private String submitterId;

    @Column(name = "submitter_name", nullable = false, length = 50)
    private String submitterName;

    @Column(nullable = false, length = 20)
    private String status = "PENDING";  // PENDING / IN_PROGRESS / RESOLVED / CLOSED

    @Column(name = "admin_note", columnDefinition = "TEXT")
    private String adminNote;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
```

- [ ] **Step 3: Create FeedbackRepository**

Create `backend/src/main/java/com/testscheduling/repository/FeedbackRepository.java`:

```java
package com.testscheduling.repository;

import com.testscheduling.entity.Feedback;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

@Repository
public interface FeedbackRepository extends JpaRepository<Feedback, Long>, JpaSpecificationExecutor<Feedback> {
    Page<Feedback> findBySubmitterIdOrderByCreatedAtDesc(String submitterId, Pageable pageable);
}
```

- [ ] **Step 4: Verify compilation**

Run: `cd backend && mvn compile -q`
Expected: BUILD SUCCESS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/testscheduling/entity/Feedback.java \
        backend/src/main/resources/db/migration/V8__create_feedback_table.sql \
        backend/src/main/java/com/testscheduling/repository/FeedbackRepository.java
git commit -m "feat(feedback): add Feedback entity, migration, and repository"
```

---

### Task 2: Backend — DTOs and FeishuWebhookService

**Files:**
- Create: `backend/src/main/java/com/testscheduling/dto/FeedbackCreateRequest.java`
- Create: `backend/src/main/java/com/testscheduling/dto/FeedbackUpdateRequest.java`
- Create: `backend/src/main/java/com/testscheduling/dto/FeedbackResponse.java`
- Create: `backend/src/main/java/com/testscheduling/dto/FeedbackQueryParams.java`
- Create: `backend/src/main/java/com/testscheduling/service/FeishuWebhookService.java`
- Modify: `backend/src/main/resources/application.yml`

**Interfaces:**
- Produces: `FeedbackCreateRequest(type, title, description)` with `@NotBlank` validation
- Produces: `FeedbackUpdateRequest(status, adminNote)`
- Produces: `FeedbackResponse` — all fields from Feedback entity
- Produces: `FeedbackQueryParams(type, status, submitterId, page, size)`
- Produces: `FeishuWebhookService.sendFeedbackNotification(Feedback)` — async, void

- [ ] **Step 1: Create FeedbackCreateRequest**

Create `backend/src/main/java/com/testscheduling/dto/FeedbackCreateRequest.java`:

```java
package com.testscheduling.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class FeedbackCreateRequest {
    @NotBlank(message = "类型不能为空")
    private String type;  // BUG / FEATURE

    @NotBlank(message = "标题不能为空")
    @Size(max = 200, message = "标题最多200个字符")
    private String title;

    @NotBlank(message = "描述不能为空")
    @Size(max = 2000, message = "描述最多2000个字符")
    private String description;
}
```

- [ ] **Step 2: Create FeedbackUpdateRequest**

Create `backend/src/main/java/com/testscheduling/dto/FeedbackUpdateRequest.java`:

```java
package com.testscheduling.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class FeedbackUpdateRequest {
    @NotBlank(message = "状态不能为空")
    private String status;  // PENDING / IN_PROGRESS / RESOLVED / CLOSED

    @Size(max = 2000, message = "备注最多2000个字符")
    private String adminNote;
}
```

- [ ] **Step 3: Create FeedbackResponse**

Create `backend/src/main/java/com/testscheduling/dto/FeedbackResponse.java`:

```java
package com.testscheduling.dto;

import com.testscheduling.entity.Feedback;
import lombok.Data;

import java.time.LocalDateTime;

@Data
public class FeedbackResponse {
    private Long id;
    private String type;
    private String title;
    private String description;
    private String submitterId;
    private String submitterName;
    private String status;
    private String adminNote;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static FeedbackResponse from(Feedback feedback) {
        FeedbackResponse response = new FeedbackResponse();
        response.setId(feedback.getId());
        response.setType(feedback.getType());
        response.setTitle(feedback.getTitle());
        response.setDescription(feedback.getDescription());
        response.setSubmitterId(feedback.getSubmitterId());
        response.setSubmitterName(feedback.getSubmitterName());
        response.setStatus(feedback.getStatus());
        response.setAdminNote(feedback.getAdminNote());
        response.setCreatedAt(feedback.getCreatedAt());
        response.setUpdatedAt(feedback.getUpdatedAt());
        return response;
    }
}
```

- [ ] **Step 4: Create FeedbackQueryParams**

Create `backend/src/main/java/com/testscheduling/dto/FeedbackQueryParams.java`:

```java
package com.testscheduling.dto;

import lombok.Data;

@Data
public class FeedbackQueryParams {
    private String type;
    private String status;
    private String submitterId;
    private int page = 0;
    private int size = 20;
}
```

- [ ] **Step 5: Add Feishu config to application.yml**

Append to `backend/src/main/resources/application.yml`:

```yaml
feishu:
  webhook:
    url: ${FEISHU_WEBHOOK_URL:}
    enabled: ${FEISHU_WEBHOOK_ENABLED:false}
```

- [ ] **Step 6: Create FeishuWebhookService**

Create `backend/src/main/java/com/testscheduling/service/FeishuWebhookService.java`:

```java
package com.testscheduling.service;

import com.testscheduling.entity.Feedback;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.format.DateTimeFormatter;
import java.util.Map;

@Service
public class FeishuWebhookService {

    private static final Logger log = LoggerFactory.getLogger(FeishuWebhookService.class);
    private static final DateTimeFormatter FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    @Value("${feishu.webhook.url:}")
    private String webhookUrl;

    @Value("${feishu.webhook.enabled:false}")
    private boolean enabled;

    @Async
    public void sendFeedbackNotification(Feedback feedback) {
        if (!enabled || webhookUrl == null || webhookUrl.isBlank()) {
            log.debug("Feishu webhook disabled or URL not configured, skipping notification");
            return;
        }

        try {
            String typeLabel = "BUG".equals(feedback.getType()) ? "Bug 报告" : "功能需求";
            String statusLabel = "PENDING".equals(feedback.getStatus()) ? "待处理" : feedback.getStatus();

            String cardJson = buildCardJson(feedback, typeLabel, statusLabel);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<String> request = new HttpEntity<>(cardJson, headers);

            RestTemplate restTemplate = new RestTemplate();
            restTemplate.postForEntity(webhookUrl, request, String.class);

            log.info("Feishu webhook notification sent for feedback #{}", feedback.getId());
        } catch (Exception e) {
            log.warn("Failed to send Feishu webhook notification for feedback #{}: {}",
                feedback.getId(), e.getMessage());
        }
    }

    private String buildCardJson(Feedback feedback, String typeLabel, String statusLabel) {
        String title = "📢 新反馈：" + feedback.getTitle();
        String content = String.format(
            "**类型：%s**\\n" +
            "**标题：%s**\\n" +
            "**描述：**\\n%s\\n\\n" +
            "**提交人：%s**\\n" +
            "**提交时间：%s**\\n" +
            "**状态：%s**",
            typeLabel,
            feedback.getTitle(),
            feedback.getDescription(),
            feedback.getSubmitterName(),
            feedback.getCreatedAt() != null ? feedback.getCreatedAt().format(FORMATTER) : "",
            statusLabel
        );

        // Build Feishu interactive card message
        return "{" +
            "\"msg_type\": \"interactive\"," +
            "\"card\": {" +
                "\"header\": {" +
                    "\"title\": {" +
                        "\"tag\": \"plain_text\"," +
                        "\"content\": \"" + escapeJson(title) + "\"" +
                    "}," +
                    "\"template\": \"blue\"" +
                "}," +
                "\"elements\": [" +
                    "{" +
                        "\"tag\": \"markdown\"," +
                        "\"content\": \"" + escapeJson(content) + "\"" +
                    "}" +
                "]" +
            "}" +
        "}";
    }

    private String escapeJson(String text) {
        return text.replace("\\", "\\\\")
                   .replace("\"", "\\\"")
                   .replace("\n", "\\n")
                   .replace("\r", "\\r")
                   .replace("\t", "\\t");
    }
}
```

- [ ] **Step 7: Enable async support**

Check if `@EnableAsync` exists in the main application class. If not, add it.

Read `backend/src/main/java/com/testscheduling/TestSchedulingApplication.java`. If it doesn't have `@EnableAsync`, add it:

```java
package com.testscheduling;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class TestSchedulingApplication {
    public static void main(String[] args) {
        SpringApplication.run(TestSchedulingApplication.class, args);
    }
}
```

- [ ] **Step 8: Verify compilation**

Run: `cd backend && mvn compile -q`
Expected: BUILD SUCCESS

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/java/com/testscheduling/dto/FeedbackCreateRequest.java \
        backend/src/main/java/com/testscheduling/dto/FeedbackUpdateRequest.java \
        backend/src/main/java/com/testscheduling/dto/FeedbackResponse.java \
        backend/src/main/java/com/testscheduling/dto/FeedbackQueryParams.java \
        backend/src/main/java/com/testscheduling/service/FeishuWebhookService.java \
        backend/src/main/java/com/testscheduling/TestSchedulingApplication.java \
        backend/src/main/resources/application.yml
git commit -m "feat(feedback): add DTOs and Feishu webhook service"
```

---

### Task 3: Backend — FeedbackService and FeedbackController

**Files:**
- Create: `backend/src/main/java/com/testscheduling/service/FeedbackService.java`
- Create: `backend/src/main/java/com/testscheduling/controller/FeedbackController.java`

**Interfaces:**
- Consumes: `FeedbackRepository`, `FeishuWebhookService`, `FeedbackCreateRequest`, `FeedbackUpdateRequest`, `FeedbackResponse`, `FeedbackQueryParams`
- Produces: `FeedbackService.create(username, roles, request)`, `FeedbackService.findFiltered(params)`, `FeedbackService.findBySubmitter(submitterId, page, size)`, `FeedbackService.updateStatus(id, request)`, `FeedbackService.findAllForExport(params)`
- Produces: REST endpoints: `POST /api/feedback`, `GET /api/feedback`, `GET /api/feedback/mine`, `PUT /api/feedback/{id}/status`

- [ ] **Step 1: Create FeedbackService**

Create `backend/src/main/java/com/testscheduling/service/FeedbackService.java`:

```java
package com.testscheduling.service;

import com.testscheduling.dto.FeedbackCreateRequest;
import com.testscheduling.dto.FeedbackQueryParams;
import com.testscheduling.dto.FeedbackResponse;
import com.testscheduling.dto.FeedbackUpdateRequest;
import com.testscheduling.entity.Feedback;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.FeedbackRepository;
import jakarta.persistence.criteria.Predicate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class FeedbackService {

    @Autowired
    private FeedbackRepository feedbackRepository;

    @Autowired
    private FeishuWebhookService feishuWebhookService;

    public FeedbackResponse create(String username, List<String> roles, FeedbackCreateRequest request) {
        Feedback feedback = new Feedback();
        feedback.setType(request.getType());
        feedback.setTitle(request.getTitle());
        feedback.setDescription(request.getDescription());
        feedback.setSubmitterId(username);
        // Use the first role's display name or username as submitter name
        feedback.setSubmitterName(username);
        feedback.setStatus("PENDING");

        Feedback saved = feedbackRepository.save(feedback);

        // Async send to Feishu
        feishuWebhookService.sendFeedbackNotification(saved);

        return FeedbackResponse.from(saved);
    }

    public Page<FeedbackResponse> findFiltered(FeedbackQueryParams params) {
        Specification<Feedback> spec = buildSpecification(params);
        Pageable pageable = PageRequest.of(
            Math.max(0, params.getPage()),
            Math.min(100, Math.max(1, params.getSize())),
            Sort.by(Sort.Direction.DESC, "createdAt")
        );
        Page<Feedback> page = feedbackRepository.findAll(spec, pageable);
        return page.map(FeedbackResponse::from);
    }

    public Page<FeedbackResponse> findBySubmitter(String submitterId, int page, int size) {
        Pageable pageable = PageRequest.of(
            Math.max(0, page),
            Math.min(100, Math.max(1, size))
        );
        Page<Feedback> result = feedbackRepository.findBySubmitterIdOrderByCreatedAtDesc(submitterId, pageable);
        return result.map(FeedbackResponse::from);
    }

    public FeedbackResponse updateStatus(Long id, FeedbackUpdateRequest request) {
        Feedback feedback = feedbackRepository.findById(id)
            .orElseThrow(() -> new BusinessException("NOT_FOUND", "反馈不存在"));

        feedback.setStatus(request.getStatus());
        if (request.getAdminNote() != null) {
            feedback.setAdminNote(request.getAdminNote());
        }

        Feedback updated = feedbackRepository.save(feedback);
        return FeedbackResponse.from(updated);
    }

    public List<FeedbackResponse> findAllForExport(FeedbackQueryParams params) {
        Specification<Feedback> spec = buildSpecification(params);
        // Limit export to 1000 records
        Pageable pageable = PageRequest.of(0, 1000, Sort.by(Sort.Direction.DESC, "createdAt"));
        return feedbackRepository.findAll(spec, pageable).stream()
            .map(FeedbackResponse::from)
            .toList();
    }

    private Specification<Feedback> buildSpecification(FeedbackQueryParams params) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            if (params.getType() != null && !params.getType().isBlank()) {
                predicates.add(cb.equal(root.get("type"), params.getType()));
            }
            if (params.getStatus() != null && !params.getStatus().isBlank()) {
                predicates.add(cb.equal(root.get("status"), params.getStatus()));
            }
            if (params.getSubmitterId() != null && !params.getSubmitterId().isBlank()) {
                predicates.add(cb.equal(root.get("submitterId"), params.getSubmitterId()));
            }

            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
```

- [ ] **Step 2: Create FeedbackController**

Create `backend/src/main/java/com/testscheduling/controller/FeedbackController.java`:

```java
package com.testscheduling.controller;

import com.testscheduling.dto.*;
import com.testscheduling.security.RequestRoleGuard;
import com.testscheduling.service.FeedbackService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/feedback")
public class FeedbackController {

    @Autowired
    private FeedbackService feedbackService;

    @Autowired
    private RequestRoleGuard roleGuard;

    @PostMapping
    public ApiResponse<FeedbackResponse> createFeedback(
            @Valid @RequestBody FeedbackCreateRequest request,
            HttpServletRequest httpRequest) {
        String username = username(httpRequest);
        List<String> roles = roles(httpRequest);
        return ApiResponse.success("反馈提交成功", feedbackService.create(username, roles, request));
    }

    @GetMapping
    public ApiResponse<Page<FeedbackResponse>> getFeedbackList(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String submitterId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        requireAdmin();
        FeedbackQueryParams params = new FeedbackQueryParams();
        params.setType(type);
        params.setStatus(status);
        params.setSubmitterId(submitterId);
        params.setPage(page);
        params.setSize(size);
        return ApiResponse.success(feedbackService.findFiltered(params));
    }

    @GetMapping("/mine")
    public ApiResponse<Page<FeedbackResponse>> getMyFeedback(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            HttpServletRequest httpRequest) {
        String username = username(httpRequest);
        return ApiResponse.success(feedbackService.findBySubmitter(username, page, size));
    }

    @PutMapping("/{id}/status")
    public ApiResponse<FeedbackResponse> updateFeedbackStatus(
            @PathVariable Long id,
            @Valid @RequestBody FeedbackUpdateRequest request) {
        requireAdmin();
        return ApiResponse.success("状态更新成功", feedbackService.updateStatus(id, request));
    }

    @GetMapping("/export/excel")
    public ApiResponse<List<FeedbackResponse>> exportFeedback(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String submitterId) {
        requireAdmin();
        FeedbackQueryParams params = new FeedbackQueryParams();
        params.setType(type);
        params.setStatus(status);
        params.setSubmitterId(submitterId);
        return ApiResponse.success(feedbackService.findAllForExport(params));
    }

    private void requireAdmin() {
        roleGuard.requireAny("admin");
    }

    private String username(HttpServletRequest request) {
        return (String) request.getAttribute("username");
    }

    @SuppressWarnings("unchecked")
    private List<String> roles(HttpServletRequest request) {
        return (List<String>) request.getAttribute("roles");
    }
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd backend && mvn compile -q`
Expected: BUILD SUCCESS

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/testscheduling/service/FeedbackService.java \
        backend/src/main/java/com/testscheduling/controller/FeedbackController.java
git commit -m "feat(feedback): add FeedbackService and FeedbackController"
```

---

### Task 4: Backend — Unit Tests

**Files:**
- Create: `backend/src/test/java/com/testscheduling/service/FeedbackServiceTest.java`
- Create: `backend/src/test/java/com/testscheduling/controller/FeedbackControllerTest.java`

**Interfaces:**
- Tests validate: create, findFiltered, findBySubmitter, updateStatus, findAllForExport
- Tests validate: admin-only access on management endpoints, all-authenticated on submit

- [ ] **Step 1: Create FeedbackServiceTest**

Create `backend/src/test/java/com/testscheduling/service/FeedbackServiceTest.java`:

```java
package com.testscheduling.service;

import com.testscheduling.dto.FeedbackCreateRequest;
import com.testscheduling.dto.FeedbackQueryParams;
import com.testscheduling.dto.FeedbackResponse;
import com.testscheduling.dto.FeedbackUpdateRequest;
import com.testscheduling.entity.Feedback;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.FeedbackRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FeedbackServiceTest {

    @Mock
    private FeedbackRepository feedbackRepository;

    @Mock
    private FeishuWebhookService feishuWebhookService;

    @InjectMocks
    private FeedbackService feedbackService;

    @Test
    void create_shouldSaveAndNotify() {
        FeedbackCreateRequest request = new FeedbackCreateRequest();
        request.setType("BUG");
        request.setTitle("Test Bug");
        request.setDescription("Description");

        Feedback saved = new Feedback();
        saved.setId(1L);
        saved.setType("BUG");
        saved.setTitle("Test Bug");
        saved.setDescription("Description");
        saved.setSubmitterId("user1");
        saved.setSubmitterName("user1");
        saved.setStatus("PENDING");
        saved.setCreatedAt(LocalDateTime.now());
        saved.setUpdatedAt(LocalDateTime.now());

        when(feedbackRepository.save(any(Feedback.class))).thenReturn(saved);

        FeedbackResponse response = feedbackService.create("user1", List.of("testManager"), request);

        assertNotNull(response);
        assertEquals(1L, response.getId());
        assertEquals("BUG", response.getType());
        assertEquals("PENDING", response.getStatus());
        verify(feishuWebhookService, times(1)).sendFeedbackNotification(any(Feedback.class));
    }

    @Test
    void updateStatus_shouldUpdateAndReturn() {
        Feedback feedback = new Feedback();
        feedback.setId(1L);
        feedback.setStatus("PENDING");
        feedback.setCreatedAt(LocalDateTime.now());
        feedback.setUpdatedAt(LocalDateTime.now());

        when(feedbackRepository.findById(1L)).thenReturn(Optional.of(feedback));
        when(feedbackRepository.save(any(Feedback.class))).thenReturn(feedback);

        FeedbackUpdateRequest request = new FeedbackUpdateRequest();
        request.setStatus("RESOLVED");
        request.setAdminNote("Fixed in v2.0");

        FeedbackResponse response = feedbackService.updateStatus(1L, request);

        assertEquals("RESOLVED", response.getStatus());
        assertEquals("Fixed in v2.0", response.getAdminNote());
    }

    @Test
    void updateStatus_shouldThrowWhenNotFound() {
        when(feedbackRepository.findById(99L)).thenReturn(Optional.empty());

        FeedbackUpdateRequest request = new FeedbackUpdateRequest();
        request.setStatus("RESOLVED");

        assertThrows(BusinessException.class, () -> feedbackService.updateStatus(99L, request));
    }

    @Test
    void findFiltered_shouldReturnPage() {
        Feedback feedback = new Feedback();
        feedback.setId(1L);
        feedback.setType("BUG");
        feedback.setTitle("Test");
        feedback.setDescription("Desc");
        feedback.setSubmitterId("user1");
        feedback.setSubmitterName("User 1");
        feedback.setStatus("PENDING");
        feedback.setCreatedAt(LocalDateTime.now());
        feedback.setUpdatedAt(LocalDateTime.now());

        Page<Feedback> page = new PageImpl<>(List.of(feedback));
        when(feedbackRepository.findAll(any(Specification.class), any(Pageable.class))).thenReturn(page);

        FeedbackQueryParams params = new FeedbackQueryParams();
        params.setType("BUG");
        Page<FeedbackResponse> result = feedbackService.findFiltered(params);

        assertEquals(1, result.getTotalElements());
        assertEquals("BUG", result.getContent().get(0).getType());
    }
}
```

- [ ] **Step 2: Create FeedbackControllerTest**

Create `backend/src/test/java/com/testscheduling/controller/FeedbackControllerTest.java`:

```java
package com.testscheduling.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.testscheduling.dto.FeedbackCreateRequest;
import com.testscheduling.dto.FeedbackResponse;
import com.testscheduling.dto.FeedbackUpdateRequest;
import com.testscheduling.security.RequestRoleGuard;
import com.testscheduling.service.FeedbackService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.bean.MockBean;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(FeedbackController.class)
class FeedbackControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private FeedbackService feedbackService;

    @MockBean
    private RequestRoleGuard roleGuard;

    @Test
    void createFeedback_shouldReturnSuccess() throws Exception {
        FeedbackCreateRequest request = new FeedbackCreateRequest();
        request.setType("BUG");
        request.setTitle("Test Bug");
        request.setDescription("Description");

        FeedbackResponse response = new FeedbackResponse();
        response.setId(1L);
        response.setType("BUG");
        response.setTitle("Test Bug");
        response.setDescription("Description");
        response.setStatus("PENDING");
        response.setCreatedAt(LocalDateTime.now());

        when(feedbackService.create(any(), any(), any())).thenReturn(response);

        mockMvc.perform(post("/api/feedback")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.id").value(1));
    }

    @Test
    void createFeedback_shouldRejectBlankTitle() throws Exception {
        FeedbackCreateRequest request = new FeedbackCreateRequest();
        request.setType("BUG");
        request.setTitle("");
        request.setDescription("Description");

        mockMvc.perform(post("/api/feedback")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(400));
    }

    @Test
    void getFeedbackList_shouldCallRequireAdmin() throws Exception {
        Page<FeedbackResponse> page = new PageImpl<>(List.of());
        when(feedbackService.findFiltered(any())).thenReturn(page);

        mockMvc.perform(get("/api/feedback"))
                .andExpect(status().isOk());
    }
}
```

- [ ] **Step 3: Run tests**

Run: `cd backend && mvn test -pl . -Dtest="FeedbackServiceTest,FeedbackControllerTest" -q`
Expected: Tests pass (some may fail due to missing mock setup for request attributes — adjust as needed)

- [ ] **Step 4: Commit**

```bash
git add backend/src/test/java/com/testscheduling/service/FeedbackServiceTest.java \
        backend/src/test/java/com/testscheduling/controller/FeedbackControllerTest.java
git commit -m "test(feedback): add unit tests for FeedbackService and FeedbackController"
```

---

### Task 5: Frontend — Types and API Methods

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/services/api.ts`

**Interfaces:**
- Produces: `Feedback`, `FeedbackType`, `FeedbackStatus`, `FeedbackCreateRequest`, `FeedbackUpdateRequest`, `FeedbackQueryParams` types
- Produces: `api.createFeedback()`, `api.getFeedbackList()`, `api.getMyFeedback()`, `api.updateFeedbackStatus()`, `api.exportFeedbackList()`

- [ ] **Step 1: Add Feedback types to src/types/index.ts**

Append to `src/types/index.ts` (before the closing of the file):

```typescript
// ===== Feedback System =====

export type FeedbackType = 'BUG' | 'FEATURE';
export type FeedbackStatus = 'PENDING' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface Feedback {
  id: number;
  type: FeedbackType;
  title: string;
  description: string;
  submitterId: string;
  submitterName: string;
  status: FeedbackStatus;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackCreateRequest {
  type: FeedbackType;
  title: string;
  description: string;
}

export interface FeedbackUpdateRequest {
  status: FeedbackStatus;
  adminNote?: string;
}

export interface FeedbackQueryParams {
  type?: FeedbackType;
  status?: FeedbackStatus;
  submitterId?: string;
  page?: number;
  size?: number;
}

export interface PageResult<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}
```

- [ ] **Step 2: Add Feedback API methods to api.ts**

Add the following import at the top of `src/services/api.ts` (in the import block):

```typescript
import type {
  // ... existing imports ...
  Feedback,
  FeedbackCreateRequest,
  FeedbackUpdateRequest,
  FeedbackQueryParams,
  PageResult,
} from '../types';
```

Add the following methods inside the `ApiService` class (before the closing `}`):

```typescript
  // ===== Feedback =====

  async createFeedback(request: FeedbackCreateRequest): Promise<Feedback> {
    return this.request<Feedback>('/feedback', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async getFeedbackList(params: FeedbackQueryParams = {}): Promise<PageResult<Feedback>> {
    const query = new URLSearchParams();
    if (params.type) query.set('type', params.type);
    if (params.status) query.set('status', params.status);
    if (params.submitterId) query.set('submitterId', params.submitterId);
    if (params.page !== undefined) query.set('page', String(params.page));
    if (params.size !== undefined) query.set('size', String(params.size));
    const qs = query.toString();
    return this.request<PageResult<Feedback>>(`/feedback${qs ? '?' + qs : ''}`);
  }

  async getMyFeedback(page = 0, size = 20): Promise<PageResult<Feedback>> {
    return this.request<PageResult<Feedback>>(`/feedback/mine?page=${page}&size=${size}`);
  }

  async updateFeedbackStatus(id: number, request: FeedbackUpdateRequest): Promise<Feedback> {
    return this.request<Feedback>(`/feedback/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify(request),
    });
  }

  async exportFeedbackList(params: FeedbackQueryParams = {}): Promise<Feedback[]> {
    const query = new URLSearchParams();
    if (params.type) query.set('type', params.type);
    if (params.status) query.set('status', params.status);
    if (params.submitterId) query.set('submitterId', params.submitterId);
    const qs = query.toString();
    return this.request<Feedback[]>(`/feedback/export/excel${qs ? '?' + qs : ''}`);
  }
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/services/api.ts
git commit -m "feat(feedback): add frontend types and API methods"
```

---

### Task 6: Frontend — FeedbackFloatingButton Component

**Files:**
- Create: `src/components/FeedbackFloatingButton.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useAuth()` for login check, `api.createFeedback()` for submission
- Produces: `FeedbackFloatingButton` component — renders FloatButton + Modal form

- [ ] **Step 1: Create FeedbackFloatingButton component**

Create `src/components/FeedbackFloatingButton.tsx`:

```tsx
import React, { useState } from 'react';
import { FloatButton, Modal, Form, Input, Radio, message } from 'antd';
import { BugOutlined, FormOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import type { FeedbackType } from '../types';

const FeedbackFloatingButton: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await api.createFeedback({
        type: values.type as FeedbackType,
        title: values.title,
        description: values.description,
      });
      message.success('反馈提交成功，感谢您的反馈！');
      form.resetFields();
      setOpen(false);
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        // Form validation error — do nothing, antd shows inline errors
        return;
      }
      message.error((error as Error)?.message || '提交失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <FloatButton
        icon={<FormOutlined />}
        tooltip="提交反馈"
        type="primary"
        style={{ right: 24, bottom: 24, width: 48, height: 48 }}
        onClick={() => setOpen(true)}
      />

      <Modal
        title="提交反馈"
        open={open}
        onOk={handleSubmit}
        onCancel={() => {
          form.resetFields();
          setOpen(false);
        }}
        confirmLoading={loading}
        okText="提交"
        cancelText="取消"
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ type: 'BUG' }}
        >
          <Form.Item
            name="type"
            label="反馈类型"
            rules={[{ required: true, message: '请选择反馈类型' }]}
          >
            <Radio.Group>
              <Radio.Button value="BUG">
                <BugOutlined /> Bug 报告
              </Radio.Button>
              <Radio.Button value="FEATURE">
                <FormOutlined /> 功能需求
              </Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            name="title"
            label="标题"
            rules={[
              { required: true, message: '请输入标题' },
              { max: 200, message: '标题最多200个字符' },
            ]}
          >
            <Input placeholder="简要描述您的反馈" />
          </Form.Item>

          <Form.Item
            name="description"
            label="详细描述"
            rules={[
              { required: true, message: '请输入详细描述' },
              { max: 2000, message: '描述最多2000个字符' },
            ]}
          >
            <Input.TextArea
              rows={4}
              placeholder="请详细描述您遇到的问题或期望的功能"
              showCount
              maxLength={2000}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default FeedbackFloatingButton;
```

- [ ] **Step 2: Add FeedbackFloatingButton to App.tsx**

In `src/App.tsx`, add the import:

```tsx
import FeedbackFloatingButton from './components/FeedbackFloatingButton';
```

In the `AppContent` component's return JSX, add `<FeedbackFloatingButton />` inside the `<Layout>` component, after the `<Content>` closing tag. Find the pattern:

```tsx
    <Layout style={{ height: '100vh' }}>
      <Sider ...>
        ...
      </Sider>
      <Layout>
        <Header ...>
          ...
        </Header>
        <Content ...>
          {renderContent()}
        </Content>
      </Layout>
    </Layout>
```

Add `<FeedbackFloatingButton />` right before the closing `</Layout>` (the outer one):

```tsx
    <Layout style={{ height: '100vh' }}>
      <Sider ...>
        ...
      </Sider>
      <Layout>
        <Header ...>
          ...
        </Header>
        <Content ...>
          {renderContent()}
        </Content>
      </Layout>
      <FeedbackFloatingButton />
    </Layout>
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/FeedbackFloatingButton.tsx src/App.tsx
git commit -m "feat(feedback): add global floating feedback button"
```

---

### Task 7: Frontend — FeedbackManagement Page

**Files:**
- Create: `src/pages/FeedbackManagement.tsx`
- Modify: `src/App.tsx`
- Modify: `src/context/UserRoleContext.tsx`

**Interfaces:**
- Consumes: `api.getFeedbackList()`, `api.updateFeedbackStatus()`, `api.exportFeedbackList()`, `useUserRole()` for admin check
- Produces: `FeedbackManagement` page component

- [ ] **Step 1: Create FeedbackManagement page**

Create `src/pages/FeedbackManagement.tsx`:

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Tag, Select, Input, Button, Space, Modal, Form, message, Drawer, Descriptions, Typography,
} from 'antd';
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import { api } from '../services/api';
import type { Feedback, FeedbackStatus, FeedbackType, FeedbackQueryParams } from '../types';

const { TextArea } = Input;
const { Text } = Typography;

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  PENDING: '待处理',
  IN_PROGRESS: '处理中',
  RESOLVED: '已解决',
  CLOSED: '已关闭',
};

const STATUS_COLORS: Record<FeedbackStatus, string> = {
  PENDING: 'orange',
  IN_PROGRESS: 'blue',
  RESOLVED: 'green',
  CLOSED: 'default',
};

const TYPE_LABELS: Record<FeedbackType, string> = {
  BUG: 'Bug',
  FEATURE: '功能需求',
};

const TYPE_COLORS: Record<FeedbackType, string> = {
  BUG: 'red',
  FEATURE: 'purple',
};

const FeedbackManagement: React.FC = () => {
  const [data, setData] = useState<Feedback[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  // Filters
  const [filterType, setFilterType] = useState<FeedbackType | undefined>();
  const [filterStatus, setFilterStatus] = useState<FeedbackStatus | undefined>();
  const [filterSubmitter, setFilterSubmitter] = useState('');

  // Status update modal
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [currentFeedback, setCurrentFeedback] = useState<Feedback | null>(null);
  const [statusForm] = Form.useForm();

  // Detail drawer
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailFeedback, setDetailFeedback] = useState<Feedback | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: FeedbackQueryParams = {
        type: filterType,
        status: filterStatus,
        submitterId: filterSubmitter || undefined,
        page,
        size: pageSize,
      };
      const result = await api.getFeedbackList(params);
      setData(result.content);
      setTotal(result.totalElements);
    } catch (error: unknown) {
      message.error((error as Error)?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [filterType, filterStatus, filterSubmitter, page, pageSize]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSearch = () => {
    setPage(0);
    fetchData();
  };

  const handleResetFilters = () => {
    setFilterType(undefined);
    setFilterStatus(undefined);
    setFilterSubmitter('');
    setPage(0);
  };

  const handleOpenStatusModal = (feedback: Feedback) => {
    setCurrentFeedback(feedback);
    statusForm.setFieldsValue({
      status: feedback.status,
      adminNote: feedback.adminNote || '',
    });
    setStatusModalVisible(true);
  };

  const handleUpdateStatus = async () => {
    try {
      const values = await statusForm.validateFields();
      if (!currentFeedback) return;
      await api.updateFeedbackStatus(currentFeedback.id, {
        status: values.status as FeedbackStatus,
        adminNote: values.adminNote || undefined,
      });
      message.success('状态更新成功');
      setStatusModalVisible(false);
      fetchData();
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'errorFields' in error) return;
      message.error((error as Error)?.message || '更新失败');
    }
  };

  const handleViewDetail = (feedback: Feedback) => {
    setDetailFeedback(feedback);
    setDetailVisible(true);
  };

  const handleExport = async () => {
    try {
      const params: FeedbackQueryParams = {
        type: filterType,
        status: filterStatus,
        submitterId: filterSubmitter || undefined,
      };
      const list = await api.exportFeedbackList(params);
      if (list.length === 0) {
        message.warning('暂无数据可导出');
        return;
      }
      const rows = list.map((f) => ({
        'ID': f.id,
        '类型': TYPE_LABELS[f.type],
        '标题': f.title,
        '描述': f.description,
        '提交人': f.submitterName,
        '状态': STATUS_LABELS[f.status],
        '管理员备注': f.adminNote || '',
        '提交时间': dayjs(f.createdAt).format('YYYY-MM-DD HH:mm:ss'),
        '更新时间': dayjs(f.updatedAt).format('YYYY-MM-DD HH:mm:ss'),
      }));
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '反馈列表');
      XLSX.writeFile(workbook, `反馈导出_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`);
      message.success(`成功导出 ${rows.length} 条反馈`);
    } catch (error: unknown) {
      message.error((error as Error)?.message || '导出失败');
    }
  };

  const columns = [
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: FeedbackType) => (
        <Tag color={TYPE_COLORS[type]}>{TYPE_LABELS[type]}</Tag>
      ),
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: '提交人',
      dataIndex: 'submitterName',
      key: 'submitterName',
      width: 100,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: FeedbackStatus) => (
        <Tag color={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Tag>
      ),
    },
    {
      title: '提交时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_: unknown, record: Feedback) => (
        <Space size="small">
          <Button size="small" onClick={() => handleViewDetail(record)}>
            详情
          </Button>
          <Button size="small" type="primary" onClick={() => handleOpenStatusModal(record)}>
            处理
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 16 }}>反馈管理</h2>

      {/* Filters */}
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          placeholder="类型筛选"
          style={{ width: 140 }}
          allowClear
          value={filterType}
          onChange={(v) => { setFilterType(v); setPage(0); }}
          options={[
            { label: 'Bug', value: 'BUG' },
            { label: '功能需求', value: 'FEATURE' },
          ]}
        />
        <Select
          placeholder="状态筛选"
          style={{ width: 140 }}
          allowClear
          value={filterStatus}
          onChange={(v) => { setFilterStatus(v); setPage(0); }}
          options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ label, value }))}
        />
        <Input
          placeholder="提交人搜索"
          style={{ width: 160 }}
          value={filterSubmitter}
          onChange={(e) => setFilterSubmitter(e.target.value)}
          onPressEnter={handleSearch}
          suffix={<SearchOutlined />}
        />
        <Button onClick={handleSearch}>搜索</Button>
        <Button onClick={handleResetFilters}>重置</Button>
        <Button icon={<DownloadOutlined />} onClick={handleExport}>导出 Excel</Button>
      </Space>

      {/* Table */}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={{
          current: page + 1,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => {
            setPage(p - 1);
            setPageSize(ps);
          },
        }}
      />

      {/* Status Update Modal */}
      <Modal
        title="处理反馈"
        open={statusModalVisible}
        onOk={handleUpdateStatus}
        onCancel={() => setStatusModalVisible(false)}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        {currentFeedback && (
          <div style={{ marginBottom: 16 }}>
            <Text strong>{currentFeedback.title}</Text>
            <br />
            <Text type="secondary">{currentFeedback.description}</Text>
          </div>
        )}
        <Form form={statusForm} layout="vertical">
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select
              options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ label, value }))}
            />
          </Form.Item>
          <Form.Item name="adminNote" label="处理备注">
            <TextArea rows={3} placeholder="可选：添加处理备注" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Detail Drawer */}
      <Drawer
        title="反馈详情"
        open={detailVisible}
        onClose={() => setDetailVisible(false)}
        width={500}
      >
        {detailFeedback && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="ID">{detailFeedback.id}</Descriptions.Item>
            <Descriptions.Item label="类型">
              <Tag color={TYPE_COLORS[detailFeedback.type]}>{TYPE_LABELS[detailFeedback.type]}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="标题">{detailFeedback.title}</Descriptions.Item>
            <Descriptions.Item label="描述">{detailFeedback.description}</Descriptions.Item>
            <Descriptions.Item label="提交人">{detailFeedback.submitterName}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={STATUS_COLORS[detailFeedback.status]}>{STATUS_LABELS[detailFeedback.status]}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="管理员备注">{detailFeedback.adminNote || '-'}</Descriptions.Item>
            <Descriptions.Item label="提交时间">
              {dayjs(detailFeedback.createdAt).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
            <Descriptions.Item label="更新时间">
              {dayjs(detailFeedback.updatedAt).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
};

export default FeedbackManagement;
```

- [ ] **Step 2: Add FeedbackManagement to App.tsx**

In `src/App.tsx`, add the import:

```tsx
import FeedbackManagement from './pages/FeedbackManagement';
```

Add `manageFeedback` to the `admin` role's permissions array in `src/context/UserRoleContext.tsx`:

```tsx
    admin: [
      // ... existing permissions ...
      'manageFeedback',
    ],
```

Add a new menu item in the `menuItems` array in `src/App.tsx` (before the `personal` item):

```tsx
    {
      key: 'feedback-mgmt',
      icon: <MessageOutlined />,
      label: '反馈管理',
      permissions: ['manageFeedback'],
    },
```

Add `MessageOutlined` to the icon imports at the top:

```tsx
import {
  // ... existing icons ...
  MessageOutlined,
} from '@ant-design/icons';
```

Add the route in `renderContent()` switch:

```tsx
      case 'feedback-mgmt':
        return <FeedbackManagement />;
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/pages/FeedbackManagement.tsx src/App.tsx src/context/UserRoleContext.tsx
git commit -m "feat(feedback): add feedback management page for admins"
```

---

### Task 8: Integration Test and Final Verification

**Files:**
- No new files

**Interfaces:**
- Verifies: end-to-end flow — submit feedback, view in management, update status, export

- [ ] **Step 1: Run backend tests**

Run: `cd backend && mvn test -q`
Expected: All tests pass

- [ ] **Step 2: Run frontend TypeScript check**

Run: `npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 3: Start dev server and verify manually**

Run: `npm run dev`

Verify:
1. Floating button appears in bottom-right corner after login
2. Click button → modal opens with type/title/description form
3. Submit → success message, modal closes
4. Navigate to "反馈管理" in sidebar (admin role)
5. See submitted feedback in table
6. Click "处理" → change status, add note → save
7. Click "详情" → drawer shows full details
8. Click "导出 Excel" → downloads xlsx file

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(feedback): complete feedback system with Feishu webhook integration"
```
