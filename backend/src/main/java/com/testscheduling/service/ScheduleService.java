package com.testscheduling.service;

import com.testscheduling.dto.GanttViewItem;
import com.testscheduling.entity.Schedule;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.entity.TestStaff;
import com.testscheduling.entity.User;
import com.testscheduling.repository.ScheduleRepository;
import com.testscheduling.repository.TestDemandRepository;
import com.testscheduling.repository.TestStaffRepository;
import com.testscheduling.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class ScheduleService {

    @Autowired
    private ScheduleRepository scheduleRepository;

    @Autowired
    private TestDemandRepository demandRepository;

    @Autowired
    private TestStaffRepository testStaffRepository;

    @Autowired
    private UserRepository userRepository;

    public List<Schedule> findAll() {
        return scheduleRepository.findAll();
    }

    public Schedule findById(Long id) {
        return scheduleRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("排班记录不存在"));
    }

    public List<Schedule> findByDate(LocalDate date) {
        return scheduleRepository.findByDate(date);
    }

    public List<Schedule> findByStaffId(Long staffId) {
        return scheduleRepository.findByStaffId(staffId);
    }

    public List<Schedule> findByDateRange(LocalDate startDate, LocalDate endDate) {
        return scheduleRepository.findByDateRange(startDate, endDate);
    }

    public List<Schedule> findByStaffIdAndDateRange(Long staffId, LocalDate startDate, LocalDate endDate) {
        return scheduleRepository.findByStaffIdAndDateRange(staffId, startDate, endDate);
    }

    @Transactional
    public Schedule create(Schedule schedule) {
        validateConfidentialClearance(schedule.getDemandId(), schedule.getStaffId());
        return scheduleRepository.save(schedule);
    }

    @Transactional
    public List<Schedule> createBatch(List<Schedule> schedules) {
        for (Schedule schedule : schedules) {
            validateConfidentialClearance(schedule.getDemandId(), schedule.getStaffId());
        }
        return scheduleRepository.saveAll(schedules);
    }

    @Transactional
    public Schedule update(Long id, Schedule schedule) {
        Schedule existing = findById(id);
        existing.setDate(schedule.getDate());
        existing.setPercentage(schedule.getPercentage());
        return scheduleRepository.save(existing);
    }

    @Transactional
    public void delete(Long id) {
        scheduleRepository.deleteById(id);
    }

    @Transactional
    public void deleteByDemandId(Long demandId) {
        scheduleRepository.findByDemandId(demandId)
            .forEach(s -> scheduleRepository.deleteById(s.getId()));
    }

    public List<Schedule> findPublished() {
        return scheduleRepository.findByPublishedTrue();
    }

    @Transactional
    public void publishByDemandId(Long demandId) {
        TestDemand demand = demandRepository.findById(demandId).orElse(null);
        if (demand != null && Boolean.TRUE.equals(demand.getConfidential())) {
            List<Schedule> schedules = scheduleRepository.findByDemandId(demandId);
            for (Schedule s : schedules) {
                validateStaffConfidentialClearance(s.getStaffId(), "无法发布保密项目排班");
            }
        }
        scheduleRepository.findByDemandId(demandId)
            .forEach(s -> {
                s.setPublished(true);
                scheduleRepository.save(s);
            });
    }

    private void validateConfidentialClearance(Long demandId, Long staffId) {
        TestDemand demand = demandRepository.findById(demandId).orElse(null);
        if (demand != null && Boolean.TRUE.equals(demand.getConfidential())) {
            validateStaffConfidentialClearance(staffId, "无法参与保密项目测试");
        }
    }

    private void validateStaffConfidentialClearance(Long staffId, String actionMessage) {
        TestStaff staff = testStaffRepository.findById(staffId).orElse(null);
        if (staff == null) {
            throw new RuntimeException("人员不存在");
        }

        User user = userRepository.findByUsername(staff.getEmpNo()).orElse(null);
        if (user == null || !Boolean.TRUE.equals(user.getConfidentialClearance())) {
            throw new RuntimeException(staff.getName() + " 不具备保密权限，" + actionMessage);
        }
    }

    @Transactional
    public void unpublishByDemandId(Long demandId) {
        scheduleRepository.findByDemandId(demandId)
            .forEach(s -> {
                s.setPublished(false);
                scheduleRepository.save(s);
            });
    }

    /**
     * 获取甘特图视图数据
     * 包含进度计算和风险评估
     */
    public List<GanttViewItem> getGanttView() {
        // 获取所有有排班记录的需求
        List<Long> scheduledDemandIds = scheduleRepository.findAll().stream()
            .map(Schedule::getDemandId)
            .distinct()
            .collect(Collectors.toList());

        List<TestDemand> demands = demandRepository.findAll().stream()
            .filter(d -> scheduledDemandIds.contains(d.getId()))
            .collect(Collectors.toList());

        List<GanttViewItem> ganttItems = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();

        for (TestDemand demand : demands) {
            GanttViewItem item = new GanttViewItem();
            item.setDemandId(demand.getId());
            item.setProduct(demand.getProduct());
            item.setVersion(demand.getVersion());
            item.setVersionType(demand.getVersionType());
            item.setVersionPhase(demand.getVersionPhase());
            item.setStartDate(demand.getStartDate());
            item.setEndDate(demand.getEndDate());
            item.setStatus(demand.getStatus().name());
            item.setManpowerDemand(demand.getManpowerDemand());
            item.setPriority(demand.getPriority());
            item.setConfidential(demand.getConfidential());

            // 计算已分配人力
            List<Schedule> schedules = scheduleRepository.findByDemandId(demand.getId());
            double allocatedDays = schedules.stream()
                .mapToDouble(s -> s.getPercentage() / 100.0)
                .sum();
            item.setAllocatedDays(allocatedDays);

            // 计算剩余缺口
            double remainingDays = demand.getManpowerDemand().doubleValue() - allocatedDays;
            item.setRemainingDays(Math.max(0, remainingDays));

            // 计算距离结束日期的天数
            long daysToEnd = ChronoUnit.DAYS.between(now.toLocalDate(), demand.getEndDate().toLocalDate());
            item.setDaysToEnd(daysToEnd);

            // 计算进度百分比（基于人力分配）
            double progressPercentage = calculateProgressPercentageByAllocation(demand, allocatedDays);
            item.setProgressPercentage(progressPercentage);

            // 计算排班实际起止日期
            if (!schedules.isEmpty()) {
                LocalDate scheduleStart = schedules.stream()
                    .map(Schedule::getDate)
                    .min(LocalDate::compareTo)
                    .orElse(null);
                LocalDate scheduleEnd = schedules.stream()
                    .map(Schedule::getDate)
                    .max(LocalDate::compareTo)
                    .orElse(null);
                item.setScheduleStartDate(scheduleStart);
                item.setScheduleEndDate(scheduleEnd);

                // 判断排班是否超出测试周期
                LocalDate demandEndDate = demand.getEndDate() != null ? demand.getEndDate().toLocalDate() : null;
                if (scheduleEnd != null && demandEndDate != null) {
                    item.setScheduleExceedsDemand(scheduleEnd.isAfter(demandEndDate));
                } else {
                    item.setScheduleExceedsDemand(false);
                }

                // 计算每日排班汇总
                Map<LocalDate, List<Schedule>> schedulesByDate = schedules.stream()
                    .collect(Collectors.groupingBy(Schedule::getDate));
                List<GanttViewItem.DailySchedule> dailySchedules = new ArrayList<>();
                for (Map.Entry<LocalDate, List<Schedule>> entry : schedulesByDate.entrySet()) {
                    GanttViewItem.DailySchedule daily = new GanttViewItem.DailySchedule();
                    daily.setDate(entry.getKey());
                    daily.setTotalPercentage(entry.getValue().stream().mapToInt(Schedule::getPercentage).sum());
                    daily.setStaffCount(entry.getValue().size());
                    dailySchedules.add(daily);
                }
                dailySchedules.sort(Comparator.comparing(GanttViewItem.DailySchedule::getDate));
                item.setDailySchedules(dailySchedules);
            } else {
                item.setScheduleStartDate(null);
                item.setScheduleEndDate(null);
                item.setScheduleExceedsDemand(false);
                item.setDailySchedules(new ArrayList<>());
            }

            // 计算风险分数和风险因素
            RiskAssessment risk = assessRisk(demand, allocatedDays, daysToEnd, remainingDays);
            item.setRiskScore(risk.score);
            item.setRiskFactors(risk.factors);

            ganttItems.add(item);
        }

        return ganttItems;
    }

    /**
     * 计算进度百分比（基于时间）
     */
    private double calculateProgressPercentage(TestDemand demand, LocalDateTime now) {
        if (demand.getStartDate() == null || demand.getEndDate() == null) {
            return 0.0;
        }

        // 如果已完成，返回 100%
        if ("completed".equals(demand.getStatus())) {
            return 100.0;
        }

        long totalDays = ChronoUnit.DAYS.between(demand.getStartDate().toLocalDate(), demand.getEndDate().toLocalDate());
        if (totalDays <= 0) {
            return 0.0;
        }

        long elapsedDays = ChronoUnit.DAYS.between(demand.getStartDate().toLocalDate(), now.toLocalDate());

        // 限制在 0-100 之间
        double percentage = (elapsedDays * 100.0) / totalDays;
        return Math.max(0.0, Math.min(100.0, percentage));
    }

    /**
     * 计算进度百分比（基于人力分配）
     * 进度 = 已分配人力 / 需求人力 * 100
     */
    private double calculateProgressPercentageByAllocation(TestDemand demand, double allocatedDays) {
        if (demand.getManpowerDemand() == null || demand.getManpowerDemand().doubleValue() <= 0) {
            return 0.0;
        }

        // 如果已完成，返回 100%
        if ("completed".equals(demand.getStatus())) {
            return 100.0;
        }

        double percentage = (allocatedDays / demand.getManpowerDemand().doubleValue()) * 100.0;
        return Math.max(0.0, Math.min(100.0, percentage));
    }

    /**
     * 风险评估
     */
    private RiskAssessment assessRisk(TestDemand demand, double allocatedDays, long daysToEnd, double remainingDays) {
        RiskAssessment risk = new RiskAssessment();
        risk.score = 0;
        risk.factors = new ArrayList<>();

        // 1. 超期风险（40分）
        if (daysToEnd < 0) {
            risk.score += 40;
            risk.factors.add("已超期 " + Math.abs(daysToEnd) + " 天");
        } else if (daysToEnd <= 3) {
            risk.score += 30;
            risk.factors.add("剩余时间不足（" + daysToEnd + " 天）");
        }

        // 2. 人力缺口风险（30分）
        if (remainingDays > 0) {
            double gapRatio = remainingDays / demand.getManpowerDemand().doubleValue();
            if (gapRatio > 0.3) {
                risk.score += 30;
                risk.factors.add("人力缺口 " + String.format("%.1f", remainingDays) + " 人/天（严重）");
            } else if (gapRatio > 0.1) {
                risk.score += 20;
                risk.factors.add("人力缺口 " + String.format("%.1f", remainingDays) + " 人/天");
            } else {
                risk.score += 10;
                risk.factors.add("人力缺口较小（" + String.format("%.1f", remainingDays) + " 人/天）");
            }
        }

        // 3. 优先级风险（20分）
        if ("P0".equals(demand.getPriority()) || "紧急".equals(demand.getPriority())) {
            risk.score += 20;
            risk.factors.add("高优先级需求（" + demand.getPriority() + "）");
        } else if ("P1".equals(demand.getPriority()) || "高".equals(demand.getPriority())) {
            risk.score += 10;
            risk.factors.add("中高优先级（" + demand.getPriority() + "）");
        }

        // 4. 进度滞后风险（10分）
        double expectedProgress = calculateProgressPercentage(demand, LocalDateTime.now());
        double actualProgress = demand.getManpowerDemand().doubleValue() > 0
            ? (allocatedDays / demand.getManpowerDemand().doubleValue()) * 100.0
            : 0.0;

        if (expectedProgress > actualProgress + 20) {
            risk.score += 10;
            risk.factors.add("进度滞后（预期 " + String.format("%.0f", expectedProgress) + "%，实际 " + String.format("%.0f", actualProgress) + "%）");
        }

        return risk;
    }

    /**
     * 内部类：风险评估结果
     */
    private static class RiskAssessment {
        int score;
        List<String> factors;
    }
}
