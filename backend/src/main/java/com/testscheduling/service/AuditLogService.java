package com.testscheduling.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.testscheduling.entity.AuditLog;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.AuditLogRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@Service
public class AuditLogService {

    private static final String SYSTEM_OPERATOR = "system";

    private final AuditLogRepository repository;
    private final ObjectMapper objectMapper;

    public AuditLogService(AuditLogRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public AuditLog record(
            String actionType,
            String entityType,
            Object entityId,
            Object beforeValue,
            Object afterValue) {
        AuditLog log = new AuditLog();
        log.setActionType(actionType);
        log.setEntityType(entityType);
        log.setEntityId(String.valueOf(entityId));
        log.setOperatorName(currentOperator());
        log.setBeforeValue(serialize(beforeValue));
        log.setAfterValue(serialize(afterValue));
        return repository.save(log);
    }

    private String currentOperator() {
        RequestAttributes attributes = RequestContextHolder.getRequestAttributes();
        if (attributes instanceof ServletRequestAttributes servletAttributes) {
            HttpServletRequest request = servletAttributes.getRequest();
            Object username = request.getAttribute("username");
            if (username instanceof String value && !value.isBlank()) {
                return value;
            }
        }
        return SYSTEM_OPERATOR;
    }

    private String serialize(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new BusinessException("AUDIT_SERIALIZATION_FAILED", "审计日志序列化失败");
        }
    }
}
