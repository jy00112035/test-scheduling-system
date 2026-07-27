package com.testscheduling.service;

import com.testscheduling.entity.FieldConfig;
import com.testscheduling.repository.FieldConfigRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FieldConfigServiceTest {

    @Mock FieldConfigRepository repository;
    @InjectMocks FieldConfigService service;

    @Test
    void appendStaffOptionsLoadsEachChangedFieldWithPessimisticWriteLock() {
        FieldConfig group = new FieldConfig();
        group.setFieldName("groupName");
        group.setOptions("已有项目");
        FieldConfig testType = new FieldConfig();
        testType.setFieldName("testType");
        testType.setOptions("功能测试");
        when(repository.findByFieldNameForUpdate("groupName")).thenReturn(Optional.of(group));
        when(repository.findByFieldNameForUpdate("testType")).thenReturn(Optional.of(testType));

        service.appendStaffOptions(" 新项目 ", " 自动化测试 ", null);

        assertEquals("已有项目,新项目", group.getOptions());
        assertEquals("功能测试,自动化测试", testType.getOptions());
        verify(repository).findByFieldNameForUpdate("groupName");
        verify(repository).findByFieldNameForUpdate("testType");
        verify(repository, never()).findByFieldName("groupName");
        verify(repository, never()).findByFieldName("testType");
        verify(repository).save(group);
        verify(repository).save(testType);
    }
}
