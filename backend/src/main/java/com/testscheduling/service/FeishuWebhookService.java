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
