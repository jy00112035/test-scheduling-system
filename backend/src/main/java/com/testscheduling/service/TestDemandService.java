package com.testscheduling.service;

import com.testscheduling.entity.TestDemand;
import com.testscheduling.repository.TestDemandRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class TestDemandService {

    @Autowired
    private TestDemandRepository testDemandRepository;

    public List<TestDemand> findAll() {
        return testDemandRepository.findAll();
    }

    public TestDemand findById(Long id) {
        return testDemandRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("测试需求不存在"));
    }

    public List<TestDemand> findByStatus(TestDemand.DemandStatus status) {
        return testDemandRepository.findByStatus(status);
    }

    public List<TestDemand> findPendingAndScheduled() {
        return testDemandRepository.findByStatusIn(
            List.of(TestDemand.DemandStatus.pending, TestDemand.DemandStatus.scheduled)
        );
    }

    @Transactional
    public TestDemand create(TestDemand demand) {
        return testDemandRepository.save(demand);
    }

    @Transactional
    public TestDemand update(Long id, TestDemand demand) {
        TestDemand existing = findById(id);
        existing.setProduct(demand.getProduct());
        existing.setVersion(demand.getVersion());
        existing.setStartDate(demand.getStartDate());
        existing.setEndDate(demand.getEndDate());
        existing.setManpowerDemand(demand.getManpowerDemand());
        existing.setVersionType(demand.getVersionType());
        existing.setVersionPhase(demand.getVersionPhase());
        existing.setDescription(demand.getDescription());
        existing.setStatus(demand.getStatus());
        return testDemandRepository.save(existing);
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
        return testDemandRepository.findByStatus(TestDemand.DemandStatus.submitted);
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
    public void batchRejectDemands(List<Long> ids) {
        for (Long id : ids) {
            rejectDemand(id);
        }
    }
}
