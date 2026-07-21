package com.testscheduling.service;

import com.testscheduling.dto.ManpowerSummary;
import com.testscheduling.entity.DemandManpowerDetail;
import com.testscheduling.entity.DemandSpecialModule;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.DemandSpecialModuleRepository;
import com.testscheduling.repository.TestModuleConfigRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DemandSpecialModuleServiceTest {

    @Mock
    private DemandSpecialModuleRepository specialRepository;

    @Mock
    private TestModuleConfigRepository moduleRepository;

    @InjectMocks
    private DemandSpecialModuleService service;

    @Test
    void rejectsSpecialModuleTotalAboveItsGroupTotal() {
        DemandManpowerDetail group = group("功能测试", "3.0");
        DemandSpecialModule payment = special(11L, "2.0");
        DemandSpecialModule message = special(12L, "1.5");
        TestModuleConfig paymentConfig = module(11L, "支付模块", "功能测试", true);
        TestModuleConfig messageConfig = module(12L, "消息模块", "功能测试", true);
        when(moduleRepository.findAllById(List.of(11L, 12L)))
            .thenReturn(List.of(paymentConfig, messageConfig));

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.validateNew(List.of(group), List.of(payment, message)));

        assertEquals("SPECIAL_MODULE_EXCEEDS_GROUP", error.getErrorCode());
        verify(specialRepository, never()).saveAll(anyList());
    }

    @Test
    void rejectsMissingParentDetailsEvenWithoutSpecialModules() {
        BusinessException nullDetails = assertThrows(BusinessException.class,
            () -> service.validateNew(null, List.of()));
        BusinessException emptyDetails = assertThrows(BusinessException.class,
            () -> service.validateNew(List.of(), List.of()));

        assertEquals("DEMAND_MANPOWER_DETAILS_REQUIRED", nullDetails.getErrorCode());
        assertEquals("DEMAND_MANPOWER_DETAILS_REQUIRED", emptyDetails.getErrorCode());
        verify(moduleRepository, never()).findAllById(anyList());
    }

    @Test
    void rejectsInvalidParentManpowerEvenWithoutSpecialModules() {
        DemandManpowerDetail missingManpower = group("功能测试", "1.0");
        missingManpower.setManpowerDemand(null);
        BusinessException missing = assertThrows(BusinessException.class,
            () -> service.validateNew(List.of(missingManpower), List.of()));
        BusinessException zero = assertThrows(BusinessException.class,
            () -> service.validateNew(List.of(group("功能测试", "0.0")), List.of()));
        BusinessException negative = assertThrows(BusinessException.class,
            () -> service.validateNew(List.of(group("功能测试", "-1.0")), List.of()));
        BusinessException excessiveScale = assertThrows(BusinessException.class,
            () -> service.validateNew(List.of(group("功能测试", "1.25")), List.of()));

        assertEquals("DEMAND_MANPOWER_INVALID", missing.getErrorCode());
        assertEquals("DEMAND_MANPOWER_INVALID", zero.getErrorCode());
        assertEquals("DEMAND_MANPOWER_INVALID", negative.getErrorCode());
        assertEquals("DEMAND_MANPOWER_INVALID", excessiveScale.getErrorCode());
        verify(moduleRepository, never()).findAllById(anyList());
    }

    @Test
    void rejectsBlankOrDuplicateParentTestTypesEvenWithoutSpecialModules() {
        BusinessException blank = assertThrows(BusinessException.class,
            () -> service.validateNew(List.of(group("  ", "1.0")), List.of()));
        BusinessException duplicate = assertThrows(BusinessException.class,
            () -> service.validateNew(List.of(
                group("功能测试", "1.0"), group(" 功能测试 ", "2.0")), List.of()));

        assertEquals("DEMAND_TEST_TYPE_REQUIRED", blank.getErrorCode());
        assertEquals("DEMAND_TEST_TYPE_DUPLICATE", duplicate.getErrorCode());
        verify(moduleRepository, never()).findAllById(anyList());
    }

    @Test
    void acceptsUniquePositiveOneDecimalParentWithoutSpecialModules() {
        DemandManpowerDetail functional = group(" 功能测试 ", "8.0");
        DemandManpowerDetail performance = group("性能测试", "1.5");

        assertDoesNotThrow(() -> service.validateNew(
            List.of(functional, performance), List.of()));

        assertEquals("功能测试", functional.getTestType());
        verify(moduleRepository, never()).findAllById(anyList());
    }

    @Test
    void allowsDifferentModulesAndReturnsGeneralManpower() {
        DemandManpowerDetail group = group("功能测试", "8.0");
        DemandSpecialModule payment = special(11L, "2.0");
        payment.setId(501L);
        payment.setTestType("功能测试");
        DemandSpecialModule message = special(12L, "1.5");
        message.setId(502L);
        message.setTestType("功能测试");

        List<ManpowerSummary> result = service.summarize(
            List.of(group), List.of(payment, message));

        assertEquals(new BigDecimal("8.0"), result.getFirst().totalManpower());
        assertEquals(new BigDecimal("3.5"), result.getFirst().specialManpower());
        assertEquals(new BigDecimal("4.5"), result.getFirst().generalManpower());
    }

    @Test
    void rejectsDuplicateModuleIdsBeforeReadingConfigurations() {
        DemandManpowerDetail group = group("功能测试", "8.0");

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.validateNew(
                List.of(group), List.of(special(11L, "2.0"), special(11L, "1.0"))));

        assertEquals("SPECIAL_MODULE_DUPLICATE", error.getErrorCode());
        verify(moduleRepository, never()).findAllById(anyList());
    }

    @Test
    void rejectsDisabledModuleForNewDemand() {
        DemandManpowerDetail group = group("功能测试", "8.0");
        when(moduleRepository.findAllById(List.of(11L)))
            .thenReturn(List.of(module(11L, "支付模块", "功能测试", false)));

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.validateNew(List.of(group), List.of(special(11L, "2.0"))));

        assertEquals("MODULE_DISABLED_FOR_NEW_DEMAND", error.getErrorCode());
    }

    @Test
    void rejectsModuleWhoseConfiguredGroupIsMissingFromDemand() {
        DemandManpowerDetail group = group("性能测试", "8.0");
        DemandSpecialModule request = special(11L, "2.0");
        request.setTestType("性能测试");
        when(moduleRepository.findAllById(List.of(11L)))
            .thenReturn(List.of(module(11L, "支付模块", "功能测试", true)));

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.validateNew(List.of(group), List.of(request)));

        assertEquals("MODULE_GROUP_MISMATCH", error.getErrorCode());
    }

    @Test
    void rejectsNonPositiveOrMoreThanOneDecimalPlace() {
        DemandManpowerDetail group = group("功能测试", "8.0");

        BusinessException nonPositive = assertThrows(BusinessException.class,
            () -> service.validateNew(List.of(group), List.of(special(11L, "0.0"))));
        BusinessException excessiveScale = assertThrows(BusinessException.class,
            () -> service.validateNew(List.of(group), List.of(special(11L, "1.25"))));

        assertEquals("SPECIAL_MODULE_MANPOWER_INVALID", nonPositive.getErrorCode());
        assertEquals("SPECIAL_MODULE_MANPOWER_INVALID", excessiveScale.getErrorCode());
        verify(moduleRepository, never()).findAllById(anyList());
    }

    @Test
    void newValidationReturnsBusinessErrorForMissingSpecialManpower() {
        DemandSpecialModule invalid = new DemandSpecialModule();
        invalid.setModuleId(11L);

        BusinessException error = assertThrows(BusinessException.class,
            () -> service.validateNew(List.of(group("功能测试", "8.0")), List.of(invalid)));

        assertEquals("SPECIAL_MODULE_MANPOWER_INVALID", error.getErrorCode());
        verify(moduleRepository, never()).findAllById(anyList());
    }

    @Test
    void replacementValidatesBeforeDeletingAndWritesFreshDemandOwnedRows() {
        DemandManpowerDetail group = group("功能测试", "8.0");
        DemandSpecialModule request = special(11L, "2.0");
        request.setId(999L);
        request.setDemandId(888L);
        when(moduleRepository.findAllById(List.of(11L)))
            .thenReturn(List.of(module(11L, "支付模块", "功能测试", true)));
        when(specialRepository.findByDemandIdOrderByIdAsc(77L)).thenReturn(List.of());
        when(specialRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));

        List<DemandSpecialModule> saved = service.replaceForDemand(
            77L, List.of(group), List.of(request));

        assertEquals(1, saved.size());
        assertEquals(77L, saved.getFirst().getDemandId());
        assertEquals(null, saved.getFirst().getId());
        InOrder writes = inOrder(specialRepository);
        writes.verify(specialRepository).deleteByDemandId(77L);
        writes.verify(specialRepository).flush();
        writes.verify(specialRepository).saveAll(anyList());
    }

    private static DemandManpowerDetail group(String testType, String manpower) {
        DemandManpowerDetail detail = new DemandManpowerDetail();
        detail.setId(301L);
        detail.setTestType(testType);
        detail.setManpowerDemand(new BigDecimal(manpower));
        return detail;
    }

    private static DemandSpecialModule special(Long moduleId, String manpower) {
        DemandSpecialModule special = new DemandSpecialModule();
        special.setModuleId(moduleId);
        special.setManpowerDemand(new BigDecimal(manpower));
        return special;
    }

    private static TestModuleConfig module(
            Long id, String name, String testType, boolean enabled) {
        TestModuleConfig module = new TestModuleConfig();
        module.setId(id);
        module.setModuleName(name);
        module.setTestType(testType);
        module.setEnabled(enabled);
        return module;
    }
}
