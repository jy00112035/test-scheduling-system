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
