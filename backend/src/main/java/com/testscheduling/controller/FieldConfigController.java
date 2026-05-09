package com.testscheduling.controller;

import com.testscheduling.dto.ApiResponse;
import com.testscheduling.entity.FieldConfig;
import com.testscheduling.service.FieldConfigService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/field-configs")
public class FieldConfigController {

    @Autowired
    private FieldConfigService fieldConfigService;

    @GetMapping
    public ApiResponse<List<FieldConfig>> getAllConfigs() {
        return ApiResponse.success(fieldConfigService.findAll());
    }

    @GetMapping("/{id}")
    public ApiResponse<FieldConfig> getConfigById(@PathVariable Long id) {
        try {
            return ApiResponse.success(fieldConfigService.findById(id));
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @GetMapping("/name/{fieldName}")
    public ApiResponse<FieldConfig> getConfigByFieldName(@PathVariable String fieldName) {
        FieldConfig config = fieldConfigService.findByFieldName(fieldName);
        if (config != null) {
            return ApiResponse.success(config);
        }
        return ApiResponse.error("字段配置不存在");
    }

    @PostMapping
    public ApiResponse<FieldConfig> createConfig(@RequestBody FieldConfig config) {
        return ApiResponse.success("创建成功", fieldConfigService.create(config));
    }

    @PutMapping("/{id}")
    public ApiResponse<FieldConfig> updateConfig(@PathVariable Long id, @RequestBody FieldConfig config) {
        try {
            return ApiResponse.success("更新成功", fieldConfigService.update(id, config));
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> deleteConfig(@PathVariable Long id) {
        try {
            fieldConfigService.delete(id);
            return ApiResponse.success("删除成功", null);
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }
}
