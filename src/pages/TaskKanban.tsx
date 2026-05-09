import React, { useState, useEffect } from 'react';
import { Card, Select, DatePicker, Tag, Tooltip, message } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { api } from '../services/api';

const { Option } = Select;

const dayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const TaskKanban: React.FC = () => {
  const [viewDate, setViewDate] = useState<Dayjs>(dayjs());
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [staffs, setStaffs] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [staffData, scheduleData] = await Promise.all([
        api.getStaff(),
        api.getPublishedSchedules()
      ]);
      setStaffs(staffData);
      setSchedules(scheduleData);
    } catch (error: any) {
      message.error(error.message || '获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  const weekDates = Array.from({ length: 7 }, (_, i) => viewDate.add(i, 'day'));
  const weekDays = weekDates.map(d => dayLabels[d.day()]);

  const getVersionTypeColor = (type: string) => {
    const colorMap: Record<string, string> = {
      '维护': '#1890ff',
      '在研': '#52c41a',
      '升级': '#faad14',
    };
    return colorMap[type] || '#1890ff';
  };

  const filteredStaffs = groupFilter === 'all'
    ? staffs
    : staffs.filter((s: any) => s.testType === groupFilter);

  const getSchedulesForStaffAndDate = (staffId: number, date: string) => {
    return schedules.filter((s: any) => s.staffId === staffId && s.date === date);
  };

  const isToday = (date: dayjs.Dayjs) => {
    return date.isSame(dayjs(), 'day');
  };

  const testTypes = Array.from(new Set(staffs.map((s: any) => s.testType).filter(Boolean)));

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <span>选择周：</span>
            <DatePicker
              value={viewDate}
              onChange={(date) => date && setViewDate(date)}
              picker="week"
              allowClear={false}
            />
            <Select
              value={groupFilter}
              onChange={setGroupFilter}
              style={{ width: 150 }}
            >
              <Option value="all">全部测试类型</Option>
              {testTypes.map(t => (
                <Option key={t} value={t}>{t}</Option>
              ))}
            </Select>
          </div>
          <div>
            <span style={{ color: '#666' }}>
              共 {filteredStaffs.length} 人
            </span>
          </div>
        </div>
      </Card>

      <Card loading={loading}>
        <div style={{ overflowX: 'auto' }}>
          <table className="kanban-table">
            <thead>
              <tr>
                <th style={{ minWidth: 120, position: 'sticky', left: 0, background: '#fafafa', zIndex: 2 }}>人员</th>
                <th style={{ minWidth: 80, position: 'sticky', left: 120, background: '#fafafa', zIndex: 2 }}>测试小组</th>
                {weekDates.map((date, index) => {
                  const isWeekend = [0, 6].includes(date.day());
                  return (
                  <th key={index} style={{
                    minWidth: 100,
                    background: isWeekend ? '#fff7e6' : isToday(date) ? '#e6f7ff' : '#fafafa'
                  }}>
                    <div style={{ color: isWeekend ? '#fa8c16' : undefined }}>{weekDays[index]}</div>
                    <div style={{ fontSize: 12, color: isWeekend ? '#fa8c16' : '#666' }}>{date.format('MM-DD')}</div>
                  </th>
                )})}
              </tr>
            </thead>
            <tbody>
              {filteredStaffs.map((staff: any) => (
                <tr key={staff.id}>
                  <td style={{
                    position: 'sticky',
                    left: 0,
                    background: '#fff',
                    zIndex: 1,
                    padding: '6px 4px',
                    fontSize: '13px',
                    borderRight: '1px solid #e8e8e8'
                  }}>
                    <div style={{ fontWeight: 500 }}>{staff.name}</div>
                    <div style={{ fontSize: 11, color: '#666' }}>{staff.groupName}</div>
                    <Tag
                      color={staff.currentCoefficient === 1.0 ? 'green' : 'orange'}
                      style={{ fontSize: '10px', padding: '0 4px', marginTop: 2 }}
                    >
                      系数 {staff.currentCoefficient?.toFixed(1) || '1.0'}
                    </Tag>
                  </td>
                  <td style={{
                    position: 'sticky',
                    left: 120,
                    background: '#fff',
                    zIndex: 1,
                    padding: '6px 4px',
                    fontSize: '12px',
                    color: '#666',
                    borderRight: '1px solid #e8e8e8'
                  }}>
                    {staff.testType || '-'}
                  </td>
                  {weekDates.map((date, dayIndex) => {
                    const dateStr = date.format('YYYY-MM-DD');
                    const daySchedules = getSchedulesForStaffAndDate(staff.id, dateStr);
                    const isWeekend = [0, 6].includes(date.day());
                    return (
                      <td
                        key={dayIndex}
                        style={{
                          background: isWeekend ? '#fff7e6' : isToday(date) ? '#f0f5ff' : '#fff',
                          verticalAlign: 'top',
                          padding: '4px',
                          borderLeft: '1px solid #e8e8e8'
                        }}
                      >
                        {daySchedules.map((schedule: any) => (
                          <Tooltip
                            key={schedule.id}
                            title={
                              <div>
                                <div>产品：{schedule.product}</div>
                                <div>版本：{schedule.versionType}</div>
                                <div>投入：{schedule.percentage}%</div>
                              </div>
                            }
                          >
                            <div
                              className="schedule-item"
                              style={{
                                background: getVersionTypeColor(schedule.versionType) + '20',
                                borderLeft: `3px solid ${getVersionTypeColor(schedule.versionType)}`,
                                marginBottom: 4,
                              }}
                            >
                              <div style={{ fontWeight: 500, fontSize: 12 }}>{schedule.product}</div>
                              <div style={{ fontSize: 11, color: '#666' }}>{schedule.percentage}%</div>
                            </div>
                          </Tooltip>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default TaskKanban;
