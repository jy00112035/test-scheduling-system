package com.testscheduling.controller;

import com.testscheduling.config.GlobalExceptionHandler;
import com.testscheduling.entity.DemandSpecialModule;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.security.RequestRoleGuard;
import com.testscheduling.service.TestDemandService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.math.BigDecimal;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class TestDemandControllerTest {

    private final TestDemandService service = mock(TestDemandService.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        TestDemandController controller = new TestDemandController();
        ReflectionTestUtils.setField(controller, "testDemandService", service);
        ReflectionTestUtils.setField(controller, "roleGuard", mock(RequestRoleGuard.class));
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
            .setControllerAdvice(new GlobalExceptionHandler())
            .build();
    }

    @Test
    void updateReturnsStableScheduledDemandBusinessError() throws Exception {
        when(service.update(org.mockito.ArgumentMatchers.eq(7L), any(TestDemand.class)))
            .thenThrow(new BusinessException(
                "DEMAND_WITH_SCHEDULE_IMMUTABLE", "已有排班的需求不能修改人力结构"));

        mockMvc.perform(put("/api/demands/{id}", 7L)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value(400))
            .andExpect(jsonPath("$.data.errorCode")
                .value("DEMAND_WITH_SCHEDULE_IMMUTABLE"));
    }

    @Test
    void approveWithChangesReturnsStableDisabledModuleBusinessError() throws Exception {
        when(service.approveWithChanges(
                org.mockito.ArgumentMatchers.eq(7L), any(TestDemand.class)))
            .thenThrow(new BusinessException(
                "MODULE_DISABLED_FOR_NEW_DEMAND", "停用模块不能新增或修改人力"));

        mockMvc.perform(put("/api/demands/{id}/approve-with-changes", 7L)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value(400))
            .andExpect(jsonPath("$.data.errorCode")
                .value("MODULE_DISABLED_FOR_NEW_DEMAND"));
    }

    @Test
    void batchTransitionsReturnStableLifecycleBusinessError() throws Exception {
        doThrow(new BusinessException(
            "DEMAND_STATUS_TRANSITION_INVALID", "当前需求状态不允许执行该操作"))
            .when(service).batchApproveDemands(any());
        doThrow(new BusinessException(
            "DEMAND_STATUS_TRANSITION_INVALID", "当前需求状态不允许执行该操作"))
            .when(service).batchRejectDemands(any());

        for (String endpoint : List.of("batch-approve", "batch-reject")) {
            mockMvc.perform(put("/api/demands/{endpoint}", endpoint)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("[7]"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.data.errorCode")
                    .value("DEMAND_STATUS_TRANSITION_INVALID"));
        }
    }

    @Test
    void pendingDemandSerializesAuthoritativeSpecialAllocationAndHistoricalFlag() throws Exception {
        TestDemand demand = new TestDemand();
        demand.setId(1001L);
        demand.setManpowerFullySatisfied(false);
        demand.setRequiresHistoricalClassification(true);
        DemandSpecialModule special = new DemandSpecialModule();
        special.setId(501L);
        special.setDemandId(1001L);
        special.setModuleId(11L);
        special.setManpowerDemand(new BigDecimal("2.0"));
        special.setAllocatedManpower(new BigDecimal("0.5"));
        special.setRemainingManpower(new BigDecimal("1.5"));
        demand.setSpecialModuleDemands(List.of(special));
        when(service.findPendingAndScheduled()).thenReturn(List.of(demand));

        mockMvc.perform(get("/api/demands/pending"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data[0].manpowerFullySatisfied").value(false))
            .andExpect(jsonPath("$.data[0].requiresHistoricalClassification").value(true))
            .andExpect(jsonPath("$.data[0].specialModuleDemands[0].manpowerDemand").value(2.0))
            .andExpect(jsonPath("$.data[0].specialModuleDemands[0].allocatedManpower").value(0.5))
            .andExpect(jsonPath("$.data[0].specialModuleDemands[0].remainingManpower").value(1.5));
    }
}
