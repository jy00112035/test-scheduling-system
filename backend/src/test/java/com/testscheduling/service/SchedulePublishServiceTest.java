package com.testscheduling.service;

import com.testscheduling.dto.BatchPublishRequest;
import com.testscheduling.dto.BatchPublishResponse;
import com.testscheduling.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SchedulePublishServiceTest {

    @Mock SchedulePublishTransactionService transactionService;
    @Mock AuditLogService auditLogService;

    @Test
    void batchRequestRejectsNullEmptyAndOversizedIds() {
        SchedulePublishService service = new SchedulePublishService(transactionService, auditLogService);
        assertThrows(BusinessException.class, () -> service.publishBatch(null));
        assertThrows(BusinessException.class, () -> service.publishBatch(new BatchPublishRequest(null)));
        assertThrows(BusinessException.class, () -> service.publishBatch(new BatchPublishRequest(List.of())));
        assertThrows(BusinessException.class, () -> service.publishBatch(new BatchPublishRequest(
            java.util.stream.LongStream.rangeClosed(1, 501).boxed().toList())));
    }

    @Test
    void batchResponseCarriesStableFailureDetails() {
        BatchPublishResponse response = new BatchPublishResponse(
            List.of(new BatchPublishResponse.Success(1L, 2)),
            List.of(new BatchPublishResponse.Failure(
                2L, "SPECIAL_MODULE_UNFULFILLED", "支付模块仍缺少 0.5 人天")));

        assertEquals(1, response.successCount());
        assertEquals(1, response.failureCount());
        assertEquals("SPECIAL_MODULE_UNFULFILLED", response.failed().get(0).reasonCode());
    }

    @Test
    void batchNormalizesDuplicatesAndAuditsOnlyBusinessFailures() {
        when(transactionService.publishInNewTransaction(10L)).thenReturn(3);
        when(transactionService.publishInNewTransaction(11L)).thenThrow(
            new BusinessException("GENERAL_MANPOWER_UNFULFILLED", "通用人力仍缺少 0.5 人天"));
        SchedulePublishService service = new SchedulePublishService(transactionService, auditLogService);

        BatchPublishResponse response = service.publishBatch(
            new BatchPublishRequest(List.of(10L, 10L, 11L)));

        assertEquals(List.of(new BatchPublishResponse.Success(10L, 3)), response.success());
        assertEquals(11L, response.failed().get(0).demandId());
        verify(transactionService).publishInNewTransaction(10L);
        verify(transactionService).publishInNewTransaction(11L);
        verify(auditLogService).record(
            org.mockito.ArgumentMatchers.eq("SCHEDULE_PUBLISH_FAILED"),
            org.mockito.ArgumentMatchers.eq("SCHEDULE"),
            org.mockito.ArgumentMatchers.eq(11L),
            org.mockito.ArgumentMatchers.isNull(),
            org.mockito.ArgumentMatchers.any());
    }

    @Test
    void failureAuditErrorNeverReplacesOriginalBusinessError() {
        BusinessException original = new BusinessException(
            "STAFF_MODULE_NOT_FAMILIAR", "张三不熟悉支付模块");
        when(transactionService.publishInNewTransaction(10L)).thenThrow(original);
        doThrow(new IllegalStateException("audit unavailable")).when(auditLogService).record(
            org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.isNull(),
            org.mockito.ArgumentMatchers.any());

        BusinessException result = assertThrows(BusinessException.class,
            () -> new SchedulePublishService(transactionService, auditLogService).publishOne(10L));

        assertEquals(original, result);
    }
}
