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
