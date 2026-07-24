-- 存储需求变更时的原始快照和被删除的排班记录，用于审批时展示变更差异
ALTER TABLE test_demand ADD COLUMN revision_original_snapshot TEXT;
ALTER TABLE test_demand ADD COLUMN revision_deleted_schedules TEXT;
