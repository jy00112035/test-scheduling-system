package com.testscheduling.config;

import com.testscheduling.dto.ApiResponse;
import com.testscheduling.dto.ErrorData;
import com.testscheduling.exception.BusinessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.bind.MethodArgumentNotValidException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiResponse<ErrorData> handleBusinessException(BusinessException e) {
        return new ApiResponse<>(400, e.getMessage(), new ErrorData(e.getErrorCode()));
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentNotValidException.class})
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiResponse<ErrorData> handleInvalidRequest(Exception e) {
        return new ApiResponse<>(400, "批量发布请求格式无效",
            new ErrorData("BATCH_PUBLISH_REQUEST_INVALID"));
    }

    @ExceptionHandler(RuntimeException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiResponse<Void> handleRuntimeException(RuntimeException e) {
        return ApiResponse.error(400, e.getMessage());
    }

    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ApiResponse<Void> handleException(Exception e) {
        return ApiResponse.error(500, "服务器内部错误: " + e.getMessage());
    }
}
