-- H2 compatible migration for field_config integrity
-- Step 1: Get survivors (keep lowest id per field_name)
CREATE TEMPORARY TABLE IF NOT EXISTS field_survivors AS
SELECT field_name, MIN(id) AS survivor_id
FROM field_config
GROUP BY field_name;

-- Step 2: Update survivors with merged options (simplified - keep existing options)
-- Note: Full deduplication of comma-separated options requires application logic
UPDATE field_config
SET options = options
WHERE id IN (SELECT survivor_id FROM field_survivors);

-- Step 3: Delete duplicates (non-survivors)
DELETE FROM field_config
WHERE id NOT IN (SELECT survivor_id FROM field_survivors);

-- Step 4: Add unique constraint
ALTER TABLE field_config
    ADD CONSTRAINT IF NOT EXISTS uk_field_config_field_name UNIQUE (field_name);

-- Cleanup
DROP TABLE IF EXISTS field_survivors;
