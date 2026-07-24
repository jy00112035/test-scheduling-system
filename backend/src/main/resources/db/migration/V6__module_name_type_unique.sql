-- Change module name uniqueness from global to per (module_name, test_type) pair.
-- This allows modules with the same name to exist under different test type groups.
ALTER TABLE test_module_config DROP CONSTRAINT uk_test_module_name;
ALTER TABLE test_module_config ADD CONSTRAINT uk_test_module_name_type UNIQUE (module_name, test_type);
