import React, { useState, useEffect } from 'react';
import { Card, Table, Select, Button, Space, Tag, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../services/api';

const { Option } = Select;

interface ReportItem {
  product: string;
  demandCount: number;
  plannedManpower: number;
  actualManpower: number;
  differenceRate: number;
  avgCycle: number;
}

const Reports: React.FC = () => {
  const [timePeriod, setTimePeriod] = useState<string>('month');
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchReports();
  }, [timePeriod]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const [demands, schedules] = await Promise.all([
        api.getDemands(),
        api.getPublishedSchedules()
      ]);

      const demandMap = new Map<number, any>();
      demands.forEach((d: any) => demandMap.set(d.id, d));

      const productMap = new Map<string, ReportItem & { totalCycleDays: number; cycleCount: number }>();

      demands.forEach((demand: any) => {
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
            <Select value={timePeriod} onChange={setTimePeriod} style={{ width: 120 }}>
              <Option value="week">本周</Option>
              <Option value="month">本月</Option>
              <Option value="quarter">本季度</Option>
              <Option value="year">本年</Option>
            </Select>
          </Space>
          <Button icon={<DownloadOutlined />}>导出报表</Button>
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
