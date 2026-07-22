package com.testscheduling.service;

import com.testscheduling.dto.DemandFulfillmentResponse;
import com.testscheduling.entity.DemandManpowerDetail;
import com.testscheduling.entity.DemandSpecialModule;
import com.testscheduling.entity.Schedule;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.repository.DemandManpowerDetailRepository;
import com.testscheduling.repository.DemandSpecialModuleRepository;
import com.testscheduling.repository.ScheduleRepository;
import com.testscheduling.repository.TestDemandRepository;
import com.testscheduling.repository.TestModuleConfigRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

@Service
public class DemandFulfillmentService {

    private static final BigDecimal ONE_HUNDRED = new BigDecimal("100");

    private final TestDemandRepository demandRepository;
    private final DemandManpowerDetailRepository detailRepository;
    private final DemandSpecialModuleRepository specialRepository;
    private final ScheduleRepository scheduleRepository;
    private final TestModuleConfigRepository moduleRepository;

    public DemandFulfillmentService(
            TestDemandRepository demandRepository,
            DemandManpowerDetailRepository detailRepository,
            DemandSpecialModuleRepository specialRepository,
            ScheduleRepository scheduleRepository,
            TestModuleConfigRepository moduleRepository) {
        this.demandRepository = demandRepository;
        this.detailRepository = detailRepository;
        this.specialRepository = specialRepository;
        this.scheduleRepository = scheduleRepository;
        this.moduleRepository = moduleRepository;
    }

    @Transactional(readOnly = true)
    public DemandFulfillmentResponse calculate(Long demandId) {
        List<DemandManpowerDetail> details = detailRepository.findByDemandId(demandId);
        List<DemandSpecialModule> specials = specialRepository.findByDemandIdOrderByIdAsc(demandId);
        List<Schedule> schedules = scheduleRepository.findByDemandId(demandId);
        if (details.isEmpty() && specials.isEmpty()) {
            TestDemand demand = demandRepository.findById(demandId)
                .orElseThrow(() -> new RuntimeException("测试需求不存在"));
            return calculateLegacy(demand, schedules);
        }
        return calculateStructured(demandId, details, specials, schedules);
    }

    @Transactional(readOnly = true)
    public DemandFulfillmentResponse calculate(TestDemand demand) {
        Long demandId = demand.getId();
        List<DemandManpowerDetail> details = detailRepository.findByDemandId(demandId);
        List<DemandSpecialModule> specials = specialRepository.findByDemandIdOrderByIdAsc(demandId);
        List<Schedule> schedules = scheduleRepository.findByDemandId(demandId);
        if (details.isEmpty() && specials.isEmpty()) {
            return calculateLegacy(demand, schedules);
        }
        return calculateStructured(demandId, details, specials, schedules);
    }

    private DemandFulfillmentResponse calculateLegacy(TestDemand demand, List<Schedule> schedules) {
        BigDecimal required = value(demand.getManpowerDemand());
        BigDecimal allocated = percentToDays(schedules.stream()
            .filter(this::isHistoricalSchedule)
            .map(Schedule::getPercentage)
            .reduce(0, Integer::sum));
        BigDecimal shortage = shortage(required, allocated);
        return new DemandFulfillmentResponse(
            demand.getId(), shortage.signum() == 0, false, List.of(), List.of(), List.of(),
            required, allocated, shortage);
    }

