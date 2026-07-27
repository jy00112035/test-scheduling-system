package com.testscheduling.config;

import com.testscheduling.dto.ApiResponse;
import com.testscheduling.dto.ErrorData;
import com.testscheduling.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import static org.junit.jupiter.api.Assertions.assertEquals;

class GlobalExceptionHandlerTest {

    @Test
    void businessErrorResponseContainsStableErrorCode() {
        GlobalExceptionHandler handler = new GlobalExceptionHandler();

        ResponseEntity<ApiResponse<ErrorData>> responseEntity = handler.handleBusinessException(
            new BusinessException("MODULE_NAME_DUPLICATE", "模块名称已存在"));

        ApiResponse<ErrorData> response = responseEntity.getBody();
        assertEquals(400, response.getCode());
        assertEquals("模块名称已存在", response.getMessage());
        assertEquals("MODULE_NAME_DUPLICATE", response.getData().errorCode());
    }
}
