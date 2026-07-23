CREATE TABLE IF NOT EXISTS users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    test_type VARCHAR(255),
    familiar_modules VARCHAR(500),
    confidential_clearance BOOLEAN DEFAULT FALSE,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP,
    CONSTRAINT uk_users_username UNIQUE (username)
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id BIGINT NOT NULL,
    role VARCHAR(255) NOT NULL,
    CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS test_staff (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    emp_no VARCHAR(255) NOT NULL,
    join_date DATE,
    group_name VARCHAR(255),
    test_type VARCHAR(255),
    initial_coefficient DECIMAL(3,2),
    current_coefficient DECIMAL(3,2),
    status VARCHAR(30),
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT uk_test_staff_emp_no UNIQUE (emp_no)
);

CREATE TABLE IF NOT EXISTS test_demand (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    product VARCHAR(255) NOT NULL,
    version VARCHAR(255),
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    manpower_demand DECIMAL(10,2),
    version_type VARCHAR(255) NOT NULL,
    version_phase VARCHAR(255),
    description TEXT,
    status VARCHAR(30),
    submitted_by VARCHAR(255),
    confidential BOOLEAN DEFAULT FALSE,
    priority VARCHAR(255),
    test_device_count INT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS demand_manpower_detail (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    demand_id BIGINT NOT NULL,
    test_type VARCHAR(255) NOT NULL,
    manpower_demand DECIMAL(10,2),
    remark VARCHAR(200),
    CONSTRAINT fk_manpower_detail_demand FOREIGN KEY (demand_id) REFERENCES test_demand(id)
);

CREATE TABLE IF NOT EXISTS schedule (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    demand_id BIGINT,
    staff_id BIGINT,
    date DATE,
    percentage INT,
    product VARCHAR(255),
    test_manager VARCHAR(255),
    version_type VARCHAR(255),
    version VARCHAR(255),
    published BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS staff_daily_status (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    staff_id BIGINT NOT NULL,
    date DATE NOT NULL,
    status VARCHAR(40) NOT NULL,
    percentage DOUBLE DEFAULT 100.0,
    CONSTRAINT uk_staff_daily_status UNIQUE (staff_id, date)
);

CREATE TABLE IF NOT EXISTS field_config (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    field_name VARCHAR(255) NOT NULL,
    field_type VARCHAR(255) NOT NULL,
    options TEXT,
    description VARCHAR(255),
    required BOOLEAN DEFAULT FALSE,
    sort_order INT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