    private DemandFulfillmentResponse calculateStructured(
            Long demandId,
            List<DemandManpowerDetail> details,
            List<DemandSpecialModule> specials,
            List<Schedule> schedules) {
        boolean historical = schedules.stream().anyMatch(this::isHistoricalSchedule);
        List<DemandFulfillmentResponse.Gap> specialGaps = new ArrayList<>();
        List<DemandFulfillmentResponse.Gap> generalGaps = new ArrayList<>();
        List<DemandFulfillmentResponse.Summary> summaries = new ArrayList<>();
        BigDecimal totalRequired = BigDecimal.ZERO;
        BigDecimal totalAllocated = BigDecimal.ZERO;

        for (DemandManpowerDetail detail : details) {
            List<DemandSpecialModule> groupSpecials = specials.stream()
                .filter(special -> detail.getTestType().equals(specialTestType(special)))
                .toList();
            BigDecimal specialRequired = groupSpecials.stream()
                .map(special -> value(special.getManpowerDemand()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal generalRequired = value(detail.getManpowerDemand()).subtract(specialRequired);
            BigDecimal specialAllocated = BigDecimal.ZERO;
            for (DemandSpecialModule special : groupSpecials) {
                BigDecimal allocated = percentToDays(schedules.stream()
                    .filter(schedule -> same(special.getId(), schedule.getDemandSpecialModuleId()))
                    .map(Schedule::getPercentage)
                    .reduce(0, Integer::sum));
                specialAllocated = specialAllocated.add(allocated);
                BigDecimal gap = shortage(special.getManpowerDemand(), allocated);
                if (gap.signum() > 0) {
                    specialGaps.add(new DemandFulfillmentResponse.Gap(
                        detail.getId(), special.getId(), special.getModuleId(),
                        moduleName(special), detail.getTestType(),
                        value(special.getManpowerDemand()), allocated, gap));
                }
            }
            BigDecimal generalAllocated = percentToDays(schedules.stream()
                .filter(schedule -> same(detail.getId(), schedule.getDemandManpowerDetailId()))
                .filter(schedule -> schedule.getDemandSpecialModuleId() == null)
                .map(Schedule::getPercentage)
                .reduce(0, Integer::sum));
            BigDecimal generalGap = shortage(generalRequired, generalAllocated);
            if (generalGap.signum() > 0) {
                generalGaps.add(new DemandFulfillmentResponse.Gap(
                    detail.getId(), null, null, null, detail.getTestType(),
                    generalRequired, generalAllocated, generalGap));
            }
            summaries.add(new DemandFulfillmentResponse.Summary(
                detail.getId(), detail.getTestType(), value(detail.getManpowerDemand()),
                specialRequired, generalRequired, specialAllocated, generalAllocated,
                specialRequired.subtract(specialAllocated).max(BigDecimal.ZERO).add(generalGap)));
            totalRequired = totalRequired.add(value(detail.getManpowerDemand()));
            totalAllocated = totalAllocated.add(specialAllocated).add(generalAllocated);
        }
        BigDecimal totalShortage = specialGaps.stream()
            .map(DemandFulfillmentResponse.Gap::shortage)
            .reduce(BigDecimal.ZERO, BigDecimal::add)
            .add(generalGaps.stream()
                .map(DemandFulfillmentResponse.Gap::shortage)
                .reduce(BigDecimal.ZERO, BigDecimal::add));
        return new DemandFulfillmentResponse(
            demandId, !historical && totalShortage.signum() == 0, historical,
            specialGaps, generalGaps, summaries, totalRequired, totalAllocated, totalShortage);
    }

    private String moduleName(DemandSpecialModule special) {
        if (special.getModuleName() != null) {
            return special.getModuleName();
        }
        return moduleRepository.findById(special.getModuleId())
            .map(module -> module.getModuleName())
            .orElse(null);
    }

    private String specialTestType(DemandSpecialModule special) {
        if (special.getTestType() != null) {
            return special.getTestType();
        }
        return moduleRepository.findById(special.getModuleId())
            .map(module -> module.getTestType())
            .orElse(null);
    }

    private boolean isHistoricalSchedule(Schedule schedule) {
        return schedule.getDemandManpowerDetailId() == null
            && schedule.getDemandSpecialModuleId() == null;
    }

    private boolean same(Long left, Long right) {
        return left != null && left.equals(right);
    }

    private BigDecimal percentToDays(Integer percentage) {
        return BigDecimal.valueOf(percentage == null ? 0 : percentage)
            .divide(ONE_HUNDRED, 1, RoundingMode.UNNECESSARY);
    }

    private BigDecimal shortage(BigDecimal required, BigDecimal allocated) {
        return value(required).subtract(allocated).max(BigDecimal.ZERO).setScale(1);
    }

    private BigDecimal value(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }
}
