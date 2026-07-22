package com.testscheduling.dto;

import java.util.List;

public record BatchPublishRequest(List<Long> demandIds) { }
