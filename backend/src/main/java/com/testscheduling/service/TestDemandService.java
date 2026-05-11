package com.testscheduling.service;

import com.testscheduling.entity.DemandManpowerDetail;
import com.testscheduling.entity.TestDemand;
import com.testscheduling.repository.DemandManpowerDetailRepository;
import com.testscheduling.repository.TestDemandRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

@Service
public class TestDemandService {

    @Autowired
    private TestDemandRepository testDemandRepository;

    @Autowired
    private DemandManpowerDetailRepository detailRepository;

    public List<TestDemand> findAll() {
        List<TestDemand> demands = testDemandRepository.findAll();
        demands.forEach(this::enrichWithDetails);
        return demands;
    }

    public TestDemand findById(Long id) {
        TestDemand demand = testDemandRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("测试需求不存在"));
        return enrichWithDetails(demand);
    }

    public List<TestDemand> findByStatus(TestDemand.DemandStatus status) {
        List<TestDemand> demands = testDemandRepository.findByStatus(status);
        demands.forEach(this::enrichWithDetails);
        return demands;
    }

    public List<TestDemand> findPendingAndScheduled() {
        List<TestDemand> demands = testDemandRepository.findByStatusIn(
            List.of(TestDemand.DemandStatus.pending, TestDemand.DemandStatus.scheduled)
        );
        demands.forEach(this::enrichWithDetails);
        return demands;
    }

    @Transactional
    public TestDemand create(TestDemand demand) {
        // 先计算总人天
        BigDecimal total = computeTotalManpower(demand.getManpowerDetails());
        demand.setManpowerDemand(total);
        TestDemand saved = testDemandRepository.save(demand);

        // 保存明细
        if (demand.getManpowerDetails() != null) {
            for (DemandManpowerDetail detail : demand.getManpowerDetails()) {
                detail.setDemandId(saved.getId());
                detailRepository.save(detail);
            }
        }
        return enrichWithDetails(saved);
    }

    @Transactional
    public TestDemand update(Long id, TestDemand demand) {
        TestDemand existing = findById(id);
        existing.setProduct(demand.getProduct());
        existing.setVersion(demand.getVersion());
        existing.setStartDate(demand.getStartDate());
        existing.setEndDate(demand.getEndDate());
        existing.setVersionType(demand.getVersionType());
        existing.setVersionPhase(demand.getVersionPhase());
        existing.setDescription(demand.getDescription());
        existing.setStatus(demand.getStatus());

        // 更新明细
        detailRepository.deleteByDemandId(id);
        if (demand.getManpowerDetails() != null) {
            for (DemandManpowerDetail detail : demand.getManpowerDetails()) {
                detail.setDemandId(id);
                detailRepository.save(detail);
            }
        }
        BigDecimal total = computeTotalManpower(demand.getManpowerDetails());
        existing.setManpowerDemand(total);

        return enrichWithDetails(testDemandRepository.save(existing));
    }

    @Transactional
    public void delete(Long id) {
        testDemandRepository.deleteById(id);
    }

    @Transactional
    public TestDemand close(Long id) {
        TestDemand demand = findById(id);
        demand.setStatus(TestDemand.DemandStatus.completed);
        return testDemandRepository.save(demand);
    }

    public List<TestDemand> findPendingApproval() {
        List<TestDemand> demands = testDemandRepository.findByStatus(TestDemand.DemandStatus.submitted);
        demands.forEach(this::enrichWithDetails);
        return demands;
    }

    @Transactional
    public TestDemand approveDemand(Long id) {
        TestDemand demand = findById(id);
        if (demand.getStatus() != TestDemand.DemandStatus.submitted) {
            throw new RuntimeException("只能批准状态为'已提交待审批'的需求");
        }
        demand.setStatus(TestDemand.DemandStatus.pending);
        return testDemandRepository.save(demand);
    }

    @Transactional
    public void rejectDemand(Long id) {
        TestDemand demand = findById(id);
        if (demand.getStatus() != TestDemand.DemandStatus.submitted) {
            throw new RuntimeException("只能退回状态为'已提交待审批'的需求");
        }
        demand.setStatus(TestDemand.DemandStatus.rejected);
        testDemandRepository.save(demand);
    }

    @Transactional
    public void batchApproveDemands(List<Long> ids) {
        for (Long id : ids) {
            approveDemand(id);
        }
    }

    @Transactional
    public TestDemand approveWithChanges(Long id, TestDemand modifiedDemand) {
        TestDemand demand = findById(id);
        if (demand.getStatus() != TestDemand.DemandStatus.submitted) {
            throw new RuntimeException("只能修改并批准状态为'已提交待审批'的需求");
        }
        // 只允许修改测试周期
        demand.setStartDate(modifiedDemand.getStartDate());
        demand.setEndDate(modifiedDemand.getEndDate());

        // 更新人力明细
        if (modifiedDemand.getManpowerDetails() != null) {
            detailRepository.deleteByDemandId(id);
            for (DemandManpowerDetail detail : modifiedDemand.getManpowerDetails()) {
                detail.setDemandId(id);
                detailRepository.save(detail);
            }
            BigDecimal total = computeTotalManpower(modifiedDemand.getManpowerDetails());
            demand.setManpowerDemand(total);
        }

        demand.setStatus(TestDemand.DemandStatus.pending);
        return enrichWithDetails(testDemandRepository.save(demand));
    }

    @Transactional
    public void batchRejectDemands(List<Long> ids) {
        for (Long id : ids) {
            rejectDemand(id);
        }
    }

    private BigDecimal computeTotalManpower(List<DemandManpowerDetail> details) {
        if (details == null || details.isEmpty()) {
            return BigDecimal.ZERO;
        }
        return details.stream()
            .map(d -> d.getManpowerDemand() != null ? d.getManpowerDemand() : BigDecimal.ZERO)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private TestDemand enrichWithDetails(TestDemand demand) {
        if (demand != null) {
            List<DemandManpowerDetail> details = detailRepository.findByDemandId(demand.getId());
            demand.setManpowerDetails(details);
        }
        return demand;
    }
}
