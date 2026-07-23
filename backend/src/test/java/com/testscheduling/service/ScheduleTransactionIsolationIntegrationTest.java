package com.testscheduling.service;

import org.junit.jupiter.api.Test;
import org.springframework.aop.support.AopUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.interceptor.TransactionAttribute;
import org.springframework.transaction.interceptor.TransactionAttributeSource;
import org.springframework.transaction.support.TransactionTemplate;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest
class ScheduleTransactionIsolationIntegrationTest {

    @Autowired TransactionAttributeSource transactionAttributeSource;
    @Autowired ScheduleService scheduleService;
    @Autowired ScheduleRecommendationService recommendationService;
    @Autowired SchedulePublishTransactionService publishTransactionService;

    @Test
    void strictScheduleWritesUseReadCommittedThroughSpringProxyMetadata() throws Exception {
        assertReadCommitted(scheduleService, "create", com.testscheduling.entity.Schedule.class);
        assertReadCommitted(scheduleService, "createBatch", java.util.List.class);
        assertReadCommitted(scheduleService, "update", Long.class,
            com.testscheduling.entity.Schedule.class);
        assertReadCommitted(scheduleService, "move", Long.class, Long.class,
            java.time.LocalDate.class, Integer.class);
        assertReadCommitted(scheduleService, "classifyHistorical", Long.class, Long.class, Long.class);
        assertReadCommitted(scheduleService, "delete", Long.class);
        assertReadCommitted(scheduleService, "deleteByDemandId", Long.class,
            com.testscheduling.dto.ScheduleDeleteScope.class);
        assertReadCommitted(scheduleService, "unpublishByDemandId", Long.class);
    }

    @Test
    void recommendationTemplateStartsReadCommittedBeforeItsFirstRead() {
        TransactionTemplate template = (TransactionTemplate) ReflectionTestUtils.getField(
            recommendationService, "transactionTemplate");

        assertEquals(TransactionDefinition.ISOLATION_READ_COMMITTED,
            template.getIsolationLevel());
    }

    @Test
    void publishRetainsRequiresNewAndAddsReadCommitted() throws Exception {
        TransactionAttribute attribute = attribute(publishTransactionService,
            "publishInNewTransaction", Long.class);

        assertEquals(TransactionDefinition.PROPAGATION_REQUIRES_NEW,
            attribute.getPropagationBehavior());
        assertEquals(TransactionDefinition.ISOLATION_READ_COMMITTED,
            attribute.getIsolationLevel());
    }

    private void assertReadCommitted(Object bean, String methodName, Class<?>... parameterTypes)
            throws Exception {
        assertEquals(TransactionDefinition.ISOLATION_READ_COMMITTED,
            attribute(bean, methodName, parameterTypes).getIsolationLevel(), methodName);
    }

    private TransactionAttribute attribute(
            Object bean, String methodName, Class<?>... parameterTypes) throws Exception {
        Class<?> targetClass = AopUtils.getTargetClass(bean);
        Method method = targetClass.getMethod(methodName, parameterTypes);
        TransactionAttribute attribute = transactionAttributeSource.getTransactionAttribute(
            method, targetClass);
        if (attribute == null) {
            throw new AssertionError("Missing transaction metadata for " + methodName);
        }
        return attribute;
    }
}
