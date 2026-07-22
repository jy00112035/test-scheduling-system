package com.testscheduling.dto;

import java.util.List;

public record BatchPublishResponse(List<Success> success, List<Failure> failed) {
    public BatchPublishResponse {
        success = List.copyOf(success == null ? List.of() : success);
        failed = List.copyOf(failed == null ? List.of() : failed);
    }

    public int successCount() {
        return success.size();
    }

    public int failureCount() {
        return failed.size();
    }

    public record Success(Long demandId, int scheduleCount) { }

    public record Failure(Long demandId, String reasonCode, String reason) { }
}
