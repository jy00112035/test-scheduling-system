import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Table } from 'antd';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { UserOutlined, ArrowUpOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../services/api';
import { DailyStatusLabels } from '../types';

const COLORS = ['#1890ff', '#52c41a', '#ff4d4f', '#faad14', '#722ed1', '#13c2c2'];

const dayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({
    parallelProducts: 0,
    totalStaff: 0,
    workingStaff: 0,
    idleStaff: 0,
    utilizationRate: 0,
    versionTypeStats: [] as Array<{ id: number; name: string; avgManpower: number; count: number }>,
  });
  const [trendData, setTrendData] = useState<Array<{ date: string; count: number }>>([]);
  const [utilizationData, setUtilizationData] = useState<Array<{ date: string; rate: number }>>([]);
  const [pieData, setPieData] = useState<Array<{ name: string; value: number }>>([]);
  const [demandCount, setDemandCount] = useState(0);
  const [testTypeStats, setTestTypeStats] = useState<Array<{
    testType: string;
    totalDemand: number;
    totalStaff: number;
    availableStaff: number;
    allocatedToday: number;
    remark: string;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const today = dayjs();
      const todayStr = today.format('YYYY-MM-DD');
      const next3End = today.add(2, 'day').format('YYYY-MM-DD');

      const [demands, schedules, staff, dailyStatuses] = await Promise.all([
        api.getDemands(),
        api.getPublishedSchedules(),
        api.getStaff(),
        api.getDailyStatuses(todayStr, next3End),
      ]);

      const activeStaff = staff.filter((s: any) => s.status === 'active');
      const totalActiveStaff = activeStaff.length;

      const demandMap = new Map<number, any>();
      demands.forEach((d: any) => demandMap.set(d.id, d));

      // Today's working/idle staff from schedules
      const todaySchedules = schedules.filter((s: any) => s.date === todayStr);
      const workingStaffIds = new Set(todaySchedules.map((s: any) => s.staffId));
      const workingStaff = workingStaffIds.size;
      const idleStaff = Math.max(0, totalActiveStaff - workingStaff);
      const utilizationRate = totalActiveStaff > 0 ? workingStaff / totalActiveStaff : 0;

      // Products with schedules
      const productsWithSchedules = new Set<string>();
      schedules.forEach((s: any) => {
        const demand = demandMap.get(s.demandId);
        if (demand?.product) productsWithSchedules.add(demand.product);
      });

      // Trend: last 7 days
      const last7Days = Array.from({ length: 7 }, (_, i) => dayjs().subtract(6 - i, 'day'));
      const trend = last7Days.map(date => {
        const dateStr = date.format('YYYY-MM-DD');
        const daySchedules = schedules.filter((s: any) => s.date === dateStr);
        const products = new Set<string>();
        daySchedules.forEach((s: any) => {
          const d = demandMap.get(s.demandId);
          if (d?.product) products.add(d.product);
        });
        return { date: dayLabels[date.day()], count: products.size };
      });

      const utilization = last7Days.map(date => {
        const dateStr = date.format('YYYY-MM-DD');
        const daySchedules = schedules.filter((s: any) => s.date === dateStr);
        const staffIds = new Set(daySchedules.map((s: any) => s.staffId));
        const rate = totalActiveStaff > 0 ? Math.round((staffIds.size / totalActiveStaff) * 100) : 0;
        return { date: dayLabels[date.day()], rate };
      });

      // Pie: manpower by version type
      const vtManpowerMap = new Map<string, number>();
      schedules.forEach((s: any) => {
        const demand = demandMap.get(s.demandId);
        if (demand?.versionType) {
          const vt = demand.versionType;
          vtManpowerMap.set(vt, (vtManpowerMap.get(vt) || 0) + (s.percentage || 0) / 100);
        }
      });
      const pie = Array.from(vtManpowerMap.entries()).map(([name, value]) => ({
        name,
        value: Math.round(value * 10) / 10,
      }));

      // Version type stats from demands
      const vtDemandMap = new Map<string, number>();
      demands.forEach((d: any) => {
        const vt = d.versionType || '其他';
        vtDemandMap.set(vt, (vtDemandMap.get(vt) || 0) + 1);
      });
      const vtStats = Array.from(vtDemandMap.entries()).map(([name, count], index) => ({
        id: index + 1,
        name,
        avgManpower: pie.find(p => p.name === name)?.value || 0,
        count,
      }));

      setStats({
        parallelProducts: productsWithSchedules.size,
        totalStaff: totalActiveStaff,
        workingStaff,
        idleStaff,
        utilizationRate,
        versionTypeStats: vtStats,
      });
      setTrendData(trend);
      setUtilizationData(utilization);
      setPieData(pie.length > 0 ? pie : [{ name: '暂无数据', value: 1 }]);
      setDemandCount(demands.length);

      // --- TestType resource panel ---
      const demandByTestType = new Map<string, number>();
      demands.forEach((d: any) => {
        if (d.manpowerDetails) {
          d.manpowerDetails.forEach((md: any) => {
            const prev = demandByTestType.get(md.testType) || 0;
            demandByTestType.set(md.testType, prev + (Number(md.manpowerDemand) || 0));
          });
        }
      });

      // Staff lookup maps
      const staffMap = new Map<number, any>();
      const staffTestTypeMap = new Map<number, string>();
      activeStaff.forEach((s: any) => {
        staffMap.set(s.id, s);
        if (s.testType) staffTestTypeMap.set(s.id, s.testType);
      });

      // Total staff per testType
      const totalByTestType = new Map<string, number>();
      activeStaff.forEach((s: any) => {
        if (s.testType) {
          totalByTestType.set(s.testType, (totalByTestType.get(s.testType) || 0) + 1);
        }
      });

      // Available staff per testType (fractional for half-day scenarios)
      // and per-person unavailable details for remarks
      const availableByTestType = new Map<string, number>();
      const unavailableStaff = new Map<string, Array<{
        name: string; empNo: string; fraction: number; statusLabel: string;
      }>>();

      dailyStatuses.forEach((ds: any) => {
        if (ds.date !== todayStr) return;
        const st = staffTestTypeMap.get(ds.staffId);
        if (!st) return;

        if (ds.status === 'AVAILABLE') {
          availableByTestType.set(st, (availableByTestType.get(st) || 0) + 1);
        } else {
          const unavailableFraction = (ds.percentage ?? 100) / 100;
          const availFraction = 1 - unavailableFraction;
          availableByTestType.set(st, (availableByTestType.get(st) || 0) + availFraction);

          const staffInfo = staffMap.get(ds.staffId);
          if (staffInfo) {
            if (!unavailableStaff.has(st)) {
              unavailableStaff.set(st, []);
            }
            unavailableStaff.get(st)!.push({
              name: staffInfo.name,
              empNo: staffInfo.empNo,
              fraction: unavailableFraction,
              statusLabel: DailyStatusLabels[ds.status as keyof typeof DailyStatusLabels] || ds.status,
            });
          }
        }
      });

      // Staff with no status record are fully available
      activeStaff.forEach((s: any) => {
        if (!s.testType) return;
        const hasStatus = dailyStatuses.some((ds: any) => ds.staffId === s.id && ds.date === todayStr);
        if (!hasStatus) {
          availableByTestType.set(s.testType, (availableByTestType.get(s.testType) || 0) + 1);
        }
      });

      // Today's allocated staff by testType (distinct)
      const allocatedByTestType = new Map<string, number>();
      const todayAllocatedStaff = new Set<number>();
      todaySchedules.forEach((s: any) => {
        if (!todayAllocatedStaff.has(s.staffId)) {
          todayAllocatedStaff.add(s.staffId);
          const st = staffTestTypeMap.get(s.staffId);
          if (st) {
            allocatedByTestType.set(st, (allocatedByTestType.get(st) || 0) + 1);
          }
        }
      });

      const allTestTypes = new Set([
        ...demandByTestType.keys(),
        ...totalByTestType.keys(),
        ...allocatedByTestType.keys(),
      ]);
      const ttStats = Array.from(allTestTypes).map(tt => {
        const total = totalByTestType.get(tt) || 0;
        const avail = availableByTestType.get(tt) || 0;
        const roundedAvail = Math.round(avail * 10) / 10;

        let remark = '';
        if (Math.abs(total - avail) > 0.05) {
          const list = unavailableStaff.get(tt);
          if (list && list.length > 0) {
            // Group by status label
            const byStatus = new Map<string, string[]>();
            list.forEach(u => {
              if (!byStatus.has(u.statusLabel)) byStatus.set(u.statusLabel, []);
              const fractionStr = u.fraction < 1 ? `×${u.fraction}` : '';
              byStatus.get(u.statusLabel)!.push(`${u.name}(${u.empNo})${fractionStr}`);
            });
            const parts: string[] = [];
            byStatus.forEach((names, status) => {
              parts.push(`${status}: ${names.join('、')}`);
            });
            remark = parts.join('；');
          }
        }

        return {
          testType: tt,
          totalDemand: Math.round((demandByTestType.get(tt) || 0) * 10) / 10,
          totalStaff: total,
          availableStaff: roundedAvail,
          allocatedToday: allocatedByTestType.get(tt) || 0,
          remark,
        };
      }).sort((a, b) => b.totalDemand - a.totalDemand);

      setTestTypeStats(ttStats);
    } catch (error) {
      console.error('获取仪表盘数据失败', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="当前并行测试产品数"
              value={stats.parallelProducts}
              prefix={<ArrowUpOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="测试执行总人数"
              value={stats.totalStaff}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="今日投入测试人数"
              value={stats.workingStaff}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="今日空闲人数"
              value={stats.idleStaff}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={24}>
          <Card loading={loading}>
            <Statistic
              title="人力利用率"
              value={stats.utilizationRate * 100}
              suffix="%"
              precision={1}
              valueStyle={{ fontSize: '36px' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={24}>
          <Card title="测试类型资源看板" loading={loading}>
            <Table
              columns={[
                { title: '测试类型', dataIndex: 'testType', key: 'testType', width: 120 },
                { title: '需求总数(人/天)', dataIndex: 'totalDemand', key: 'totalDemand', width: 130, render: (v: number) => v.toFixed(1) },
                { title: '总人数', dataIndex: 'totalStaff', key: 'totalStaff', width: 80 },
                { title: '今日可用(人)', dataIndex: 'availableStaff', key: 'availableStaff', width: 120, render: (v: number) => v % 1 === 0 ? v : v.toFixed(1) },
                { title: '今日投入(人)', dataIndex: 'allocatedToday', key: 'allocatedToday', width: 110 },
                { title: '备注', dataIndex: 'remark', key: 'remark', width: 200, render: (v: string) => v || '-' },
              ]}
              dataSource={testTypeStats}
              rowKey="testType"
              pagination={false}
              size="small"
              locale={{ emptyText: '暂无数据' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="并行测试数量趋势（近7天）" loading={loading}>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#1890ff" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="人力利用率走势（近7天）" loading={loading}>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={utilizationData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={[0, 100]} />
                <Tooltip formatter={(value) => [`${value}%`, '利用率']} />
                <Line type="monotone" dataKey="rate" stroke="#52c41a" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 24 }}>
        <Col span={12}>
          <Card title="各版本类型人力投入占比" loading={loading}>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`${value} 人/天`, '人力投入']} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="测试需求统计" loading={loading}>
            <div style={{ marginBottom: 16, padding: '12px', background: '#fafafa', borderRadius: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 500 }}>测试需求总数</span>
                <span style={{ color: '#1890ff', fontWeight: 600, fontSize: 18 }}>
                  {demandCount}
                </span>
              </div>
            </div>
            {stats.versionTypeStats.map((item, index) => (
              <div key={item.id} style={{ marginBottom: 16, padding: '12px', background: '#fafafa', borderRadius: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 500 }}>{item.name}</span>
                  <span style={{
                    color: COLORS[index % COLORS.length],
                    background: `${COLORS[index % COLORS.length]}20`,
                    padding: '4px 12px',
                    borderRadius: 4
                  }}>
                    {item.avgManpower} 人/天
                  </span>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                  共 {item.count} 个测试需求
                </div>
              </div>
            ))}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
