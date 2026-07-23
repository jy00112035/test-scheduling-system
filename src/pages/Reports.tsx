import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Tag, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { DatePicker } from 'antd';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { api } from '../services/api';

const { RangePicker } = DatePicker;

interface ReportItem {
  product: string;
  demandCount: number;
  plannedManpower: number;
  actualManpower: number;
  differenceRate: number;
  avgCycle: number;
}

const Reports: React.FC = () => {
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Legacy dependency behavior; refactor under dedicated tests.
  }, [dateRange]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const [demands, schedules] = await Promise.all([
        api.getDemands(),
        api.getPublishedSchedules()
      ]);

      const rangeStart = dateRange[0].startOf('day');
      const rangeEnd = dateRange[1].endOf('day');

      // 按日期范围过滤需求：需求的开始日期或结束日期与选择范围有交集
      const filteredDemands = demands.filter((d: any) => {
        if (!d.startDate || !d.endDate) return true; // 无日期的需求保留
        const start = dayjs(d.startDate);
        const end = dayjs(d.endDate);
        return start.isBefore(rangeEnd) && end.isAfter(rangeStart);
      });

      const filteredDemandIds = new Set(filteredDemands.map((d: any) => d.id));

      const demandMap = new Map<number, any>();
      filteredDemands.forEach((d: any) => demandMap.set(d.id, d));

      const productMap = new Map<string, ReportItem & { totalCycleDays: number; cycleCount: number }>();

      filteredDemands.forEach((demand: any) => {
        const product = demand.product || '未知产品';
        if (productMap.has(product)) {
          const item = productMap.get(product)!;
          item.demandCount++;
          item.plannedManpower += demand.manpowerDemand || 0;
          if (demand.startDate && demand.endDate) {
            item.totalCycleDays += dayjs(demand.endDate).diff(dayjs(demand.startDate), 'day');
            item.cycleCount++;
          }
        } else {
          let cycleDays = 0;
          let hasCycle = false;
          if (demand.startDate && demand.endDate) {
            cycleDays = dayjs(demand.endDate).diff(dayjs(demand.startDate), 'day');
            hasCycle = true;
          }
          productMap.set(product, {
            product,
            demandCount: 1,
            plannedManpower: demand.manpowerDemand || 0,
            actualManpower: 0,
            differenceRate: 0,
            avgCycle: 0,
            totalCycleDays: cycleDays,
            cycleCount: hasCycle ? 1 : 0,
          });
        }
      });

      schedules.forEach((schedule: any) => {
        if (!filteredDemandIds.has(schedule.demandId)) return;
        const demand = demandMap.get(schedule.demandId);
        if (demand) {
          const product = demand.product || '未知产品';
          const item = productMap.get(product);
          if (item) {
            item.actualManpower += (schedule.percentage || 0) / 100;
          }
        }
      });

      const reportData: ReportItem[] = Array.from(productMap.values()).map(item => {
        const actual = Math.round(item.actualManpower * 10) / 10;
        const diffRate = item.plannedManpower > 0
          ? Number(((actual - item.plannedManpower) / item.plannedManpower).toFixed(2))
          : 0;
        const avg = item.cycleCount > 0
          ? Number((item.totalCycleDays / item.cycleCount).toFixed(1))
          : 0;
        return {
          product: item.product,
          demandCount: item.demandCount,
          plannedManpower: item.plannedManpower,
          actualManpower: actual,
          differenceRate: diffRate,
          avgCycle: avg,
        };
      });

      setReports(reportData);
    } catch (error: any) {
      message.error(error.message || '获取报表数据失败');
    } finally {
      setLoading(false);
    }
  };

  const getRateColor = (rate: number) => {
    if (rate > 0) return 'red';
    if (rate < 0) return 'green';
    return 'default';
  };

  const getRateText = (rate: number) => {
    const sign = rate > 0 ? '+' : '';
    return `${sign}${(rate * 100).toFixed(1)}%`;
  };

  const handleExport = () => {
    if (reports.length === 0) {
      message.warning('暂无数据可导出');
      return;
    }
    const rows = reports.map(item => ({
      '产品名称': item.product,
      '测试需求数': item.demandCount,
      '计划人力总需求（人/天）': item.plannedManpower,
      '实际人力总投入（人/天）': item.actualManpower,
      '差异率': getRateText(item.differenceRate),
      '平均测试周期（天）': item.avgCycle,
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '统计报表');
    const startDate = dateRange[0].format('YYYYMMDD');
    const endDate = dateRange[1].format('YYYYMMDD');
    XLSX.writeFile(workbook, `统计报表_${startDate}_${endDate}.xlsx`);
  };

  const columns = [
    {
      title: '产品名称',
      dataIndex: 'product',
      key: 'product',
      width: 180,
      fixed: 'left' as const,
    },
    {
      title: '测试需求数',
      dataIndex: 'demandCount',
      key: 'demandCount',
      width: 120,
      align: 'right' as const,
    },
    {
      title: '计划人力总需求（人/天）',
      dataIndex: 'plannedManpower',
      key: 'plannedManpower',
      width: 160,
      align: 'right' as const,
    },
    {
      title: '实际人力总投入（人/天）',
      dataIndex: 'actualManpower',
      key: 'actualManpower',
      width: 160,
      align: 'right' as const,
    },
    {
      title: '差异率',
      dataIndex: 'differenceRate',
      key: 'differenceRate',
      width: 100,
      align: 'right' as const,
      render: (rate: number) => (
        <Tag color={getRateColor(rate)}>
          {getRateText(rate)}
        </Tag>
      ),
    },
    {
      title: '平均测试周期（天）',
      dataIndex: 'avgCycle',
      key: 'avgCycle',
      width: 140,
      align: 'right' as const,
    },
  ];

  return (
    <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 96px)' }}>
      <Card style={{ marginBottom: 16, position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <span>时间范围：</span>
            <RangePicker
              value={dateRange}
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) {
                  setDateRange([dates[0], dates[1]]);
                }
              }}
              allowClear={false}
            />
          </Space>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>导出报表</Button>
        </div>
      </Card>

      <Card>
        <Table
          columns={columns}
          dataSource={reports}
          rowKey="product"
          bordered
          loading={loading}
          pagination={false}
          sticky={{ offsetHeader: 64 }}
          scroll={{ x: 800 }}
        />
      </Card>
    </div>
  );
};

export default Reports;
