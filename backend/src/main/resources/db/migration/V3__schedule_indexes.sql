CREATE INDEX idx_schedule_demand_id ON schedule(demand_id);
CREATE INDEX idx_schedule_staff_date ON schedule(staff_id, date);
CREATE INDEX idx_schedule_special_module_id ON schedule(demand_special_module_id);
CREATE INDEX idx_schedule_manpower_detail_id ON schedule(demand_manpower_detail_id);
