package com.testscheduling.service;

import com.testscheduling.dto.FeedbackCreateRequest;
import com.testscheduling.dto.FeedbackQueryParams;
import com.testscheduling.dto.FeedbackResponse;
import com.testscheduling.dto.FeedbackUpdateRequest;
import com.testscheduling.entity.Feedback;
import com.testscheduling.exception.BusinessException;
import com.testscheduling.repository.FeedbackRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FeedbackServiceTest {

    @Mock
    private FeedbackRepository feedbackRepository;

    @Mock
    private FeishuWebhookService feishuWebhookService;

    @InjectMocks
    private FeedbackService feedbackService;

    @Test
    void create_shouldSaveAndNotify() {
        FeedbackCreateRequest request = new FeedbackCreateRequest();
        request.setType("BUG");
        request.setTitle("Test Bug");
        request.setDescription("Description");

        Feedback saved = new Feedback();
        saved.setId(1L);
        saved.setType("BUG");
        saved.setTitle("Test Bug");
        saved.setDescription("Description");
        saved.setSubmitterId("user1");
        saved.setSubmitterName("user1");
        saved.setStatus("PENDING");
        saved.setCreatedAt(LocalDateTime.now());
        saved.setUpdatedAt(LocalDateTime.now());

        when(feedbackRepository.save(any(Feedback.class))).thenReturn(saved);

        FeedbackResponse response = feedbackService.create("user1", List.of("testManager"), request);

        assertNotNull(response);
        assertEquals(1L, response.getId());
        assertEquals("BUG", response.getType());
        assertEquals("PENDING", response.getStatus());
        verify(feishuWebhookService, times(1)).sendFeedbackNotification(any(Feedback.class));
    }

    @Test
    void updateStatus_shouldUpdateAndReturn() {
        Feedback feedback = new Feedback();
        feedback.setId(1L);
        feedback.setStatus("PENDING");
        feedback.setCreatedAt(LocalDateTime.now());
        feedback.setUpdatedAt(LocalDateTime.now());

        when(feedbackRepository.findById(1L)).thenReturn(Optional.of(feedback));
        when(feedbackRepository.save(any(Feedback.class))).thenReturn(feedback);

        FeedbackUpdateRequest request = new FeedbackUpdateRequest();
        request.setStatus("RESOLVED");
        request.setAdminNote("Fixed in v2.0");

        FeedbackResponse response = feedbackService.updateStatus(1L, request);

        assertEquals("RESOLVED", response.getStatus());
        assertEquals("Fixed in v2.0", response.getAdminNote());
    }

    @Test
    void updateStatus_shouldThrowWhenNotFound() {
        when(feedbackRepository.findById(99L)).thenReturn(Optional.empty());

        FeedbackUpdateRequest request = new FeedbackUpdateRequest();
        request.setStatus("RESOLVED");

        assertThrows(BusinessException.class, () -> feedbackService.updateStatus(99L, request));
    }

    @Test
    void findFiltered_shouldReturnPage() {
        Feedback feedback = new Feedback();
        feedback.setId(1L);
        feedback.setType("BUG");
        feedback.setTitle("Test");
        feedback.setDescription("Desc");
        feedback.setSubmitterId("user1");
        feedback.setSubmitterName("User 1");
        feedback.setStatus("PENDING");
        feedback.setCreatedAt(LocalDateTime.now());
        feedback.setUpdatedAt(LocalDateTime.now());

        Page<Feedback> page = new PageImpl<>(List.of(feedback));
        when(feedbackRepository.findAll(any(Specification.class), any(Pageable.class))).thenReturn(page);

        FeedbackQueryParams params = new FeedbackQueryParams();
        params.setType("BUG");
        Page<FeedbackResponse> result = feedbackService.findFiltered(params);

        assertEquals(1, result.getTotalElements());
        assertEquals("BUG", result.getContent().get(0).getType());
    }

    @Test
    void findBySubmitter_shouldReturnPage() {
        Feedback feedback = new Feedback();
        feedback.setId(1L);
        feedback.setType("FEATURE");
        feedback.setTitle("My Feedback");
        feedback.setDescription("Desc");
        feedback.setSubmitterId("user1");
        feedback.setSubmitterName("User 1");
        feedback.setStatus("PENDING");
        feedback.setCreatedAt(LocalDateTime.now());
        feedback.setUpdatedAt(LocalDateTime.now());

        Page<Feedback> page = new PageImpl<>(List.of(feedback));
        when(feedbackRepository.findBySubmitterIdOrderByCreatedAtDesc(eq("user1"), any(Pageable.class)))
                .thenReturn(page);

        Page<FeedbackResponse> result = feedbackService.findBySubmitter("user1", 0, 20);

        assertEquals(1, result.getTotalElements());
        assertEquals("user1", result.getContent().get(0).getSubmitterId());
    }

    @Test
    void findAllForExport_shouldReturnList() {
        Feedback feedback = new Feedback();
        feedback.setId(1L);
        feedback.setType("BUG");
        feedback.setTitle("Export Test");
        feedback.setDescription("Desc");
        feedback.setSubmitterId("user1");
        feedback.setSubmitterName("User 1");
        feedback.setStatus("RESOLVED");
        feedback.setCreatedAt(LocalDateTime.now());
        feedback.setUpdatedAt(LocalDateTime.now());

        Page<Feedback> page = new PageImpl<>(List.of(feedback));
        when(feedbackRepository.findAll(any(Specification.class), any(Pageable.class))).thenReturn(page);

        FeedbackQueryParams params = new FeedbackQueryParams();
        List<FeedbackResponse> result = feedbackService.findAllForExport(params);

        assertEquals(1, result.size());
        assertEquals("RESOLVED", result.get(0).getStatus());
    }

    @Test
    void updateStatus_shouldNotOverwriteAdminNoteWhenNull() {
        Feedback feedback = new Feedback();
        feedback.setId(1L);
        feedback.setStatus("PENDING");
        feedback.setAdminNote("Existing note");
        feedback.setCreatedAt(LocalDateTime.now());
        feedback.setUpdatedAt(LocalDateTime.now());

        when(feedbackRepository.findById(1L)).thenReturn(Optional.of(feedback));
        when(feedbackRepository.save(any(Feedback.class))).thenReturn(feedback);

        FeedbackUpdateRequest request = new FeedbackUpdateRequest();
        request.setStatus("IN_PROGRESS");
        request.setAdminNote(null);

        FeedbackResponse response = feedbackService.updateStatus(1L, request);

        assertEquals("IN_PROGRESS", response.getStatus());
        assertEquals("Existing note", response.getAdminNote());
        verify(feedbackRepository).save(feedback);
    }
}
