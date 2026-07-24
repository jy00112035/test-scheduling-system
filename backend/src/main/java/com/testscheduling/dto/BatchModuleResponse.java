package com.testscheduling.dto;

import com.testscheduling.entity.TestModuleConfig;

import java.util.List;

public record BatchModuleResponse(List<TestModuleConfig> created, List<BatchModuleError> errors) {
}
