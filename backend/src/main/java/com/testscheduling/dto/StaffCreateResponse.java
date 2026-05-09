package com.testscheduling.dto;

import com.testscheduling.entity.TestStaff;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class StaffCreateResponse {
    private TestStaff staff;
    private String generatedPassword;
}
