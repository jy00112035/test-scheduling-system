CREATE TABLE test_module_config (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    module_name VARCHAR(100) NOT NULL,
    test_type VARCHAR(100) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    lock_version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT uk_test_module_name UNIQUE (module_name)
);

CREATE INDEX idx_module_test_type_enabled
    ON test_module_config(test_type, enabled, sort_order);

CREATE TABLE demand_special_module (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    demand_id BIGINT NOT NULL,
    module_id BIGINT NOT NULL,
    manpower_demand DECIMAL(10,1) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT uk_demand_special_module UNIQUE (demand_id, module_id),
    CONSTRAINT fk_dsm_demand FOREIGN KEY (demand_id) REFERENCES test_demand(id),
    CONSTRAINT fk_dsm_module FOREIGN KEY (module_id) REFERENCES test_module_config(id),
    CONSTRAINT ck_dsm_manpower_positive CHECK (manpower_demand > 0)
);

CREATE TABLE test_staff_module (
    staff_id BIGINT NOT NULL,
    module_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL,
    PRIMARY KEY (staff_id, module_id),
    CONSTRAINT fk_tsm_staff FOREIGN KEY (staff_id) REFERENCES test_staff(id),
    CONSTRAINT fk_tsm_module FOREIGN KEY (module_id) REFERENCES test_module_config(id)
);

CREATE TABLE audit_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    action_type VARCHAR(60) NOT NULL,
    entity_type VARCHAR(60) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    operator_name VARCHAR(100) NOT NULL,
    before_value TEXT NULL,
    after_value TEXT NULL,
    created_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id, created_at);

ALTER TABLE schedule ADD COLUMN demand_manpower_detail_id BIGINT NULL;
ALTER TABLE schedule ADD COLUMN demand_special_module_id BIGINT NULL;
ALTER TABLE schedule ADD COLUMN lock_version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE test_demand ADD COLUMN lock_version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE test_staff ADD COLUMN lock_version BIGINT NOT NULL DEFAULT 0;

ALTER TABLE schedule ADD CONSTRAINT fk_schedule_manpower_detail
    FOREIGN KEY (demand_manpower_detail_id) REFERENCES demand_manpower_detail(id);
ALTER TABLE schedule ADD CONSTRAINT fk_schedule_special_module
    FOREIGN KEY (demand_special_module_id) REFERENCES demand_special_module(id);
