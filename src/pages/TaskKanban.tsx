import React, { useState, useEffect } from 'react';
import { Card, Select, DatePicker, Tag, Tooltip, message, Button, Modal } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { api } from '../services/api';
import * as XLSX from 'xlsx';
import { DailyAvailabilityStatus, DailyStatusLabels, DailyStatusColors } from '../types';

const { Option } = Select;
const { RangePicker } = DatePicker;

const dayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const TaskKanban: React.FC = () => {
  const [viewDate, setViewDate] = useState<Dayjs>(dayjs());
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [filterProducts, setFilterProducts] = useState<string[]>([]);
  const [staffs, setStaffs] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportDateRange, setExportDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [exportProduct, setExportProduct] = useState<string | undefined>(undefined);
  const [exportVersion, setExportVersion] = useState<string | undefined>(undefined);
  const [exportLoading, setExportLoading] = useState(false);
  const [dailyStatuses, setDailyStatuses] = useState<Map<string, { status: DailyAvailabilityStatus; percentage: number }>>(new Map());

  useEffect(() => {
    fetchData();
  }, [viewDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const weekEnd = viewDate.add(6, 'day').format('YYYY-MM-DD');
      const weekStart = viewDate.format('YYYY-MM-DD');
      const [staffData, scheduleData, statusData] = await Promise.all([
        api.getStaff(),
        api.getPublishedSchedules(),
        api.getDailyStatuses(weekStart, weekEnd),
      ]);
      setStaffs(staffData);
      setSchedules(scheduleData);
      const map = new Map<string, { status: DailyAvailabilityStatus; percentage: number }>();
      statusData.forEach((s: any) => map.set(`${s.staffId}-${s.date}`, { status: s.status, percentage: s.percentage ?? 100 }));
      setDailyStatuses(map);
    } catch (error: any) {
      message.error(error.message || '获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!exportDateRange || exportDateRange.length !== 2) {
      message.warning('请选择导出的日期范围');
      return;
    }
    setExportLoading(true);
    try {
      const startDate = exportDateRange[0].format('YYYY-MM-DD');
      const endDate = exportDateRange[1].format('YYYY-MM-DD');
      const exportSchedules = await api.getSchedulesByRange(startDate, endDate);

      let filtered = exportSchedules;
      if (exportProduct) {
        filtered = filtered.filter((s: any) => s.product === exportProduct);
      }
      if (exportVersion) {
        filtered = filtered.filter((s: any) => s.version === exportVersion);
      }

      if (filtered.length === 0) {
        message.info('所选条件下无排班数据');
        setExportLoading(false);
        return;
      }

      const staffMap = new Map(staffs.map((s: any) => [s.id, s]));

      const rows = filtered.map((s: any) => {
        const staff = staffMap.get(s.staffId);
        return {
          '日期': s.date,
          '产品': s.product,
          '版本号': s.version || '',
          '版本类型': s.versionType || '',
          '人员姓名': staff?.name || '',
          '工号': staff?.empNo || '',
          '测试小组': staff?.testType || '',
          '投入比例(%)': s.percentage,
          '测试经理': s.testManager || '',
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '排班数据');

      const colWidths = [
        { wch: 12 }, // 日期
        { wch: 20 }, // 产品
        { wch: 12 }, // 版本号
        { wch: 10 }, // 版本类型
        { wch: 10 }, // 人员姓名
        { wch: 12 }, // 工号
        { wch: 14 }, // 测试小组
        { wch: 13 }, // 投入比例
        { wch: 14 }, // 测试经理
      ];
      worksheet['!cols'] = colWidths;

      XLSX.writeFile(workbook, `任务看板排班导出_${startDate}_${endDate}.xlsx`);
      message.success(`成功导出 ${rows.length} 条排班记录`);
      setExportModalVisible(false);
    } catch (error: any) {
      message.error(error.message || '导出失败');
    } finally {
      setExportLoading(false);
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

  const filteredStaffs = (() => {
    let result = groupFilter === 'all'
      ? staffs
      : staffs.filter((s: any) => s.testType === groupFilter);

    if (filterProducts.length > 0) {
      const weekDateStrs = weekDates.map(d => d.format('YYYY-MM-DD'));
      result = result.filter((s: any) =>
        schedules.some(
          sch => sch.staffId === s.id && weekDateStrs.includes(sch.date) && filterProducts.includes(sch.product)
        )
      );
    }
    return result;
  })();

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
            <Select
              mode="multiple"
              placeholder="产品筛选"
              style={{ minWidth: 200 }}
              value={filterProducts}
              onChange={setFilterProducts}
              allowClear
              maxTagCount={2}
              options={[...new Set(schedules.map(s => s.product).filter(Boolean))].map(p => ({ label: p, value: p }))}
            />
            <Button
              icon={<DownloadOutlined />}
              onClick={() => setExportModalVisible(true)}
            >
              导出
            </Button>
          </div>
          <div>
            <span style={{ color: '#666' }}>
              共 {filteredStaffs.length} 人
            </span>
          </div>
        </div>
      </Card>

      <Card loading={loading} bodyStyle={{ padding: 0, overflow: 'auto', maxHeight: 'calc(100vh - 180px)' }}>
          <table className="kanban-table">
            <thead>
              <tr style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                <th style={{ minWidth: 110, position: 'sticky', left: 0, background: '#fafafa', zIndex: 6 }}>姓名</th>
                <th style={{ minWidth: 80, position: 'sticky', left: 110, background: '#fafafa', zIndex: 6 }}>工号</th>
                <th style={{ minWidth: 80, position: 'sticky', left: 190, background: '#fafafa', zIndex: 6 }}>测试小组</th>
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
                    padding: '4px 4px',
                    fontSize: '13px',
                    borderRight: '1px solid #e8e8e8',
                    whiteSpace: 'nowrap',
                  }}>
                    <span style={{ fontWeight: 500 }}>{staff.name}</span>
                    <Tag
                      color={staff.currentCoefficient === 1.0 ? 'green' : 'orange'}
                      style={{ fontSize: '10px', padding: '0 4px', marginLeft: 4 }}
                    >
                      {staff.currentCoefficient?.toFixed(1) || '1.0'}
                    </Tag>
                  </td>
                  <td style={{
                    position: 'sticky',
                    left: 110,
                    background: '#fff',
                    zIndex: 1,
                    padding: '4px 4px',
                    fontSize: '12px',
                    color: '#666',
                    borderRight: '1px solid #e8e8e8',
                  }}>
                    {staff.empNo || '-'}
                  </td>
                  <td style={{
                    position: 'sticky',
                    left: 190,
                    background: '#fff',
                    zIndex: 1,
                    padding: '4px 4px',
                    fontSize: '12px',
                    color: '#666',
                    borderRight: '1px solid #e8e8e8',
                  }}>
                    {staff.testType || '-'}
                  </td>
                  {weekDates.map((date, dayIndex) => {
                    const dateStr = date.format('YYYY-MM-DD');
                    const daySchedules = getSchedulesForStaffAndDate(staff.id, dateStr);
                    const isWeekend = [0, 6].includes(date.day());
                    const statusEntry = dailyStatuses.get(`${staff.id}-${dateStr}`);
                    const dailyStatus = statusEntry?.status;
                    const statusBgColor = dailyStatus && dailyStatus !== 'AVAILABLE'
                      ? `${DailyStatusColors[dailyStatus]}18`
                      : undefined;

                    let cellBg = '#fff';
                    if (statusBgColor) {
                      cellBg = statusBgColor;
                    } else if (isWeekend) {
                      cellBg = '#fff7e6';
                    } else if (isToday(date)) {
                      cellBg = '#f0f5ff';
                    }

                    return (
                      <td
                        key={dayIndex}
                        style={{
                          background: cellBg,
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
                                {schedule.version && <div>版本号：{schedule.version}</div>}
                                <div>版本类型：{schedule.versionType}</div>
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
                        {dailyStatus && dailyStatus !== 'AVAILABLE' && (
                          <div style={{
                            fontSize: 10,
                            color: DailyStatusColors[dailyStatus],
                            fontWeight: 500,
                            textAlign: 'center',
                            marginTop: 2,
                            padding: '1px 2px',
                            background: `${DailyStatusColors[dailyStatus]}22`,
                            borderRadius: 2,
                          }}>
                            {DailyStatusLabels[dailyStatus]}
                            {statusEntry!.percentage < 100 && ` ${statusEntry!.percentage}%`}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
      </Card>

      <Modal
        title="导出排班数据"
        open={exportModalVisible}
        onCancel={() => setExportModalVisible(false)}
        footer={null}
        width={420}
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>日期范围</div>
            <RangePicker
              value={exportDateRange as any}
              onChange={(dates) => setExportDateRange(dates as [Dayjs, Dayjs] | null)}
              placeholder={['开始日期', '结束日期']}
              format="YYYY-MM-DD"
              allowClear
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>产品（可选）</div>
            <Select
              value={exportProduct}
              onChange={setExportProduct}
              placeholder="全部产品"
              allowClear
              style={{ width: '100%' }}
              options={[...new Set(schedules.map((s: any) => s.product).filter(Boolean))].map(p => ({ label: p, value: p }))}
            />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>版本号（可选）</div>
            <Select
              value={exportVersion}
              onChange={setExportVersion}
              placeholder="全部版本"
              allowClear
              style={{ width: '100%' }}
              options={[...new Set(schedules
                .filter((s: any) => !exportProduct || s.product === exportProduct)
                .map((s: any) => s.version)
                .filter(Boolean)
              )].map(v => ({ label: v, value: v }))}
            />
          </div>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            loading={exportLoading}
            onClick={handleExport}
            block
          >
            导出
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default TaskKanban;
