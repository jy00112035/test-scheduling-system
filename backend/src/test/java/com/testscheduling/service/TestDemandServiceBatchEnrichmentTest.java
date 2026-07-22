package com.testscheduling.service;

import com.testscheduling.dto.DemandFulfillmentResponse;
import com.testscheduling.dto.ManpowerSummary;
import com.testscheduling.entity.DemandManpowerDetail;
import com.testscheduling.entity.DemandSpecialModule;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.repository.AuditLogRepository;
import com.testscheduling.repository.DemandManpowerDetailRepository;
import com.testscheduling.repository.ScheduleRepository;
import com.testscheduling.repository.TestDemandRepository;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TestDemandServiceBatchEnrichmentTest {

    @Test
    void listEnrichmentCalculatesFulfillmentOnceForTheWholeCollection() {
        TestDemand first = demand(1001L);
        TestDemand second = demand(1002L);
        TestDemandRepository demandRepository = mock(TestDemandRepository.class);
        DemandManpowerDetailRepository detailRepository = mock(DemandManpowerDetailRepository.class);
        DemandSpecialModuleService specialService = mock(DemandSpecialModuleService.class);
        DemandFulfillmentService fulfillmentService = mock(DemandFulfillmentService.class);
        when(demandRepository.findByStatusIn(anyList())).thenReturn(List.of(first, second));
        DemandManpowerDetail firstDetail = detail(1001L, 301L);
        DemandManpowerDetail secondDetail = detail(1002L, 302L);
        when(detailRepository.findByDemandIdIn(List.of(1001L, 1002L)))
            .thenReturn(List.of(firstDetail, secondDetail));
        when(specialService.findByDemandIds(List.of(1001L, 1002L)))
            .thenReturn(Map.of(1001L, List.<DemandSpecialModule>of(),
                1002L, List.<DemandSpecialModule>of()));
        when(specialService.summarize(anyList(), anyList()))
            .thenReturn(List.of(new ManpowerSummary(
                "功能测试", new BigDecimal("2.0"), BigDecimal.ZERO, new BigDecimal("2.0"))));
        when(fulfillmentService.calculateBatch(
            List.of(first, second),
            Map.of(1001L, List.of(firstDetail), 1002L, List.of(secondDetail)),
            Map.of(1001L, List.<DemandSpecialModule>of(),
                1002L, List.<DemandSpecialModule>of())))
            .thenReturn(Map.of(
                1001L, fulfilled(1001L), 1002L, fulfilled(1002L)));

        TestDemandService service = new TestDemandService(
            demandRepository, detailRepository, specialService, mock(ScheduleRepository.class),
            mock(AuditLogService.class), fulfillmentService);

        List<TestDemand> result = service.findPendingAndScheduled();

        result.forEach(demand -> {
            assertNotNull(demand.getSpecialModuleDemands());
            assertNotNull(demand.getManpowerSummary());
            assertNotNull(demand.getManpowerFullySatisfied());
        });
        verify(fulfillmentService, times(1)).calculateBatch(
            List.of(first, second),
            Map.of(1001L, List.of(firstDetail), 1002L, List.of(secondDetail)),
            Map.of(1001L, List.<DemandSpecialModule>of(),
                1002L, List.<DemandSpecialModule>of()));
        verify(fulfillmentService, never()).calculate(org.mockito.ArgumentMatchers.any(TestDemand.class));
    }

    private static TestDemand demand(Long id) {
        TestDemand demand = new TestDemand();
        demand.setId(id);
        demand.setManpowerDemand(new BigDecimal("2.0"));
        return demand;
    }

    private static DemandManpowerDetail detail(Long demandId, Long id) {
        DemandManpowerDetail detail = new DemandManpowerDetail();
        detail.setDemandId(demandId);
        detail.setId(id);
        detail.setTestType("功能测试");
        detail.setManpowerDemand(new BigDecimal("2.0"));
        return detail;
    }

    private static DemandFulfillmentResponse fulfilled(Long demandId) {
        return new DemandFulfillmentResponse(
            demandId, true, false, List.of(), List.of(), List.of(),
            new BigDecimal("2.0"), new BigDecimal("2.0"), BigDecimal.ZERO);
    }
}
