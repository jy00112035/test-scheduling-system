package com.testscheduling.service;

import com.testscheduling.dto.FeedbackCreateRequest;
import com.testscheduling.dto.FeedbackQueryParams;
import com.testscheduling.dto.FeedbackResponse;
import com.testscheduling.dto.FeedbackUpdateRequest;
import com.testscheduling.entity.Feedback;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.FeedbackRepository;
import jakarta.persistence.criteria.Predicate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class FeedbackService {

    @Autowired
    private FeedbackRepository feedbackRepository;

    @Autowired
    private FeishuWebhookService feishuWebhookService;

    public FeedbackResponse create(String username, List<String> roles, FeedbackCreateRequest request) {
        Feedback feedback = new Feedback();
        feedback.setType(request.getType());
        feedback.setTitle(request.getTitle());
        feedback.setDescription(request.getDescription());
        feedback.setSubmitterId(username);
        feedback.setSubmitterName(username);
        feedback.setStatus("PENDING");

        Feedback saved = feedbackRepository.save(feedback);

        // Async send to Feishu
        feishuWebhookService.sendFeedbackNotification(saved);

        return FeedbackResponse.from(saved);
    }

    public Page<FeedbackResponse> findFiltered(FeedbackQueryParams params) {
        Specification<Feedback> spec = buildSpecification(params);
        Pageable pageable = PageRequest.of(
            Math.max(0, params.getPage()),
            Math.min(100, Math.max(1, params.getSize())),
            Sort.by(Sort.Direction.DESC, "createdAt")
        );
        Page<Feedback> page = feedbackRepository.findAll(spec, pageable);
        return page.map(FeedbackResponse::from);
    }

    public Page<FeedbackResponse> findBySubmitter(String submitterId, int page, int size) {
        Pageable pageable = PageRequest.of(
            Math.max(0, page),
            Math.min(100, Math.max(1, size))
        );
        Page<Feedback> result = feedbackRepository.findBySubmitterIdOrderByCreatedAtDesc(submitterId, pageable);
        return result.map(FeedbackResponse::from);
    }

    public FeedbackResponse updateStatus(Long id, FeedbackUpdateRequest request) {
        Feedback feedback = feedbackRepository.findById(id)
            .orElseThrow(() -> new BusinessException("NOT_FOUND", "反馈不存在"));

        feedback.setStatus(request.getStatus());
        if (request.getAdminNote() != null) {
            feedback.setAdminNote(request.getAdminNote());
        }

        Feedback updated = feedbackRepository.save(feedback);
        return FeedbackResponse.from(updated);
    }

    public List<FeedbackResponse> findAllForExport(FeedbackQueryParams params) {
        Specification<Feedback> spec = buildSpecification(params);
        Pageable pageable = PageRequest.of(0, 1000, Sort.by(Sort.Direction.DESC, "createdAt"));
        return feedbackRepository.findAll(spec, pageable).stream()
            .map(FeedbackResponse::from)
            .toList();
    }

    private Specification<Feedback> buildSpecification(FeedbackQueryParams params) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            if (params.getType() != null && !params.getType().isBlank()) {
                predicates.add(cb.equal(root.get("type"), params.getType()));
            }
            if (params.getStatus() != null && !params.getStatus().isBlank()) {
                predicates.add(cb.equal(root.get("status"), params.getStatus()));
            }
            if (params.getSubmitterId() != null && !params.getSubmitterId().isBlank()) {
                predicates.add(cb.equal(root.get("submitterId"), params.getSubmitterId()));
            }

            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
