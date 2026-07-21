package com.testscheduling.service;

import com.testscheduling.dto.ManpowerSummary;
import com.testscheduling.entity.DemandManpowerDetail;
import com.testscheduling.entity.DemandSpecialModule;
import com.testscheduling.entity.TestModuleConfig;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.DemandSpecialModuleRepository;
import com.testscheduling.repository.TestModuleConfigRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class DemandSpecialModuleService {

    private final DemandSpecialModuleRepository specialRepository;
    private final TestModuleConfigRepository moduleRepository;

    public DemandSpecialModuleService(
            DemandSpecialModuleRepository specialRepository,
            TestModuleConfigRepository moduleRepository) {
        this.specialRepository = specialRepository;
        this.moduleRepository = moduleRepository;
    }

    public void validate(
            List<DemandManpowerDetail> manpowerDetails,
            List<DemandSpecialModule> specialModuleDemands,
            boolean allowHistoricalDisabled) {
        Map<Long, BigDecimal> historicalLimits = new LinkedHashMap<>();
        if (allowHistoricalDisabled) {
            for (DemandSpecialModule item : specialList(specialModuleDemands)) {
                if (item.getModuleId() != null && item.getManpowerDemand() != null) {
                    historicalLimits.putIfAbsent(item.getModuleId(), item.getManpowerDemand());
                }
            }
        }
        validate(manpowerDetails, specialModuleDemands, historicalLimits);
    }

    @Transactional
    public List<DemandSpecialModule> replaceForDemand(
            Long demandId,
            List<DemandManpowerDetail> manpowerDetails,
            List<DemandSpecialModule> specialModuleDemands,
            boolean existingDemand) {
        List<DemandSpecialModule> existing = specialRepository.findByDemandIdOrderByIdAsc(demandId);
        Map<Long, BigDecimal> historicalLimits = existingDemand
            ? existing.stream().collect(Collectors.toMap(
                DemandSpecialModule::getModuleId,
                DemandSpecialModule::getManpowerDemand))
            : Map.of();

        List<DemandSpecialModule> requested = specialList(specialModuleDemands);
        validate(manpowerDetails, requested, historicalLimits);

        specialRepository.deleteByDemandId(demandId);
        specialRepository.flush();
        if (requested.isEmpty()) {
            return List.of();
        }

        List<DemandSpecialModule> replacements = requested.stream()
            .map(item -> replacement(demandId, item))
            .toList();
        return specialRepository.saveAll(replacements);
    }

    @Transactional(readOnly = true)
    public List<DemandSpecialModule> findByDemandId(Long demandId) {
        return enrich(specialRepository.findByDemandIdOrderByIdAsc(demandId));
    }

    @Transactional(readOnly = true)
    public Map<Long, List<DemandSpecialModule>> findByDemandIds(List<Long> demandIds) {
        if (demandIds == null || demandIds.isEmpty()) {
            return Map.of();
        }
        List<DemandSpecialModule> rows = enrich(
            specialRepository.findByDemandIdInOrderByDemandIdAscIdAsc(demandIds));
        return rows.stream().collect(Collectors.groupingBy(
            DemandSpecialModule::getDemandId,
            LinkedHashMap::new,
            Collectors.toList()));
    }

    public List<ManpowerSummary> summarize(
            List<DemandManpowerDetail> manpowerDetails,
            List<DemandSpecialModule> specialModuleDemands) {
        Map<String, BigDecimal> groupTotals = new LinkedHashMap<>();
        for (DemandManpowerDetail detail : detailList(manpowerDetails)) {
            if (detail.getTestType() != null) {
                groupTotals.merge(
                    detail.getTestType(), valueOrZero(detail.getManpowerDemand()), BigDecimal::add);
            }
        }

        Map<String, BigDecimal> specialTotals = new LinkedHashMap<>();
        for (DemandSpecialModule special : specialList(specialModuleDemands)) {
            if (special.getTestType() == null) {
                throw new BusinessException("MODULE_GROUP_MISMATCH", "特殊模块所属小组不存在");
            }
            specialTotals.merge(
                special.getTestType(), valueOrZero(special.getManpowerDemand()), BigDecimal::add);
        }

        return groupTotals.entrySet().stream()
            .map(entry -> {
                BigDecimal special = specialTotals.getOrDefault(entry.getKey(), BigDecimal.ZERO);
                return new ManpowerSummary(
                    entry.getKey(), entry.getValue(), special, entry.getValue().subtract(special));
            })
            .toList();
    }

    private void validate(
            List<DemandManpowerDetail> manpowerDetails,
            List<DemandSpecialModule> specialModuleDemands,
            Map<Long, BigDecimal> historicalLimits) {
        List<DemandSpecialModule> requested = specialList(specialModuleDemands);
        Set<Long> moduleIds = new LinkedHashSet<>();
        for (DemandSpecialModule item : requested) {
            if (item.getModuleId() == null) {
                throw new BusinessException("SPECIAL_MODULE_REQUIRED", "特殊模块不能为空");
            }
            validateManpower(item.getManpowerDemand());
            if (!moduleIds.add(item.getModuleId())) {
                throw new BusinessException("SPECIAL_MODULE_DUPLICATE", "同一特殊模块只能填写一次");
            }
        }

        if (requested.isEmpty()) {
            return;
        }

        List<TestModuleConfig> configurations = moduleRepository.findAllById(new ArrayList<>(moduleIds));
        Map<Long, TestModuleConfig> configurationById = configurations.stream()
            .collect(Collectors.toMap(TestModuleConfig::getId, Function.identity()));
        if (configurationById.size() != moduleIds.size()) {
            throw new BusinessException("MODULE_NOT_FOUND", "特殊模块不存在");
        }

        Map<String, BigDecimal> groupTotals = detailList(manpowerDetails).stream()
            .filter(detail -> detail.getTestType() != null)
            .collect(Collectors.toMap(
                DemandManpowerDetail::getTestType,
                detail -> valueOrZero(detail.getManpowerDemand()),
                BigDecimal::add,
                LinkedHashMap::new));
        Map<String, BigDecimal> specialTotals = new LinkedHashMap<>();

        for (DemandSpecialModule item : requested) {
            TestModuleConfig configuration = configurationById.get(item.getModuleId());
            applyConfiguration(item, configuration);
            if (!Boolean.TRUE.equals(configuration.getEnabled())
                    && !isAllowedHistoricalValue(item, historicalLimits)) {
                throw new BusinessException(
                    "MODULE_DISABLED_FOR_NEW_DEMAND", "停用模块不能新增或增加人力");
            }
            if (!groupTotals.containsKey(configuration.getTestType())) {
                throw new BusinessException(
                    "MODULE_GROUP_MISMATCH", "特殊模块所属小组不在需求人力明细中");
            }
            specialTotals.merge(
                configuration.getTestType(), item.getManpowerDemand(), BigDecimal::add);
        }

        for (Map.Entry<String, BigDecimal> entry : specialTotals.entrySet()) {
            if (entry.getValue().compareTo(groupTotals.get(entry.getKey())) > 0) {
                throw new BusinessException(
                    "SPECIAL_MODULE_EXCEEDS_GROUP", "特殊模块人力合计不能超过小组总人力");
            }
        }
    }

    private List<DemandSpecialModule> enrich(List<DemandSpecialModule> rows) {
        if (rows.isEmpty()) {
            return rows;
        }
        List<Long> moduleIds = rows.stream()
            .map(DemandSpecialModule::getModuleId)
            .distinct()
            .toList();
        Map<Long, TestModuleConfig> configurationById = moduleRepository.findAllById(moduleIds)
            .stream()
            .collect(Collectors.toMap(TestModuleConfig::getId, Function.identity()));
        if (configurationById.size() != moduleIds.size()) {
            throw new BusinessException("MODULE_NOT_FOUND", "特殊模块不存在");
        }
        rows.forEach(row -> applyConfiguration(row, configurationById.get(row.getModuleId())));
        return rows;
    }

    private void applyConfiguration(
            DemandSpecialModule special, TestModuleConfig configuration) {
        special.setModuleName(configuration.getModuleName());
        special.setTestType(configuration.getTestType());
        special.setEnabled(configuration.getEnabled());
        special.setAllocatedManpower(BigDecimal.ZERO);
        special.setRemainingManpower(special.getManpowerDemand());
    }

    private boolean isAllowedHistoricalValue(
            DemandSpecialModule item, Map<Long, BigDecimal> historicalLimits) {
        BigDecimal historical = historicalLimits.get(item.getModuleId());
        return historical != null && item.getManpowerDemand().compareTo(historical) <= 0;
    }

    private void validateManpower(BigDecimal manpower) {
        if (manpower == null
                || manpower.compareTo(BigDecimal.ZERO) <= 0
                || manpower.stripTrailingZeros().scale() > 1
                || manpower.compareTo(new BigDecimal("999999999.9")) > 0) {
            throw new BusinessException(
                "SPECIAL_MODULE_MANPOWER_INVALID", "特殊模块人力必须大于0且最多保留一位小数");
        }
    }

    private DemandSpecialModule replacement(Long demandId, DemandSpecialModule source) {
        DemandSpecialModule target = new DemandSpecialModule();
        target.setDemandId(demandId);
        target.setModuleId(source.getModuleId());
        target.setManpowerDemand(source.getManpowerDemand());
        target.setModuleName(source.getModuleName());
        target.setTestType(source.getTestType());
        target.setEnabled(source.getEnabled());
        target.setAllocatedManpower(BigDecimal.ZERO);
        target.setRemainingManpower(source.getManpowerDemand());
        return target;
    }

    private List<DemandManpowerDetail> detailList(List<DemandManpowerDetail> details) {
        return details == null ? Collections.emptyList() : details;
    }

    private List<DemandSpecialModule> specialList(List<DemandSpecialModule> specials) {
        return specials == null ? Collections.emptyList() : specials;
    }

    private BigDecimal valueOrZero(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }
}
