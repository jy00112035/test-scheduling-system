package com.testscheduling.integration;

import com.testscheduling.dto.BatchPublishRequest;
import com.testscheduling.dto.BatchPublishResponse;
import com.testscheduling.dto.ScheduleRecommendationRequest;
import com.testscheduling.dto.ScheduleRecommendationResponse;
import com.testscheduling.dto.StaffRequest;
import com.testscheduling.dto.TestModuleRequest;
import com.testscheduling.entity.DemandManpowerDetail;
import com.testscheduling.entity.DemandSpecialModule;
import com.testscheduling.entity.Schedule;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.AuditLogRepository;
import com.testscheduling.repository.ScheduleRepository;
import com.testscheduling.service.SchedulePublishService;
import com.testscheduling.service.ScheduleRecommendationService;
import com.testscheduling.service.TestDemandService;
import com.testscheduling.service.TestModuleService;
import com.testscheduling.service.TestStaffService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
class SpecialModuleSchedulingIntegrationTest {
    private static final LocalDate ALLOCATION_DATE = LocalDate.of(2026, 7, 27);
    private static final String DATABASE_URL = "jdbc:h2:mem:special-module-workflow-"
        + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1";

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> DATABASE_URL);
    }

    @Autowired TestModuleService moduleService;
    @Autowired TestStaffService staffService;
    @Autowired TestDemandService demandService;
    @Autowired ScheduleRecommendationService recommendationService;
    @Autowired SchedulePublishService publishService;
    @Autowired ScheduleRepository scheduleRepository;
    @Autowired AuditLogRepository auditLogRepository;

    @Test
    void createsCrossGroupSpecialDraftAndPublishesWithAudit() {
        TestModuleConfig module = module("支付结算");
        TestStaff staff = staff("性能测试组", "性能测试", List.of(module.getId()));
        TestDemand demand = approvedDemand("支付版本", module);

        ScheduleRecommendationResponse recommendation = recommend(demand, staff);

        assertTrue(recommendation.fulfillment().get(0).fullySatisfied());
        Schedule specialDraft = recommendation.generatedSchedules().stream()
            .filter(row -> row.getDemandSpecialModuleId() != null)
            .findFirst()
            .orElseThrow();
        assertNotNull(specialDraft.getDemandSpecialModuleId());
        assertEquals(demand.getSpecialModuleDemands().get(0).getId(),
            specialDraft.getDemandSpecialModuleId());
        assertEquals(staff.getId(), specialDraft.getStaffId());
        assertFalse(specialDraft.getPublished());

        assertEquals(1, publishService.publishOne(demand.getId()));
        List<Schedule> published = scheduleRepository.findByDemandIdAndPublishedTrue(demand.getId());
        assertEquals(1, published.size());
        assertEquals(specialDraft.getId(), published.get(0).getId());
        assertTrue(auditLogRepository.findByEntityTypeAndEntityIdOrderByCreatedAtDesc(
                "SCHEDULE", demand.getId().toString()).stream()
            .anyMatch(log -> "SCHEDULE_PUBLISHED".equals(log.getActionType())));
    }

    @Test
    void removingFamiliarityAfterRecommendationBlocksStrictPublish() {
        Workflow workflow = recommendedWorkflow("能力移除");
        staffService.update(workflow.staff().getId(),
            staffRequest(workflow.staff(), List.of()), "admin");

        BusinessException error = assertThrows(BusinessException.class,
            () -> publishService.publishOne(workflow.demand().getId()));

        assertEquals("STAFF_MODULE_NOT_FAMILIAR", error.getErrorCode());
        List<Schedule> persisted = scheduleRepository.findByDemandId(workflow.demand().getId());
        assertEquals(1, persisted.size());
        assertTrue(persisted.stream()
            .noneMatch(row -> Boolean.TRUE.equals(row.getPublished())));
        assertTrue(auditLogRepository.findByEntityTypeAndEntityIdOrderByCreatedAtDesc(
                "SCHEDULE", workflow.demand().getId().toString()).stream()
            .anyMatch(log -> "SCHEDULE_PUBLISH_FAILED".equals(log.getActionType())
                && log.getAfterValue().contains("STAFF_MODULE_NOT_FAMILIAR")));
    }

    @Test
    void batchPublishReturnsPerDemandPartialSuccess() {
        Workflow invalid = recommendedWorkflow("批量失败");
        Workflow valid = recommendedWorkflow("批量成功");
        staffService.update(invalid.staff().getId(),
            staffRequest(invalid.staff(), List.of()), "admin");

        BatchPublishResponse response = publishService.publishBatch(new BatchPublishRequest(
            List.of(invalid.demand().getId(), valid.demand().getId())));

        assertEquals(1, response.successCount());
        assertEquals(1, response.failureCount());
        assertEquals(valid.demand().getId(), response.success().get(0).demandId());
        assertEquals(1, response.success().get(0).scheduleCount());
        assertEquals(invalid.demand().getId(), response.failed().get(0).demandId());
        assertEquals("STAFF_MODULE_NOT_FAMILIAR", response.failed().get(0).reasonCode());
        List<Schedule> invalidSchedules = scheduleRepository.findByDemandId(invalid.demand().getId());
        List<Schedule> validSchedules = scheduleRepository.findByDemandId(valid.demand().getId());
        assertEquals(1, invalidSchedules.size());
        assertTrue(invalidSchedules.stream()
            .noneMatch(row -> Boolean.TRUE.equals(row.getPublished())));
        assertEquals(1, validSchedules.size());
        assertTrue(validSchedules.stream()
            .allMatch(row -> Boolean.TRUE.equals(row.getPublished())));
        assertTrue(auditLogRepository.findByEntityTypeAndEntityIdOrderByCreatedAtDesc(
                "SCHEDULE", valid.demand().getId().toString()).stream()
            .anyMatch(log -> "SCHEDULE_PUBLISHED".equals(log.getActionType())));
    }

    private Workflow recommendedWorkflow(String label) {
        TestModuleConfig module = module(label + "模块");
        TestStaff staff = staff("跨组性能团队", "性能测试", List.of(module.getId()));
        TestDemand demand = approvedDemand(label + "需求", module);
        ScheduleRecommendationResponse recommendation = recommend(demand, staff);
        assertTrue(recommendation.fulfillment().get(0).fullySatisfied());
        assertEquals(1, recommendation.generatedSchedules().size());
        return new Workflow(module, staff, demand, recommendation.generatedSchedules().get(0));
    }

    private TestModuleConfig module(String label) {
        return moduleService.create(new TestModuleRequest(identity(label), "功能测试", 1));
    }

    private TestStaff staff(String groupName, String testType, List<Long> familiarModuleIds) {
        StaffRequest request = new StaffRequest();
        request.setName(identity("跨组人员"));
        request.setEmpNo(identity("E2E"));
        request.setJoinDate(LocalDate.of(2025, 1, 1));
        request.setGroupName(groupName);
        request.setTestType(testType);
        request.setInitialCoefficient(BigDecimal.ONE);
        request.setCurrentCoefficient(BigDecimal.ONE);
        request.setStatus(TestStaff.StaffStatus.active.name());
        request.setRoles(List.of("testExecutor"));
        request.setFamiliarModuleIds(familiarModuleIds);
        request.setConfidentialClearance(false);
        return staffService.create(request, "admin").getStaff();
    }

    private StaffRequest staffRequest(TestStaff staff, List<Long> familiarModuleIds) {
        StaffRequest request = new StaffRequest();
        request.setName(staff.getName());
        request.setEmpNo(staff.getEmpNo());
        request.setJoinDate(staff.getJoinDate());
        request.setGroupName(staff.getGroupName());
        request.setTestType(staff.getTestType());
        request.setInitialCoefficient(staff.getInitialCoefficient());
        request.setCurrentCoefficient(staff.getCurrentCoefficient());
        request.setStatus(staff.getStatus().name());
        request.setRoles(List.of("testExecutor"));
        request.setFamiliarModuleIds(familiarModuleIds);
        request.setConfidentialClearance(false);
        return request;
    }

    private TestDemand approvedDemand(String label, TestModuleConfig module) {
        DemandManpowerDetail detail = new DemandManpowerDetail();
        detail.setTestType("功能测试");
        detail.setManpowerDemand(new BigDecimal("0.5"));

        DemandSpecialModule special = new DemandSpecialModule();
        special.setModuleId(module.getId());
        special.setManpowerDemand(new BigDecimal("0.5"));

        TestDemand request = new TestDemand();
        request.setProduct(identity(label));
        request.setVersion("V1.0");
        request.setVersionType("维护");
        request.setStartDate(ALLOCATION_DATE.atStartOfDay());
        request.setEndDate(ALLOCATION_DATE.atTime(18, 0));
        request.setStatus(TestDemand.DemandStatus.submitted);
        request.setSubmittedBy("integration-test");
        request.setPriority("高");
        request.setTestDeviceCount(1);
        request.setConfidential(false);
        request.setManpowerDetails(List.of(detail));
        request.setSpecialModuleDemands(List.of(special));

        TestDemand created = demandService.create(request, "integration-test");
        demandService.approveDemand(created.getId());
        return demandService.findById(created.getId());
    }

    private ScheduleRecommendationResponse recommend(TestDemand demand, TestStaff staff) {
        ScheduleRecommendationRequest request = new ScheduleRecommendationRequest();
        request.setMode(ScheduleRecommendationRequest.Mode.FULL_DEMAND);
        request.setDemandIds(List.of(demand.getId()));
        request.setFixedStaffIds(List.of(staff.getId()));
        request.setExcludedStaffIds(List.of());
        request.setIncludeSaturdays(true);
        request.setIncludeSundays(true);
        request.setReplaceExistingDrafts(true);
        return recommendationService.recommend(request);
    }

    private String identity(String prefix) {
        return prefix + "-" + UUID.randomUUID();
    }

    private record Workflow(
            TestModuleConfig module, TestStaff staff, TestDemand demand, Schedule draft) { }
}
