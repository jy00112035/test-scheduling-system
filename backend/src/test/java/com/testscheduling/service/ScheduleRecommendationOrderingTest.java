package com.testscheduling.service;

import com.testscheduling.entity.DemandManpowerDetail;
import com.testscheduling.entity.DemandSpecialModule;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ScheduleRecommendationOrderingTest {

    @Test
    void ordersReversedDetailsByStableTestTypeAndId() {
        DemandManpowerDetail second = detail(2L, "功能测试");
        DemandManpowerDetail first = detail(1L, "功能测试");
        DemandManpowerDetail automation = detail(3L, "自动化测试");

        assertEquals(List.of(first, second, automation),
                ScheduleRecommendationService.orderDetails(List.of(automation, second, first)));
    }

    @Test
    void ordersShuffledSpecialsByRemainingShortageThenStableId() {
        DemandSpecialModule lowerId = special(10L);
        DemandSpecialModule higherId = special(20L);
        Map<Long, BigDecimal> remaining = new HashMap<>();
        remaining.put(10L, new BigDecimal("1.0"));
        remaining.put(20L, new BigDecimal("2.0"));

        assertEquals(List.of(higherId, lowerId),
                ScheduleRecommendationService.orderSpecials(List.of(lowerId, higherId), remaining));
        remaining.put(10L, new BigDecimal("2.0"));
        assertEquals(List.of(lowerId, higherId),
                ScheduleRecommendationService.orderSpecials(List.of(higherId, lowerId), remaining));
    }

    private DemandManpowerDetail detail(Long id, String type) {
        DemandManpowerDetail detail = new DemandManpowerDetail();
        detail.setId(id);
        detail.setTestType(type);
        return detail;
    }

    private DemandSpecialModule special(Long id) {
        DemandSpecialModule special = new DemandSpecialModule();
        special.setId(id);
        return special;
    }
}
