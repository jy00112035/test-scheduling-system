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
