package com.testscheduling.service;

import com.testscheduling.dto.ManpowerSummary;
import com.testscheduling.entity.DemandManpowerDetail;
import com.testscheduling.entity.DemandSpecialModule;
import com.testscheduling.entity.Schedule;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.AuditLogRepository;
import com.testscheduling.repository.DemandManpowerDetailRepository;
import com.testscheduling.repository.DemandSpecialModuleRepository;
import com.testscheduling.repository.ScheduleRepository;
import com.testscheduling.repository.TestDemandRepository;
import com.testscheduling.repository.TestModuleConfigRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
class TestDemandServiceTest {

    private static final String DATABASE_URL = "jdbc:h2:mem:demand-special-" + UUID.randomUUID()
        + ";MODE=MySQL;DB_CLOSE_DELAY=-1";

    @DynamicPropertySource
    static void useUniqueDatabase(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> DATABASE_URL);
    }

    @Autowired
    private TestDemandService service;

    @Autowired
    private TestDemandRepository demandRepository;

    @Autowired
    private DemandManpowerDetailRepository detailRepository;

    @Autowired
    private DemandSpecialModuleRepository specialRepository;

    @Autowired
    private TestModuleConfigRepository moduleRepository;

    @Autowired
    private ScheduleRepository scheduleRepository;

    @Autowired
    private AuditLogRepository auditLogRepository;

    @Test
    void createAndGenericUpdatePreserveServerOwnedLifecycleFields() {
        TestDemand forged = demand("生命周期信任边界", "1.0");
        forged.setStatus(TestDemand.DemandStatus.completed);
        forged.setSubmittedBy("forged-submitter");

        TestDemand created = service.create(forged, "authenticated-manager");

        assertEquals(TestDemand.DemandStatus.submitted, created.getStatus());
        assertEquals("authenticated-manager", created.getSubmittedBy());

        TestDemand changes = demand("生命周期普通编辑", "1.0");
        changes.setStatus(TestDemand.DemandStatus.scheduled);
        changes.setSubmittedBy("second-forged-submitter");
        TestDemand updated = service.update(created.getId(), changes);

        assertEquals(TestDemand.DemandStatus.submitted, updated.getStatus());
        assertEquals("authenticated-manager", updated.getSubmittedBy());
    }

    @Test
    void explicitTransitionsEnforceLifecycleWithStableCode() {
        TestDemand created = create(demand("显式生命周期", "1.0"));

        BusinessException closeError = assertThrows(BusinessException.class,
            () -> service.close(created.getId()));
        assertEquals("DEMAND_STATUS_TRANSITION_INVALID", closeError.getErrorCode());

        service.rejectDemand(created.getId());
        TestDemand resubmitted = service.resubmitDemand(created.getId(), "resubmitter");
        assertEquals(TestDemand.DemandStatus.submitted, resubmitted.getStatus());
        assertEquals("resubmitter", resubmitted.getSubmittedBy());

        TestDemand approved = service.approveDemand(created.getId());
        assertEquals(TestDemand.DemandStatus.pending, approved.getStatus());
        BusinessException rejectError = assertThrows(BusinessException.class,
            () -> service.rejectDemand(created.getId()));
        assertEquals("DEMAND_STATUS_TRANSITION_INVALID", rejectError.getErrorCode());

        TestDemand persisted = demandRepository.findById(created.getId()).orElseThrow();
        persisted.setStatus(TestDemand.DemandStatus.scheduled);
        demandRepository.saveAndFlush(persisted);
        assertEquals(TestDemand.DemandStatus.completed, service.close(created.getId()).getStatus());
        assertEquals(TestDemand.DemandStatus.completed, service.close(created.getId()).getStatus());
    }

    @Test
    void createPersistsChildrenReturnsStructuralSummaryAndAuditsChange() {
        TestModuleConfig payment = saveModule("支付模块", true);
        TestModuleConfig message = saveModule("消息模块", true);
        TestDemand request = demand("创建成功", "8.0");
        request.setSpecialModuleDemands(List.of(
            special(payment.getId(), "2.0"), special(message.getId(), "1.5")));
        long auditCountBefore = auditLogRepository.count();

        TestDemand result = create(request);

        assertEquals(new BigDecimal("8.0"), result.getManpowerDemand());
        assertEquals(1, result.getManpowerDetails().size());
        assertEquals(2, result.getSpecialModuleDemands().size());
        assertEquals(payment.getModuleName(),
            result.getSpecialModuleDemands().getFirst().getModuleName());
        assertEquals("功能测试", result.getSpecialModuleDemands().getFirst().getTestType());
        assertEquals(0, BigDecimal.ZERO.compareTo(
            result.getSpecialModuleDemands().getFirst().getAllocatedManpower()));
        assertEquals(0, new BigDecimal("2.0").compareTo(
            result.getSpecialModuleDemands().getFirst().getRemainingManpower()));
        ManpowerSummary summary = result.getManpowerSummary().getFirst();
        assertEquals(new BigDecimal("4.5"), summary.generalManpower());
        assertFalse(result.getManpowerFullySatisfied());
        assertEquals(auditCountBefore + 1, auditLogRepository.count());
        var audit = auditLogRepository.findAll().stream()
            .filter(log -> "DEMAND_SPECIAL_MODULE_CHANGED".equals(log.getActionType()))
            .filter(log -> result.getId().toString().equals(log.getEntityId()))
            .findFirst().orElseThrow();
        assertTrue(audit.getAfterValue().contains(payment.getId().toString()));
        assertTrue(audit.getAfterValue().contains("2.0"));
    }

    @Test
    void aggregateFailureRollsBackDemandDetailsSpecialsAndAudit() {
        TestModuleConfig payment = saveModule("超额支付模块", true);
        TestModuleConfig message = saveModule("超额消息模块", true);
        TestDemand request = demand("事务回滚", "3.0");
        request.setSpecialModuleDemands(List.of(
            special(payment.getId(), "2.0"), special(message.getId(), "1.5")));
        long demandsBefore = demandRepository.count();
        long detailsBefore = detailRepository.count();
        long specialsBefore = specialRepository.count();
        long auditsBefore = auditLogRepository.count();

        BusinessException error = assertThrows(BusinessException.class,
            () -> create(request));

        assertEquals("SPECIAL_MODULE_EXCEEDS_GROUP", error.getErrorCode());
        assertEquals(demandsBefore, demandRepository.count());
        assertEquals(detailsBefore, detailRepository.count());
        assertEquals(specialsBefore, specialRepository.count());
        assertEquals(auditsBefore, auditLogRepository.count());
    }

    @Test
    void createWithoutSpecialModulesPersistsValidatedOneDecimalParent() {
        TestDemand request = demand("仅父级人力", "3.5");
        request.getManpowerDetails().getFirst().setTestType(" 功能测试 ");

        TestDemand created = create(request);

        assertEquals(new BigDecimal("3.5"), created.getManpowerDemand());
        assertEquals("功能测试", created.getManpowerDetails().getFirst().getTestType());
        assertTrue(created.getSpecialModuleDemands().isEmpty());
    }

    @Test
    void enrichmentExposesFulfillmentSummaryAndStatus() {
        TestDemand created = create(demand("满足度回填", "2.0"));
        Schedule schedule = new Schedule();
        schedule.setDemandId(created.getId());
        schedule.setDemandManpowerDetailId(created.getManpowerDetails().getFirst().getId());
        schedule.setPercentage(200);
        scheduleRepository.saveAndFlush(schedule);

        TestDemand enriched = service.findById(created.getId());

        assertEquals(0, new BigDecimal("2.0")
            .compareTo(enriched.getManpowerSummary().getFirst().generalManpower()));
        assertTrue(enriched.getManpowerFullySatisfied());
    }

    @Test
    void enrichmentTransitionsHistoricalFlagAfterScheduleClassification() {
        TestModuleConfig module = saveModule("历史归类响应模块", true);
        TestDemand request = demand("历史归类响应", "2.0");
        request.setSpecialModuleDemands(List.of(special(module.getId(), "1.0")));
        TestDemand created = create(request);
        DemandManpowerDetail detail = created.getManpowerDetails().getFirst();
        DemandSpecialModule special = created.getSpecialModuleDemands().getFirst();
        Schedule historical = new Schedule();
        historical.setDemandId(created.getId());
        historical.setPercentage(100);
        historical = scheduleRepository.saveAndFlush(historical);

        TestDemand before = service.findById(created.getId());

        assertTrue(before.getRequiresHistoricalClassification());
        assertFalse(before.getManpowerFullySatisfied());

        historical.setDemandManpowerDetailId(detail.getId());
        historical.setDemandSpecialModuleId(special.getId());
        scheduleRepository.saveAndFlush(historical);
        Schedule general = new Schedule();
        general.setDemandId(created.getId());
        general.setDemandManpowerDetailId(detail.getId());
        general.setPercentage(100);
        scheduleRepository.saveAndFlush(general);

        TestDemand after = service.findById(created.getId());

        assertFalse(after.getRequiresHistoricalClassification());
        assertTrue(after.getManpowerFullySatisfied());
        assertEquals(0, new BigDecimal("1.0").compareTo(
            after.getSpecialModuleDemands().getFirst().getAllocatedManpower()));
        assertEquals(0, BigDecimal.ZERO.compareTo(
            after.getSpecialModuleDemands().getFirst().getRemainingManpower()));
    }

    @Test
    void listEnrichmentPopulatesStructureSummaryAndStatusForEveryDemand() {
        TestModuleConfig module = saveModule("列表支付模块", true);
        TestDemand withSpecial = demand("列表特殊需求", "2.0");
        withSpecial.setStatus(TestDemand.DemandStatus.pending);
        withSpecial.setSpecialModuleDemands(List.of(special(module.getId(), "1.0")));
        TestDemand savedWithSpecial = create(withSpecial);
        service.approveDemand(savedWithSpecial.getId());

        TestDemand generalOnly = demand("列表通用需求", "2.0");
        generalOnly.setStatus(TestDemand.DemandStatus.pending);
        TestDemand savedGeneralOnly = create(generalOnly);
        service.approveDemand(savedGeneralOnly.getId());

        List<TestDemand> results = service.findPendingAndScheduled().stream()
            .filter(item -> item.getId().equals(savedWithSpecial.getId())
                || item.getId().equals(savedGeneralOnly.getId()))
            .toList();

        assertEquals(2, results.size());
        for (TestDemand result : results) {
            assertNotNull(result.getSpecialModuleDemands());
            assertNotNull(result.getManpowerSummary());
            assertNotNull(result.getManpowerFullySatisfied());
        }
    }

    @Test
    void disabledHistoricalModuleCanBeRetainedExactlyUnchanged() {
        DisabledDemand fixture = createDisabledDemand("保留");
        TestDemand unchanged = demand("历史需求-保留", "8.0");
        unchanged.setSpecialModuleDemands(List.of(special(fixture.module().getId(), "2.0")));

        TestDemand retained = service.update(fixture.demand().getId(), unchanged);

        assertFalse(retained.getSpecialModuleDemands().getFirst().getEnabled());
        assertEquals(new BigDecimal("2.0"),
            retained.getSpecialModuleDemands().getFirst().getManpowerDemand());
    }

    @Test
    void disabledHistoricalModuleCannotBeDecreased() {
        DisabledDemand fixture = createDisabledDemand("减少");
        TestDemand decreased = demand("不应减少", "8.0");
        decreased.setSpecialModuleDemands(List.of(special(fixture.module().getId(), "1.5")));

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.update(fixture.demand().getId(), decreased));

        assertEquals("MODULE_DISABLED_FOR_NEW_DEMAND", error.getErrorCode());
        TestDemand persisted = service.findById(fixture.demand().getId());
        assertEquals(fixture.demand().getProduct(), persisted.getProduct());
        assertEquals(new BigDecimal("2.0"),
            persisted.getSpecialModuleDemands().getFirst().getManpowerDemand());
    }

    @Test
    void disabledHistoricalModuleCannotBeIncreased() {
        DisabledDemand fixture = createDisabledDemand("增加");
        TestDemand increased = demand("不应增加", "8.0");
        increased.setSpecialModuleDemands(List.of(special(fixture.module().getId(), "2.1")));

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.update(fixture.demand().getId(), increased));

        assertEquals("MODULE_DISABLED_FOR_NEW_DEMAND", error.getErrorCode());
        TestDemand persisted = service.findById(fixture.demand().getId());
        assertEquals(fixture.demand().getProduct(), persisted.getProduct());
        assertEquals(new BigDecimal("2.0"),
            persisted.getSpecialModuleDemands().getFirst().getManpowerDemand());
    }

    @Test
    void approvedDemandWithScheduleRejectsParentOrChildQuotaChanges() {
        TestModuleConfig payment = saveModule("锁定支付模块", true);
        TestDemand original = demand("锁定需求", "8.0");
        original.setStatus(TestDemand.DemandStatus.pending);
        original.setSpecialModuleDemands(List.of(special(payment.getId(), "2.0")));
        TestDemand created = create(original);
        Schedule schedule = new Schedule();
        schedule.setDemandId(created.getId());
        schedule.setDate(LocalDate.now());
        schedule.setPercentage(100);
        scheduleRepository.saveAndFlush(schedule);

        TestDemand changed = demand("锁定需求", "9.0");
        changed.setStatus(TestDemand.DemandStatus.pending);
        changed.setSpecialModuleDemands(List.of(special(payment.getId(), "2.0")));

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.update(created.getId(), changed));

        assertEquals("DEMAND_WITH_SCHEDULE_IMMUTABLE", error.getErrorCode());
        assertEquals(new BigDecimal("8.00"), service.findById(created.getId()).getManpowerDemand());
    }

    @Test
    void scheduledDemandCannotBypassQuotaLockAfterStatusDowngrade() {
        TestModuleConfig payment = saveModule("降级锁定支付模块", true);
        TestDemand original = demand("降级锁定需求", "8.0");
        original.setStatus(TestDemand.DemandStatus.pending);
        original.setSpecialModuleDemands(List.of(special(payment.getId(), "2.0")));
        TestDemand created = create(original);
        service.approveDemand(created.getId());
        Schedule schedule = new Schedule();
        schedule.setDemandId(created.getId());
        scheduleRepository.saveAndFlush(schedule);

        TestDemand downgrade = demand("降级后需求", "8.0");
        downgrade.setStatus(TestDemand.DemandStatus.submitted);
        downgrade.setSpecialModuleDemands(List.of(special(payment.getId(), "2.0")));
        TestDemand downgraded = service.update(created.getId(), downgrade);
        assertEquals(TestDemand.DemandStatus.pending, downgraded.getStatus());

        TestDemand changed = demand("试图绕过锁定", "9.0");
        changed.setStatus(TestDemand.DemandStatus.completed);
        changed.setSpecialModuleDemands(List.of(special(payment.getId(), "2.0")));

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.update(created.getId(), changed));

        assertEquals("DEMAND_WITH_SCHEDULE_IMMUTABLE", error.getErrorCode());
        assertEquals(new BigDecimal("8.00"), service.findById(created.getId()).getManpowerDemand());
    }

    @Test
    void scheduledDemandAllowsMetadataEditWhenStructureIsExactlyUnchanged() {
        TestModuleConfig payment = saveModule("元数据支付模块", true);
        TestDemand original = demand("元数据原需求", "8.0");
        original.setStatus(TestDemand.DemandStatus.pending);
        original.setSpecialModuleDemands(List.of(special(payment.getId(), "2.0")));
        TestDemand created = create(original);
        Long detailId = created.getManpowerDetails().getFirst().getId();
        Long specialId = created.getSpecialModuleDemands().getFirst().getId();
        Schedule schedule = new Schedule();
        schedule.setDemandId(created.getId());
        scheduleRepository.saveAndFlush(schedule);

        TestDemand metadataEdit = demand("元数据已更新", "8.00");
        metadataEdit.setStatus(TestDemand.DemandStatus.pending);
        metadataEdit.setDescription("仅修改普通需求信息");
        metadataEdit.setSpecialModuleDemands(List.of(special(payment.getId(), "2.00")));

        TestDemand updated = service.update(created.getId(), metadataEdit);

        assertEquals(metadataEdit.getProduct(), updated.getProduct());
        assertEquals("仅修改普通需求信息", updated.getDescription());
        assertEquals(detailId, updated.getManpowerDetails().getFirst().getId());
        assertEquals(specialId, updated.getSpecialModuleDemands().getFirst().getId());
    }

    @Test
    void metadataOnlyUpdatePreservesParentAndSpecialStructures() {
        TestModuleConfig payment = saveModule("更新保留支付模块", true);
        TestDemand original = demand("更新保留需求", "8.0");
        original.setSpecialModuleDemands(List.of(special(payment.getId(), "2.0")));
        TestDemand created = create(original);
        Long detailId = created.getManpowerDetails().getFirst().getId();
        Long specialId = created.getSpecialModuleDemands().getFirst().getId();
        TestDemand metadata = demand("更新后的普通信息", "99.0");
        metadata.setManpowerDetails(null);
        metadata.setSpecialModuleDemands(null);

        TestDemand updated = service.update(created.getId(), metadata);

        assertEquals(metadata.getProduct(), updated.getProduct());
        assertEquals(new BigDecimal("8.00"), updated.getManpowerDemand());
        assertEquals(detailId, updated.getManpowerDetails().getFirst().getId());
        assertEquals(specialId, updated.getSpecialModuleDemands().getFirst().getId());
    }

    @Test
    void metadataOnlyUpdatePreservesParentWhenDemandHasNoSpecialModules() {
        TestDemand created = create(demand("无模块更新需求", "3.0"));
        Long detailId = created.getManpowerDetails().getFirst().getId();
        TestDemand metadata = demand("无模块更新后", "99.0");
        metadata.setManpowerDetails(null);
        metadata.setSpecialModuleDemands(null);

        TestDemand updated = service.update(created.getId(), metadata);

        assertEquals(new BigDecimal("3.00"), updated.getManpowerDemand());
        assertEquals(detailId, updated.getManpowerDetails().getFirst().getId());
        assertTrue(updated.getSpecialModuleDemands().isEmpty());
    }

    @Test
    void parentOnlyUpdateValidatesAgainstAndPreservesPersistedSpecialStructure() {
        TestModuleConfig payment = saveModule("父级单独更新支付模块", true);
        TestDemand original = demand("父级单独更新需求", "8.0");
        original.setSpecialModuleDemands(List.of(special(payment.getId(), "2.0")));
        TestDemand created = create(original);
        Long detailId = created.getManpowerDetails().getFirst().getId();
        Long specialId = created.getSpecialModuleDemands().getFirst().getId();
        TestDemand changes = demand("父级单独更新后", "10.0");
        changes.setSpecialModuleDemands(null);

        TestDemand updated = service.update(created.getId(), changes);

        assertEquals(new BigDecimal("10.0"), updated.getManpowerDemand());
        assertFalse(detailId.equals(updated.getManpowerDetails().getFirst().getId()));
        assertEquals(specialId, updated.getSpecialModuleDemands().getFirst().getId());
        assertEquals(new BigDecimal("8.0"),
            updated.getManpowerSummary().getFirst().generalManpower());
    }

    @Test
    void metadataOnlyApprovalPreservesParentAndSpecialStructures() {
        TestModuleConfig payment = saveModule("审批保留支付模块", true);
        TestDemand original = demand("审批保留需求", "8.0");
        original.setSpecialModuleDemands(List.of(special(payment.getId(), "2.0")));
        TestDemand created = create(original);
        Long detailId = created.getManpowerDetails().getFirst().getId();
        Long specialId = created.getSpecialModuleDemands().getFirst().getId();
        TestDemand metadata = new TestDemand();
        metadata.setPriority("高");

        TestDemand approved = service.approveWithChanges(created.getId(), metadata);

        assertEquals(new BigDecimal("8.00"), approved.getManpowerDemand());
        assertEquals(detailId, approved.getManpowerDetails().getFirst().getId());
        assertEquals(specialId, approved.getSpecialModuleDemands().getFirst().getId());
    }

    @Test
    void metadataOnlyApprovalPreservesParentWhenDemandHasNoSpecialModules() {
        TestDemand created = create(demand("无模块审批需求", "3.0"));
        Long detailId = created.getManpowerDetails().getFirst().getId();
        TestDemand metadata = new TestDemand();
        metadata.setPriority("高");

        TestDemand approved = service.approveWithChanges(created.getId(), metadata);

        assertEquals(new BigDecimal("3.00"), approved.getManpowerDemand());
        assertEquals(detailId, approved.getManpowerDetails().getFirst().getId());
        assertTrue(approved.getSpecialModuleDemands().isEmpty());
    }

    @Test
    void updateRejectsExplicitlyEmptyParentStructure() {
        TestDemand created = create(demand("拒绝清空更新", "3.0"));
        TestDemand changes = demand("拒绝清空更新后", "3.0");
        changes.setManpowerDetails(List.of());
        changes.setSpecialModuleDemands(null);

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.update(created.getId(), changes));

        assertEquals("DEMAND_MANPOWER_DETAILS_REQUIRED", error.getErrorCode());
        assertEquals(new BigDecimal("3.00"), service.findById(created.getId()).getManpowerDemand());
    }

    @Test
    void approveWithChangesRejectsExplicitlyEmptyParentStructure() {
        TestDemand created = create(demand("拒绝清空审批", "3.0"));
        TestDemand changes = new TestDemand();
        changes.setManpowerDetails(List.of());

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.approveWithChanges(created.getId(), changes));

        assertEquals("DEMAND_MANPOWER_DETAILS_REQUIRED", error.getErrorCode());
        assertEquals(TestDemand.DemandStatus.submitted, service.findById(created.getId()).getStatus());
    }

    @Test
    void approveWithChangesCanClearSpecialModulesAndRecordsAuditInSameTransaction() {
        TestModuleConfig payment = saveModule("审批支付模块", true);
        TestDemand original = demand("待审批需求", "8.0");
        original.setSpecialModuleDemands(List.of(special(payment.getId(), "2.0")));
        TestDemand created = create(original);
        long auditCountBefore = auditLogRepository.count();
        TestDemand changes = new TestDemand();
        changes.setSpecialModuleDemands(List.of());

        TestDemand approved = service.approveWithChanges(created.getId(), changes);

        assertEquals(TestDemand.DemandStatus.pending, approved.getStatus());
        assertTrue(approved.getSpecialModuleDemands().isEmpty());
        assertEquals(new BigDecimal("8.00"), approved.getManpowerDemand());
        assertEquals(auditCountBefore + 1, auditLogRepository.count());
        var audit = auditLogRepository.findAll().stream()
            .filter(log -> "DEMAND_SPECIAL_MODULE_CHANGED".equals(log.getActionType()))
            .filter(log -> created.getId().toString().equals(log.getEntityId()))
            .reduce((first, second) -> second).orElseThrow();
        assertTrue(audit.getBeforeValue().contains(payment.getId().toString()));
        assertEquals("[]", audit.getAfterValue());
    }

    @Test
    void approveWithChangesRejectsChangedStructureWhenSchedulesExist() {
        TestModuleConfig payment = saveModule("审批锁定支付模块", true);
        TestDemand original = demand("审批锁定需求", "8.0");
        original.setSpecialModuleDemands(List.of(special(payment.getId(), "2.0")));
        TestDemand created = create(original);
        Long detailId = created.getManpowerDetails().getFirst().getId();
        Long specialId = created.getSpecialModuleDemands().getFirst().getId();
        Schedule schedule = new Schedule();
        schedule.setDemandId(created.getId());
        scheduleRepository.saveAndFlush(schedule);

        TestDemand changes = demand("审批试图改配额", "9.0");
        changes.setSpecialModuleDemands(List.of(special(payment.getId(), "2.1")));

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.approveWithChanges(created.getId(), changes));

        assertEquals("DEMAND_WITH_SCHEDULE_IMMUTABLE", error.getErrorCode());
        TestDemand persisted = service.findById(created.getId());
        assertEquals(TestDemand.DemandStatus.submitted, persisted.getStatus());
        assertEquals(new BigDecimal("8.00"), persisted.getManpowerDemand());
        assertEquals(detailId, persisted.getManpowerDetails().getFirst().getId());
        assertEquals(specialId, persisted.getSpecialModuleDemands().getFirst().getId());
        assertEquals(new BigDecimal("2.0"),
            persisted.getSpecialModuleDemands().getFirst().getManpowerDemand());
    }

    @Test
    void approveWithChangesAllowsMetadataEditWhenScheduledStructureIsUnchanged() {
        TestModuleConfig payment = saveModule("审批元数据支付模块", true);
        TestDemand original = demand("审批元数据需求", "8.0");
        original.setSpecialModuleDemands(List.of(special(payment.getId(), "2.0")));
        TestDemand created = create(original);
        Long detailId = created.getManpowerDetails().getFirst().getId();
        Long specialId = created.getSpecialModuleDemands().getFirst().getId();
        Schedule schedule = new Schedule();
        schedule.setDemandId(created.getId());
        scheduleRepository.saveAndFlush(schedule);

        TestDemand changes = demand("不修改产品", "8.00");
        changes.setPriority("高");
        changes.setSpecialModuleDemands(List.of(special(payment.getId(), "2.00")));

        TestDemand approved = service.approveWithChanges(created.getId(), changes);

        assertEquals(TestDemand.DemandStatus.pending, approved.getStatus());
        assertEquals("高", approved.getPriority());
        assertEquals(detailId, approved.getManpowerDetails().getFirst().getId());
        assertEquals(specialId, approved.getSpecialModuleDemands().getFirst().getId());
    }

    @Test
    void deletionRemovesSpecialsBeforeDetailsAndRejectsScheduledDemand() {
        TestModuleConfig payment = saveModule("删除支付模块", true);
        TestDemand deletable = demand("可删除需求", "8.0");
        deletable.setSpecialModuleDemands(List.of(special(payment.getId(), "2.0")));
        TestDemand created = create(deletable);

        service.delete(created.getId());

        assertFalse(demandRepository.existsById(created.getId()));
        assertTrue(detailRepository.findByDemandId(created.getId()).isEmpty());
        assertTrue(specialRepository.findByDemandIdOrderByIdAsc(created.getId()).isEmpty());

        TestDemand scheduled = demand("不可删除需求", "8.0");
        scheduled.setSpecialModuleDemands(List.of(special(payment.getId(), "1.0")));
        TestDemand scheduledDemand = create(scheduled);
        Schedule schedule = new Schedule();
        schedule.setDemandId(scheduledDemand.getId());
        scheduleRepository.saveAndFlush(schedule);

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.delete(scheduledDemand.getId()));

        assertEquals("DEMAND_WITH_SCHEDULE_IMMUTABLE", error.getErrorCode());
        assertTrue(demandRepository.existsById(scheduledDemand.getId()));
    }

    private TestModuleConfig saveModule(String name, boolean enabled) {
        TestModuleConfig module = new TestModuleConfig();
        module.setModuleName(name + "-" + UUID.randomUUID());
        module.setTestType("功能测试");
        module.setEnabled(enabled);
        module.setSortOrder(10);
        return moduleRepository.saveAndFlush(module);
    }

    private TestDemand demand(String product, String manpower) {
        TestDemand demand = new TestDemand();
        demand.setProduct(product + "-" + UUID.randomUUID());
        demand.setVersionType("release");
        DemandManpowerDetail detail = new DemandManpowerDetail();
        detail.setTestType("功能测试");
        detail.setManpowerDemand(new BigDecimal(manpower));
        demand.setManpowerDetails(List.of(detail));
        return demand;
    }

    private TestDemand create(TestDemand demand) {
        return service.create(demand, "test-submitter");
    }

    private DemandSpecialModule special(Long moduleId, String manpower) {
        DemandSpecialModule special = new DemandSpecialModule();
        special.setModuleId(moduleId);
        special.setManpowerDemand(new BigDecimal(manpower));
        return special;
    }

    private DisabledDemand createDisabledDemand(String suffix) {
        TestModuleConfig module = saveModule("历史支付模块-" + suffix, true);
        TestDemand original = demand("历史需求-" + suffix, "8.0");
        original.setSpecialModuleDemands(List.of(special(module.getId(), "2.0")));
        TestDemand created = create(original);
        module.setEnabled(false);
        moduleRepository.saveAndFlush(module);
        return new DisabledDemand(module, created);
    }

    private record DisabledDemand(TestModuleConfig module, TestDemand demand) {
    }
}
