package com.testscheduling.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.testscheduling.dto.DemandFulfillmentResponse;
import com.testscheduling.dto.ManpowerSummary;
import com.testscheduling.entity.DemandManpowerDetail;
import com.testscheduling.entity.DemandSpecialModule;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.repository.AuditLogRepository;
import com.testscheduling.repository.DemandManpowerDetailRepository;
import com.testscheduling.repository.ScheduleRepository;
import com.testscheduling.repository.TestDemandRepository;
import com.testscheduling.repository.TestStaffRepository;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.LongStream;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TestDemandServiceBatchEnrichmentTest {

    @Test
    void listEnrichmentChunksMoreThanFiveHundredDemandDetailsAndPreservesOrder() {
        List<Long> ids = LongStream.rangeClosed(1, 501).boxed().toList();
        List<TestDemand> demands = ids.stream().map(TestDemandServiceBatchEnrichmentTest::demand).toList();
        TestDemandRepository demandRepository = mock(TestDemandRepository.class);
        DemandManpowerDetailRepository detailRepository = mock(DemandManpowerDetailRepository.class);
        DemandSpecialModuleService specialService = mock(DemandSpecialModuleService.class);
        DemandFulfillmentService fulfillmentService = mock(DemandFulfillmentService.class);
        when(demandRepository.findByStatusIn(anyList())).thenReturn(demands);
        when(detailRepository.findByDemandIdIn(anyList())).thenAnswer(invocation ->
            invocation.<List<Long>>getArgument(0).stream()
                .map(id -> detail(id, id + 1000L))
                .toList());
        when(specialService.findByDemandIds(ids)).thenReturn(Map.of());
        when(specialService.summarize(anyList(), anyList())).thenReturn(List.of());
        when(fulfillmentService.calculateBatch(
            org.mockito.ArgumentMatchers.anyList(),
            org.mockito.ArgumentMatchers.anyMap(),
            org.mockito.ArgumentMatchers.anyMap())).thenAnswer(invocation -> {
                Map<Long, DemandFulfillmentResponse> results = new LinkedHashMap<>();
                invocation.<List<TestDemand>>getArgument(0)
                    .forEach(item -> results.put(item.getId(), fulfilled(item.getId())));
                return results;
            });
        TestDemandService service = new TestDemandService(
            demandRepository, detailRepository, specialService, mock(ScheduleRepository.class),
            mock(AuditLogService.class), fulfillmentService, mock(FieldConfigService.class),
            mock(ObjectMapper.class), mock(TestStaffRepository.class));

        List<TestDemand> result = service.findPendingAndScheduled();

        assertEquals(ids, result.stream().map(TestDemand::getId).toList());
        assertEquals(501, result.stream().map(TestDemand::getManpowerDetails)
            .mapToInt(List::size).sum());
        verify(detailRepository).findByDemandIdIn(ids.subList(0, 500));
        verify(detailRepository).findByDemandIdIn(ids.subList(500, 501));
        verify(detailRepository, times(2)).findByDemandIdIn(anyList());
    }

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
            mock(AuditLogService.class), fulfillmentService, mock(FieldConfigService.class),
            mock(ObjectMapper.class), mock(TestStaffRepository.class));

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

    @Test
    void listEnrichmentCopiesSpecialAllocationsAndHistoricalFlagsFromFulfillment() {
        TestDemand historical = demand(1001L);
        TestDemand classified = demand(1002L);
        TestDemandRepository demandRepository = mock(TestDemandRepository.class);
        DemandManpowerDetailRepository detailRepository = mock(DemandManpowerDetailRepository.class);
        DemandSpecialModuleService specialService = mock(DemandSpecialModuleService.class);
        DemandFulfillmentService fulfillmentService = mock(DemandFulfillmentService.class);
        when(demandRepository.findByStatusIn(anyList())).thenReturn(List.of(historical, classified));
        DemandManpowerDetail historicalDetail = detail(1001L, 301L);
        DemandManpowerDetail classifiedDetail = detail(1002L, 302L);
        DemandSpecialModule historicalSpecial = special(1001L, 501L);
        DemandSpecialModule classifiedSpecial = special(1002L, 502L);
        Map<Long, List<DemandManpowerDetail>> details = Map.of(
            1001L, List.of(historicalDetail), 1002L, List.of(classifiedDetail));
        Map<Long, List<DemandSpecialModule>> specials = Map.of(
            1001L, List.of(historicalSpecial), 1002L, List.of(classifiedSpecial));
        when(detailRepository.findByDemandIdIn(List.of(1001L, 1002L)))
            .thenReturn(List.of(historicalDetail, classifiedDetail));
        when(specialService.findByDemandIds(List.of(1001L, 1002L))).thenReturn(specials);
        when(specialService.summarize(anyList(), anyList())).thenReturn(List.of());
        when(fulfillmentService.calculateBatch(
            List.of(historical, classified), details, specials)).thenReturn(Map.of(
                1001L, fulfillment(1001L, false, true, 301L, 501L, "0.5", "1.5"),
                1002L, fulfillment(1002L, true, false, 302L, 502L, "2.0", "0.0")));

        TestDemandService service = new TestDemandService(
            demandRepository, detailRepository, specialService, mock(ScheduleRepository.class),
            mock(AuditLogService.class), fulfillmentService, mock(FieldConfigService.class),
            mock(ObjectMapper.class), mock(TestStaffRepository.class));

        List<TestDemand> result = service.findPendingAndScheduled();

        assertFalse(result.get(0).getManpowerFullySatisfied());
        assertTrue(result.get(0).getRequiresHistoricalClassification());
        assertEquals(0, new BigDecimal("0.5").compareTo(
            result.get(0).getSpecialModuleDemands().getFirst().getAllocatedManpower()));
        assertEquals(0, new BigDecimal("1.5").compareTo(
            result.get(0).getSpecialModuleDemands().getFirst().getRemainingManpower()));
        assertTrue(result.get(1).getManpowerFullySatisfied());
        assertFalse(result.get(1).getRequiresHistoricalClassification());
        assertEquals(0, new BigDecimal("2.0").compareTo(
            result.get(1).getSpecialModuleDemands().getFirst().getAllocatedManpower()));
        assertEquals(0, new BigDecimal("0.0").compareTo(
            result.get(1).getSpecialModuleDemands().getFirst().getRemainingManpower()));
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

    private static DemandSpecialModule special(Long demandId, Long id) {
        DemandSpecialModule special = new DemandSpecialModule();
        special.setDemandId(demandId);
        special.setId(id);
        special.setModuleId(id + 100L);
        special.setManpowerDemand(new BigDecimal("2.0"));
        special.setModuleName("模块 " + id);
        special.setTestType("功能测试");
        return special;
    }

    private static DemandFulfillmentResponse fulfillment(
            Long demandId,
            boolean fullySatisfied,
            boolean historical,
            Long detailId,
            Long specialId,
            String allocated,
            String remaining) {
        return new DemandFulfillmentResponse(
            demandId, fullySatisfied, historical, List.of(), List.of(), List.of(
                new DemandFulfillmentResponse.SpecialModuleSummary(
                    detailId, specialId, specialId + 100L, "模块 " + specialId,
                    "功能测试", new BigDecimal("2.0"),
                    new BigDecimal(allocated), new BigDecimal(remaining))),
            List.of(), new BigDecimal("2.0"), new BigDecimal(allocated),
            new BigDecimal(remaining));
    }

    private static DemandFulfillmentResponse fulfilled(Long demandId) {
        return new DemandFulfillmentResponse(
            demandId, true, false, List.of(), List.of(), List.of(),
            new BigDecimal("2.0"), new BigDecimal("2.0"), BigDecimal.ZERO);
    }
}
