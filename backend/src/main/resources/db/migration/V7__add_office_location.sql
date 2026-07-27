-- 办公地点字段：test_staff 表新增列 + field_config 新增配置
ALTER TABLE test_staff ADD COLUMN IF NOT EXISTS office_location VARCHAR(255);

-- 仅在 field_config 中不存在 officeLocation 时插入
INSERT INTO field_config (field_name, field_type, options, description, required, sort_order, created_at, updated_at)
SELECT 'officeLocation', 'select', '', '办公地点', true, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM field_config WHERE field_name = 'officeLocation');
