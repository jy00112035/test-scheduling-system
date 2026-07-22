package com.testscheduling.service;

import com.testscheduling.dto.DemandFulfillmentResponse;
import com.testscheduling.entity.DemandManpowerDetail;
import com.testscheduling.entity.DemandSpecialModule;
import com.testscheduling.entity.Schedule;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.exception.BusinessException;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class DemandFulfillmentService {

    private static final BigDecimal ONE_HUNDRED = new BigDecimal("100");
    private static final int BULK_QUERY_CHUNK_SIZE = 500;

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
        requireDemandId(demandId);
        List<DemandManpowerDetail> details = detailRepository.findByDemandId(demandId);
        List<DemandSpecialModule> specials = specialRepository.findByDemandIdOrderByIdAsc(demandId);
        List<Schedule> schedules = scheduleRepository.findByDemandId(demandId);
        if (details.isEmpty() && specials.isEmpty()) {
            TestDemand demand = demandRepository.findById(demandId)
                .orElseThrow(this::demandNotFound);
            return calculateLegacy(demand, schedules);
        }
        return calculateStructured(demandId, details, specials, schedules, loadModules(specials));
    }

    @Transactional(readOnly = true)
    public DemandFulfillmentResponse calculate(TestDemand demand) {
        requireDemand(demand);
        Long demandId = demand.getId();
        List<DemandManpowerDetail> details = detailRepository.findByDemandId(demandId);
        List<DemandSpecialModule> specials = specialRepository.findByDemandIdOrderByIdAsc(demandId);
        List<Schedule> schedules = scheduleRepository.findByDemandId(demandId);
        if (details.isEmpty() && specials.isEmpty()) {
            return calculateLegacy(demand, schedules);
        }
        return calculateStructured(demandId, details, specials, schedules, loadModules(specials));
    }

    @Transactional(readOnly = true)
    public Map<Long, DemandFulfillmentResponse> calculateBatch(
            List<TestDemand> demands,
            Map<Long, List<DemandManpowerDetail>> detailsByDemand,
            Map<Long, List<DemandSpecialModule>> specialsByDemand) {
        if (demands == null) {
            throw demandNotFound();
        }
        List<Long> demandIds = demands.stream().map(demand -> {
            requireDemand(demand);
            return demand.getId();
        }).toList();
        // Recommendation callers cap demandIds at 500, keeping this demand-scoped IN query bounded.
        List<Schedule> schedules = demandIds.isEmpty()
            ? List.of()
            : scheduleRepository.findByDemandIdIn(demandIds);
        Map<Long, List<Schedule>> schedulesByDemand = schedules.stream()
            .filter(schedule -> schedule.getDemandId() != null)
            .collect(Collectors.groupingBy(
                Schedule::getDemandId, LinkedHashMap::new, Collectors.toList()));
        List<DemandSpecialModule> allSpecials = specialsByDemand == null
            ? List.of()
            : specialsByDemand.values().stream().flatMap(List::stream).toList();
        Map<Long, TestModuleConfig> modules = loadModules(allSpecials);
        Map<Long, DemandFulfillmentResponse> results = new LinkedHashMap<>();
        for (TestDemand demand : demands) {
            List<DemandManpowerDetail> details = detailsByDemand == null
                ? List.of() : detailsByDemand.getOrDefault(demand.getId(), List.of());
            List<DemandSpecialModule> specials = specialsByDemand == null
                ? List.of() : specialsByDemand.getOrDefault(demand.getId(), List.of());
            List<Schedule> demandSchedules = schedulesByDemand.getOrDefault(demand.getId(), List.of());
            results.put(demand.getId(), details.isEmpty() && specials.isEmpty()
                ? calculateLegacy(demand, demandSchedules)
                : calculateStructured(
                    demand.getId(), details, specials, demandSchedules, modules));
        }
        return results;
    }

    private DemandFulfillmentResponse calculateLegacy(TestDemand demand, List<Schedule> schedules) {
        BigDecimal required = value(demand.getManpowerDemand());
        BigDecimal allocated = percentToDays(schedules.stream()
            .filter(this::isHistoricalSchedule)
            .map(this::percentageOrZero)
            .reduce(0, Integer::sum));
        BigDecimal shortage = shortage(required, allocated);
        return new DemandFulfillmentResponse(
            demand.getId(), shortage.signum() == 0, false, List.of(), List.of(), List.of(), List.of(),
            required, allocated, shortage);
    }

    private DemandFulfillmentResponse calculateStructured(
            Long demandId,
            List<DemandManpowerDetail> details,
            List<DemandSpecialModule> specials,
            List<Schedule> schedules,
            Map<Long, TestModuleConfig> modules) {
        validateDetails(details);
        validateSpecials(details, specials, modules);
        boolean historical = !specials.isEmpty()
            && schedules.stream().anyMatch(this::isHistoricalSchedule);
        List<DemandFulfillmentResponse.Gap> specialGaps = new ArrayList<>();
        List<DemandFulfillmentResponse.Gap> generalGaps = new ArrayList<>();
        List<DemandFulfillmentResponse.SpecialModuleSummary> specialSummaries = new ArrayList<>();
        List<DemandFulfillmentResponse.Summary> summaries = new ArrayList<>();
        BigDecimal totalRequired = BigDecimal.ZERO;
        BigDecimal totalAllocated = percentToDays(schedules.stream()
            .filter(this::isHistoricalSchedule)
            .map(this::percentageOrZero)
            .reduce(0, Integer::sum));

        for (DemandManpowerDetail detail : details) {
            List<DemandSpecialModule> groupSpecials = specials.stream()
                .filter(special -> detail.getTestType().equals(specialTestType(special, modules)))
                .toList();
            BigDecimal specialRequired = groupSpecials.stream()
                .map(special -> value(special.getManpowerDemand()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal generalRequired = value(detail.getManpowerDemand()).subtract(specialRequired);
            BigDecimal specialAllocated = BigDecimal.ZERO;
            BigDecimal specialShortage = BigDecimal.ZERO;
            for (DemandSpecialModule special : groupSpecials) {
                BigDecimal allocated = percentToDays(schedules.stream()
                    .filter(schedule -> same(special.getId(), schedule.getDemandSpecialModuleId()))
                    .map(this::percentageOrZero)
                    .reduce(0, Integer::sum));
                specialAllocated = specialAllocated.add(allocated);
                BigDecimal gap = shortage(special.getManpowerDemand(), allocated);
                specialShortage = specialShortage.add(gap);
                specialSummaries.add(new DemandFulfillmentResponse.SpecialModuleSummary(
                    detail.getId(), special.getId(), special.getModuleId(),
                    moduleName(special, modules), detail.getTestType(),
                    value(special.getManpowerDemand()), allocated, gap));
                if (gap.signum() > 0) {
                    specialGaps.add(new DemandFulfillmentResponse.Gap(
                        detail.getId(), special.getId(), special.getModuleId(),
                        moduleName(special, modules), detail.getTestType(),
                        value(special.getManpowerDemand()), allocated, gap));
                }
            }
            BigDecimal generalAllocated = percentToDays(schedules.stream()
                .filter(schedule -> same(detail.getId(), schedule.getDemandManpowerDetailId()))
                .filter(schedule -> schedule.getDemandSpecialModuleId() == null)
                .map(this::percentageOrZero)
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
                specialShortage, generalGap,
                specialShortage.add(generalGap)));
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
            specialGaps, generalGaps, specialSummaries, summaries,
            totalRequired, totalAllocated, totalShortage);
    }

    private Map<Long, TestModuleConfig> loadModules(List<DemandSpecialModule> specials) {
        List<Long> moduleIds = specials.stream()
            .filter(special -> special != null)
            .map(DemandSpecialModule::getModuleId)
            .filter(id -> id != null)
            .distinct()
            .sorted()
            .toList();
        if (moduleIds.isEmpty()) {
            return Map.of();
        }
        List<TestModuleConfig> modules = new ArrayList<>();
        for (int start = 0; start < moduleIds.size(); start += BULK_QUERY_CHUNK_SIZE) {
            int end = Math.min(start + BULK_QUERY_CHUNK_SIZE, moduleIds.size());
            modules.addAll(moduleRepository.findAllById(moduleIds.subList(start, end)));
        }
        return modules.stream()
                .collect(Collectors.toMap(TestModuleConfig::getId, Function.identity()));
    }

    private String moduleName(
            DemandSpecialModule special, Map<Long, TestModuleConfig> modules) {
        return modules.get(special.getModuleId()).getModuleName();
    }

    private String specialTestType(
            DemandSpecialModule special, Map<Long, TestModuleConfig> modules) {
        return modules.get(special.getModuleId()).getTestType();
    }

    private void validateDetails(List<DemandManpowerDetail> details) {
        for (DemandManpowerDetail detail : details) {
            if (detail == null || detail.getTestType() == null
                    || detail.getTestType().isBlank()) {
                throw structureError("需求人力明细测试类型不能为空");
            }
        }
    }

    private void validateSpecials(
            List<DemandManpowerDetail> details,
            List<DemandSpecialModule> specials,
            Map<Long, TestModuleConfig> modules) {
        for (DemandSpecialModule special : specials) {
            TestModuleConfig module = special == null || special.getModuleId() == null
                ? null : modules.get(special.getModuleId());
            if (module == null) {
                throw new BusinessException("MODULE_NOT_FOUND", "特殊模块不存在");
            }
            if (module.getTestType() == null || module.getTestType().isBlank()
                    || details.stream().noneMatch(detail ->
                        detail.getTestType().equals(module.getTestType()))) {
                throw structureError("特殊模块所属测试类型不在需求人力明细中");
            }
        }
    }

    private void requireDemandId(Long demandId) {
        if (demandId == null) {
            throw demandNotFound();
        }
    }

    private void requireDemand(TestDemand demand) {
        if (demand == null || demand.getId() == null) {
            throw demandNotFound();
        }
    }

    private BusinessException demandNotFound() {
        return new BusinessException("DEMAND_NOT_FOUND", "测试需求不存在");
    }

    private BusinessException structureError(String message) {
        return new BusinessException("DEMAND_MANPOWER_STRUCTURE_INVALID", message);
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
            .divide(ONE_HUNDRED, 2, RoundingMode.UNNECESSARY);
    }

    private int percentageOrZero(Schedule schedule) {
        if (schedule.getPercentage() == null || schedule.getPercentage() == 0) {
            return 0;
        }
        if (schedule.getPercentage() < 0) {
            throw structureError("排班百分比不能为负数");
        }
        return schedule.getPercentage();
    }

    private BigDecimal shortage(BigDecimal required, BigDecimal allocated) {
        BigDecimal shortage = value(required).subtract(allocated).max(BigDecimal.ZERO)
            .stripTrailingZeros();
        return shortage.scale() < 1 ? shortage.setScale(1) : shortage;
    }

    private BigDecimal value(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }
}
