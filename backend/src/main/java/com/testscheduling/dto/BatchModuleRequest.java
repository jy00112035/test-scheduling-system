package com.testscheduling.dto;

import java.util.List;

public record BatchModuleRequest(List<TestModuleRequest> modules) {
}
