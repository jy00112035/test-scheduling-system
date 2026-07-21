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
    void createPersistsChildrenReturnsStructuralSummaryAndAuditsChange() {
        TestModuleConfig payment = saveModule("支付模块", true);
        TestModuleConfig message = saveModule("消息模块", true);
        TestDemand request = demand("创建成功", "8.0");
        request.setSpecialModuleDemands(List.of(
            special(payment.getId(), "2.0"), special(message.getId(), "1.5")));
        long auditCountBefore = auditLogRepository.count();

        TestDemand result = service.create(request);

        assertEquals(new BigDecimal("8.0"), result.getManpowerDemand());
        assertEquals(1, result.getManpowerDetails().size());
        assertEquals(2, result.getSpecialModuleDemands().size());
        assertEquals(payment.getModuleName(),
            result.getSpecialModuleDemands().getFirst().getModuleName());
        assertEquals("功能测试", result.getSpecialModuleDemands().getFirst().getTestType());
        assertEquals(BigDecimal.ZERO, result.getSpecialModuleDemands().getFirst().getAllocatedManpower());
        assertEquals(new BigDecimal("2.0"),
            result.getSpecialModuleDemands().getFirst().getRemainingManpower());
        ManpowerSummary summary = result.getManpowerSummary().getFirst();
        assertEquals(new BigDecimal("4.5"), summary.generalManpower());
        assertNull(result.getManpowerFullySatisfied());
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
            () -> service.create(request));

        assertEquals("SPECIAL_MODULE_EXCEEDS_GROUP", error.getErrorCode());
        assertEquals(demandsBefore, demandRepository.count());
        assertEquals(detailsBefore, detailRepository.count());
        assertEquals(specialsBefore, specialRepository.count());
        assertEquals(auditsBefore, auditLogRepository.count());
    }

    @Test
    void disabledHistoricalModuleCanStayOrDecreaseButCannotIncrease() {
        TestModuleConfig payment = saveModule("历史支付模块", true);
        TestDemand original = demand("历史需求", "8.0");
        original.setSpecialModuleDemands(List.of(special(payment.getId(), "2.0")));
        TestDemand created = service.create(original);
        payment.setEnabled(false);
        moduleRepository.saveAndFlush(payment);

        TestDemand unchanged = demand("历史需求-保留", "8.0");
        unchanged.setSpecialModuleDemands(List.of(special(payment.getId(), "2.0")));
        TestDemand retained = service.update(created.getId(), unchanged);
        assertFalse(retained.getSpecialModuleDemands().getFirst().getEnabled());

        TestDemand decreased = demand("历史需求-减少", "8.0");
        decreased.setSpecialModuleDemands(List.of(special(payment.getId(), "1.5")));
        TestDemand reduced = service.update(created.getId(), decreased);
        assertEquals(new BigDecimal("1.5"),
            reduced.getSpecialModuleDemands().getFirst().getManpowerDemand());

        TestDemand increased = demand("不应提交", "8.0");
        increased.setSpecialModuleDemands(List.of(special(payment.getId(), "1.6")));
        BusinessException error = assertThrows(BusinessException.class,
            () -> service.update(created.getId(), increased));

        assertEquals("MODULE_DISABLED_FOR_NEW_DEMAND", error.getErrorCode());
        TestDemand persisted = service.findById(created.getId());
        assertEquals(reduced.getProduct(), persisted.getProduct());
        assertEquals(new BigDecimal("1.5"),
            persisted.getSpecialModuleDemands().getFirst().getManpowerDemand());
    }

    @Test
    void approvedDemandWithScheduleRejectsParentOrChildQuotaChanges() {
        TestModuleConfig payment = saveModule("锁定支付模块", true);
        TestDemand original = demand("锁定需求", "8.0");
        original.setStatus(TestDemand.DemandStatus.pending);
        original.setSpecialModuleDemands(List.of(special(payment.getId(), "2.0")));
        TestDemand created = service.create(original);
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
    void approveWithChangesCanClearSpecialModulesAndRecordsAuditInSameTransaction() {
        TestModuleConfig payment = saveModule("审批支付模块", true);
        TestDemand original = demand("待审批需求", "8.0");
        original.setSpecialModuleDemands(List.of(special(payment.getId(), "2.0")));
        TestDemand created = service.create(original);
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
    void deletionRemovesSpecialsBeforeDetailsAndRejectsScheduledDemand() {
        TestModuleConfig payment = saveModule("删除支付模块", true);
        TestDemand deletable = demand("可删除需求", "8.0");
        deletable.setSpecialModuleDemands(List.of(special(payment.getId(), "2.0")));
        TestDemand created = service.create(deletable);

        service.delete(created.getId());

        assertFalse(demandRepository.existsById(created.getId()));
        assertTrue(detailRepository.findByDemandId(created.getId()).isEmpty());
        assertTrue(specialRepository.findByDemandIdOrderByIdAsc(created.getId()).isEmpty());

        TestDemand scheduled = demand("不可删除需求", "8.0");
        scheduled.setSpecialModuleDemands(List.of(special(payment.getId(), "1.0")));
        TestDemand scheduledDemand = service.create(scheduled);
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

    private DemandSpecialModule special(Long moduleId, String manpower) {
        DemandSpecialModule special = new DemandSpecialModule();
        special.setModuleId(moduleId);
        special.setManpowerDemand(new BigDecimal(manpower));
        return special;
    }
}
