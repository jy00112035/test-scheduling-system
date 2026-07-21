package com.testscheduling.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.testscheduling.entity.AuditLog;
import com.testscheduling.repository.AuditLogRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class AuditLogServiceTest {

    private final AuditLogRepository repository = mock(AuditLogRepository.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AuditLogService service = new AuditLogService(repository, objectMapper);

    @AfterEach
    void clearRequestContext() {
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    void recordsRequestUsernameAndSerializedValues() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setAttribute("username", "field-admin");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));

        service.record(
            "MODULE_UPDATED",
            "TEST_MODULE_CONFIG",
            11L,
            Map.of("enabled", true),
            Map.of("enabled", false));

        AuditLog log = capturedLog();
        assertEquals("MODULE_UPDATED", log.getActionType());
        assertEquals("TEST_MODULE_CONFIG", log.getEntityType());
        assertEquals("11", log.getEntityId());
        assertEquals("field-admin", log.getOperatorName());
        JsonNode before = objectMapper.readTree(log.getBeforeValue());
        JsonNode after = objectMapper.readTree(log.getAfterValue());
        assertEquals(true, before.get("enabled").booleanValue());
        assertEquals(false, after.get("enabled").booleanValue());
    }

    @Test
    void usesSystemFallbackAndPreservesNullSnapshotsOutsideRequest() {
        service.record("MODULE_CREATED", "TEST_MODULE_CONFIG", 12L, null, Map.of("id", 12L));

        AuditLog log = capturedLog();
        assertEquals("system", log.getOperatorName());
        assertNull(log.getBeforeValue());
    }

    private AuditLog capturedLog() {
        ArgumentCaptor<AuditLog> captor = ArgumentCaptor.forClass(AuditLog.class);
        verify(repository).save(captor.capture());
        return captor.getValue();
    }
}
