package com.testscheduling.dto;

import java.util.List;
import java.util.Map;

public record LegacyModuleMigrationReport(
        int createdRelations,
        Map<String, List<String>> duplicateNames,
        Map<String, List<String>> unmatched,
        List<String> missingStaffAccounts) {
}
