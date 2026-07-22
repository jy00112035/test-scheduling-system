package com.testscheduling.service;

import com.testscheduling.dto.ScheduleRecommendationRequest;
import com.testscheduling.entity.DemandManpowerDetail;
import com.testscheduling.entity.Schedule;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.DemandManpowerDetailRepository;
import com.testscheduling.repository.ScheduleRepository;
import com.testscheduling.repository.TestDemandRepository;
import com.testscheduling.repository.TestStaffRepository;
import org.junit.jupiter.api.Test;
import org.mockito.stubbing.Answer;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

@SpringBootTest
class ScheduleRecommendationRollbackIntegrationTest {

    private static final String DATABASE_URL = "jdbc:h2:mem:recommendation-rollback-"
            + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=1000";

    @DynamicPropertySource
    static void useUniqueDatabase(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> DATABASE_URL);
    }

    @Autowired ScheduleRecommendationService service;
    @Autowired TestDemandRepository demandRepository;
    @Autowired DemandManpowerDetailRepository detailRepository;
    @Autowired TestStaffRepository staffRepository;
    @SpyBean ScheduleRepository scheduleRepository;

    @Test
    void realFlushBeforeInjectedFailureRollsBackEveryGeneratedDraft() {
        TestDemand demand = demand();
        detail(demand.getId());
        staff("ROLLBACK-A");
        staff("ROLLBACK-B");
        AtomicBoolean flushed = new AtomicBoolean();
        Answer<List<Schedule>> flushThenFail = invocation -> {
            List<Schedule> generated = invocation.getArgument(0);
            scheduleRepository.saveAndFlush(generated.get(0));
            flushed.set(scheduleRepository.findById(generated.get(0).getId()).isPresent());
            throw new org.springframework.dao.OptimisticLockingFailureException("injected after flush");
        };
        doAnswer(flushThenFail).when(scheduleRepository).saveAllAndFlush(any());

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.recommend(request(demand.getId())));

        assertEquals("DATA_CHANGED_RETRY", error.getErrorCode());
        assertTrue(flushed.get(), "the injected failure must occur after a real database flush");
        assertTrue(scheduleRepository.findByDemandId(demand.getId()).isEmpty());
    }

    private ScheduleRecommendationRequest request(Long demandId) {
        ScheduleRecommendationRequest request = new ScheduleRecommendationRequest();
        request.setMode(ScheduleRecommendationRequest.Mode.FULL_DEMAND);
        request.setDemandIds(List.of(demandId));
        request.setIncludeSaturdays(true);
        request.setIncludeSundays(true);
        return request;
    }

    private TestDemand demand() {
        TestDemand demand = new TestDemand();
        demand.setProduct("rollback");
        demand.setVersion("v1");
        demand.setVersionType("维护");
        demand.setSubmittedBy("manager");
        demand.setStartDate(LocalDateTime.of(2026, 7, 22, 0, 0));
        demand.setEndDate(LocalDateTime.of(2026, 7, 22, 23, 59));
        return demandRepository.saveAndFlush(demand);
    }

    private DemandManpowerDetail detail(Long demandId) {
        DemandManpowerDetail detail = new DemandManpowerDetail();
        detail.setDemandId(demandId);
        detail.setTestType("rollback-test");
        detail.setManpowerDemand(new BigDecimal("2.0"));
        return detailRepository.saveAndFlush(detail);
    }

    private TestStaff staff(String empNo) {
        TestStaff staff = new TestStaff();
        staff.setName(empNo);
        staff.setEmpNo(empNo);
        staff.setTestType("rollback-test");
        staff.setStatus(TestStaff.StaffStatus.active);
        staff.setCurrentCoefficient(BigDecimal.ONE);
        return staffRepository.saveAndFlush(staff);
    }
}
