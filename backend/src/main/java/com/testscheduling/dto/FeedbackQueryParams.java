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
