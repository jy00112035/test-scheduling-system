package com.testscheduling.controller;

import com.testscheduling.config.GlobalExceptionHandler;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.service.TestDemandService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class TestDemandControllerTest {

    private final TestDemandService service = mock(TestDemandService.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        TestDemandController controller = new TestDemandController();
        ReflectionTestUtils.setField(controller, "testDemandService", service);
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
}
