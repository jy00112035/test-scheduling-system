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
import jakarta.servlet.http.HttpServletRequest;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiResponse<ErrorData> handleBusinessException(BusinessException e) {
        return new ApiResponse<>(400, e.getMessage(), new ErrorData(e.getErrorCode()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiResponse<ErrorData> handleUnreadableRequest(
            HttpMessageNotReadableException e, HttpServletRequest request) {
        boolean batchPublish = "/api/schedules/batch-publish".equals(request.getRequestURI());
        String code = batchPublish ? "BATCH_PUBLISH_REQUEST_INVALID" : "REQUEST_BODY_INVALID";
        return new ApiResponse<>(400, "请求体格式无效", new ErrorData(code));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiResponse<ErrorData> handleValidationError(MethodArgumentNotValidException e) {
        return new ApiResponse<>(400, "请求参数校验失败",
            new ErrorData("REQUEST_VALIDATION_FAILED"));
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
