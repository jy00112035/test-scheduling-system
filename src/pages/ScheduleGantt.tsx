import React, { useState, useEffect } from 'react';
import { Card, Select, DatePicker, Tag, Modal, Descriptions, Spin, message, Empty } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { api } from '../services/api';

const { RangePicker } = DatePicker;

interface GanttViewItem {
  demandId: number;
  product: string;
  version?: string;
  versionType: string;
  versionPhase?: string;
  startDate: string;
  endDate: string;
  status: string;
  manpowerDemand: number;
  allocatedDays: number;
  remainingDays: number;
  daysToEnd: number;
  priority?: string;
  confidential: boolean;
  riskScore: number;
  riskFactors: string[];
  progressPercentage: number;
}

const ScheduleGantt: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [ganttData, setGanttData] = useState<GanttViewItem[]>([]);
  const [filteredData, setFilteredData] = useState<GanttViewItem[]>([]);
  const [productFilter, setProductFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [riskModalVisible, setRiskModalVisible] = useState(false);
  const [selectedRiskItem, setSelectedRiskItem] = useState<GanttViewItem | null>(null);

  // 获取数据
  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await api.getGanttView();
      setGanttData(data);
      setFilteredData(data);
    } catch (error: any) {
      message.error(error.message || '获取排期数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // 筛选逻辑
  useEffect(() => {
    let filtered = ganttData;

    // 产品筛选
    if (productFilter.length > 0) {
      filtered = filtered.filter(item => productFilter.includes(item.product));
    }

    // 状态筛选
    if (statusFilter.length > 0) {
      filtered = filtered.filter(item => statusFilter.includes(item.status));
    }

    // 时间范围筛选
    if (dateRange) {
      const [start, end] = dateRange;
      filtered = filtered.filter(item => {
        const itemStart = dayjs(item.startDate);
        const itemEnd = dayjs(item.endDate);
        return itemEnd.isAfter(start) && itemStart.isBefore(end);
      });
    }

    setFilteredData(filtered);
  }, [ganttData, productFilter, statusFilter, dateRange]);

  // 获取状态颜色
  const getStatusColor = (item: GanttViewItem) => {
    if (item.status === 'completed') return '#52c41a'; // 绿色：已完成
    if (item.daysToEnd < 0) return '#ff4d4f'; // 红色：已超期
    if (item.daysToEnd <= 3) return '#faad14'; // 黄色：即将到期
    return '#1890ff'; // 蓝色：正常
  };

  // 获取状态标签
  const getStatusTag = (item: GanttViewItem) => {
    if (item.status === 'completed') return <Tag color="success">已完成</Tag>;
    if (item.daysToEnd < 0) return <Tag color="error">超期 {Math.abs(item.daysToEnd)} 天</Tag>;
    if (item.daysToEnd <= 3) return <Tag color="warning">剩余 {item.daysToEnd} 天</Tag>;
    return <Tag color="processing">进行中</Tag>;
  };

  // 获取优先级颜色
  const getPriorityColor = (priority?: string) => {
    if (!priority) return 'default';
    if (priority === 'P0' || priority === '紧急') return 'red';
    if (priority === 'P1' || priority === '高') return 'orange';
    if (priority === 'P2' || priority === '中') return 'blue';
    return 'default';
  };

  // 打开风险详情
  const handleRiskClick = (item: GanttViewItem) => {
    setSelectedRiskItem(item);
    setRiskModalVisible(true);
  };

  // 计算时间轴范围
  const getTimelineRange = () => {
    if (filteredData.length === 0) return { start: dayjs(), end: dayjs().add(30, 'day') };

    const dates = filteredData.flatMap(item => [
      dayjs(item.startDate),
      dayjs(item.endDate)
    ]);

    const minDate = dates.reduce((min, d) => d.isBefore(min) ? d : min, dates[0]);
    const maxDate = dates.reduce((max, d) => d.isAfter(max) ? d : max, dates[0]);

    return {
      start: minDate.subtract(3, 'day'),
      end: maxDate.add(3, 'day')
    };
  };

  const timelineRange = getTimelineRange();
  const totalDays = timelineRange.end.diff(timelineRange.start, 'day');

  // 获取产品列表
  const productOptions = Array.from(new Set(ganttData.map(item => item.product)));

  // 渲染甘特图条
  const renderGanttBar = (item: GanttViewItem) => {
    const itemStart = dayjs(item.startDate);
    const itemEnd = dayjs(item.endDate);

    const startOffset = itemStart.diff(timelineRange.start, 'day');
    const duration = itemEnd.diff(itemStart, 'day') + 1;

    const leftPercent = (startOffset / totalDays) * 100;
    const widthPercent = (duration / totalDays) * 100;

    const color = getStatusColor(item);
    const hasRisk = item.riskScore >= 50;

    return (
      <div
        style={{
          position: 'absolute',
          left: `${leftPercent}%`,
          width: `${widthPercent}%`,
          height: 32,
          background: `linear-gradient(to right, ${color} ${item.progressPercentage}%, ${color}33 ${item.progressPercentage}%)`,
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          cursor: hasRisk ? 'pointer' : 'default',
          border: hasRisk ? '2px solid #ff4d4f' : `1px solid ${color}`,
          transition: 'all 0.3s',
        }}
        onClick={() => hasRisk && handleRiskClick(item)}
        title={hasRisk ? '点击查看风险详情' : undefined}
      >
        <div style={{
          fontSize: 12,
          fontWeight: 500,
          color: '#fff',
          textShadow: '0 1px 2px rgba(0,0,0,0.3)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {item.product}
          {hasRisk && <ExclamationCircleOutlined style={{ marginLeft: 4, color: '#ff4d4f', background: '#fff', borderRadius: '50%', padding: 2 }} />}
        </div>
        <div style={{
          marginLeft: 'auto',
          fontSize: 11,
          color: '#fff',
          background: 'rgba(0,0,0,0.2)',
          padding: '2px 6px',
          borderRadius: 3,
        }}>
          {item.progressPercentage.toFixed(0)}%
        </div>
      </div>
    );
  };

  // 渲染时间轴刻度
  const renderTimeline = () => {
    const ticks: Dayjs[] = [];
    let current = timelineRange.start.startOf('day');

    while (current.isBefore(timelineRange.end)) {
      ticks.push(current);
      current = current.add(7, 'day'); // 每周一个刻度
    }

    return (
      <div style={{ display: 'flex', position: 'relative', height: 40, borderBottom: '2px solid #d9d9d9' }}>
        {/* 竖向网格线（每天） */}
        {Array.from({ length: totalDays + 1 }, (_, i) => {
          const date = timelineRange.start.add(i, 'day');
          const leftPercent = (i / totalDays) * 100;
          const isMonday = date.day() === 1; // 周一的线更明显
          return (
            <div
              key={`grid-${i}`}
              style={{
                position: 'absolute',
                left: `${leftPercent}%`,
                height: '100%',
                borderLeft: isMonday ? '1px solid #d9d9d9' : '1px solid #f0f0f0',
              }}
            />
          );
        })}
        {/* 周刻度标签 */}
        {ticks.map((tick, idx) => {
          const offset = tick.diff(timelineRange.start, 'day');
          const leftPercent = (offset / totalDays) * 100;

          return (
            <div
              key={idx}
              style={{
                position: 'absolute',
                left: `${leftPercent}%`,
                height: '100%',
                paddingLeft: 4,
                zIndex: 2,
              }}
            >
              <div style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>
                {tick.format('MM/DD')}
              </div>
            </div>
          );
        })}
        {/* 今天标记 */}
        {(() => {
          const today = dayjs();
          if (today.isAfter(timelineRange.start) && today.isBefore(timelineRange.end)) {
            const todayOffset = today.diff(timelineRange.start, 'day');
            const todayPercent = (todayOffset / totalDays) * 100;
            return (
              <div
                style={{
                  position: 'absolute',
                  left: `${todayPercent}%`,
                  height: '100%',
                  borderLeft: '2px solid #ff4d4f',
                  zIndex: 10,
                }}
              >
                <div style={{
                  fontSize: 11,
                  color: '#fff',
                  background: '#ff4d4f',
                  padding: '2px 4px',
                  borderRadius: 3,
                  marginTop: -2,
                }}>
                  今天
                </div>
              </div>
            );
          }
          return null;
        })()}
      </div>
    );
  };

  return (
    <div style={{ padding: 24, background: '#f0f2f5', minHeight: '100%' }}>
      <Card
        title="排期看板"
        extra={
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Select
              mode="multiple"
              placeholder="筛选产品"
              style={{ minWidth: 200 }}
              value={productFilter}
              onChange={setProductFilter}
              options={productOptions.map(p => ({ label: p, value: p }))}
              allowClear
            />
            <Select
              mode="multiple"
              placeholder="筛选状态"
              style={{ minWidth: 150 }}
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { label: '待排期', value: 'pending' },
                { label: '已排期', value: 'scheduled' },
                { label: '已完成', value: 'completed' },
              ]}
              allowClear
            />
            <RangePicker
              value={dateRange}
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) {
                  setDateRange([dates[0], dates[1]]);
                } else {
                  setDateRange(null);
                }
              }}
              format="YYYY-MM-DD"
              placeholder={['开始日期', '结束日期']}
            />
          </div>
        }
      >
        <Spin spinning={loading}>
          {filteredData.length === 0 ? (
            <Empty description="暂无排期数据" style={{ padding: '60px 0' }} />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 1200 }}>
                {/* 时间轴 */}
                {renderTimeline()}

                {/* 甘特图行 */}
                <div style={{ marginTop: 16 }}>
                  {filteredData.map((item, idx) => (
                    <div
                      key={item.demandId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        marginBottom: 12,
                        background: idx % 2 === 0 ? '#fafafa' : '#fff',
                        padding: '8px 12px',
                        borderRadius: 4,
                      }}
                    >
                      {/* 第一列：产品名称 + 风险 + 版本 + 起止日期 */}
                      <div style={{ width: 160, flexShrink: 0, paddingRight: 12 }}>
                        <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 2 }}>
                          {item.product}
                          {item.riskScore >= 50 && (
                            <Tag
                              color="error"
                              icon={<ExclamationCircleOutlined />}
                              style={{ cursor: 'pointer', marginLeft: 4, fontSize: 10 }}
                              onClick={() => handleRiskClick(item)}
                            />
                          )}
                        </div>
                        {item.version && <div style={{ fontSize: 12, color: '#666', marginBottom: 2 }}>{item.version}</div>}
                        <div style={{ fontSize: 11, color: '#999' }}>
                          {dayjs(item.startDate).format('MM/DD')} ~ {dayjs(item.endDate).format('MM/DD')}
                        </div>
                      </div>

                      {/* 第二列：超期/剩余天数 */}
                      <div style={{ width: 80, flexShrink: 0, paddingRight: 12, textAlign: 'center' }}>
                        {item.daysToEnd < 0 ? (
                          <span style={{ color: '#ff4d4f', fontWeight: 500, fontSize: 13 }}>
                            超期 {Math.abs(item.daysToEnd)} 天
                          </span>
                        ) : item.daysToEnd === 0 ? (
                          <span style={{ color: '#faad14', fontWeight: 500, fontSize: 13 }}>
                            今天到期
                          </span>
                        ) : (
                          <span style={{ color: '#52c41a', fontSize: 13 }}>
                            剩余 {item.daysToEnd} 天
                          </span>
                        )}
                      </div>

                      {/* 甘特图条 */}
                      <div style={{ flex: 1, position: 'relative', height: 48 }}>
                        {renderGanttBar(item)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Spin>
      </Card>

      {/* 风险详情弹窗 */}
      <Modal
        title={
          <span>
            <ExclamationCircleOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
            风险详情
          </span>
        }
        open={riskModalVisible}
        onCancel={() => {
          setRiskModalVisible(false);
          setSelectedRiskItem(null);
        }}
        footer={null}
        width={700}
      >
        {selectedRiskItem && (
          <div>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="产品信息" span={2}>
                <strong>{selectedRiskItem.product}</strong>
                {selectedRiskItem.confidential && <Tag color="red" style={{ marginLeft: 8 }}>保密</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="版本类型">
                <Tag color="blue">{selectedRiskItem.versionType}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="版本号">{selectedRiskItem.version || '-'}</Descriptions.Item>
              <Descriptions.Item label="优先级">
                {selectedRiskItem.priority ? (
                  <Tag color={getPriorityColor(selectedRiskItem.priority)}>{selectedRiskItem.priority}</Tag>
                ) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                {getStatusTag(selectedRiskItem)}
              </Descriptions.Item>
              <Descriptions.Item label="测试周期" span={2}>
                {dayjs(selectedRiskItem.startDate).format('YYYY-MM-DD')} ~ {dayjs(selectedRiskItem.endDate).format('YYYY-MM-DD')}
              </Descriptions.Item>
              <Descriptions.Item label="完成期限">
                <span style={{ color: selectedRiskItem.daysToEnd <= 0 ? '#ff4d4f' : selectedRiskItem.daysToEnd <= 3 ? '#faad14' : undefined }}>
                  {dayjs(selectedRiskItem.endDate).format('YYYY-MM-DD')}
                  {selectedRiskItem.daysToEnd <= 0
                    ? ` (已超期 ${Math.abs(selectedRiskItem.daysToEnd)} 天)`
                    : ` (剩余 ${selectedRiskItem.daysToEnd} 天)`}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="进度">
                <span style={{ fontWeight: 500 }}>{selectedRiskItem.progressPercentage.toFixed(1)}%</span>
              </Descriptions.Item>
              <Descriptions.Item label="总人力需求">{selectedRiskItem.manpowerDemand.toFixed(1)} 人/天</Descriptions.Item>
              <Descriptions.Item label="已排人力">{selectedRiskItem.allocatedDays.toFixed(1)} 人/天</Descriptions.Item>
              <Descriptions.Item label="剩余缺口">
                <span style={{ color: selectedRiskItem.remainingDays > 0 ? '#ff4d4f' : '#52c41a', fontWeight: 600 }}>
                  {selectedRiskItem.remainingDays.toFixed(1)} 人/天
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="风险分数">
                <span style={{
                  color: selectedRiskItem.riskScore >= 70 ? '#ff4d4f' : selectedRiskItem.riskScore >= 50 ? '#faad14' : '#52c41a',
                  fontWeight: 600,
                  fontSize: 16,
                }}>
                  {selectedRiskItem.riskScore}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="风险因素" span={2}>
                {selectedRiskItem.riskFactors.length > 0 ? (
                  <div>
                    {selectedRiskItem.riskFactors.map((factor, idx) => (
                      <Tag key={idx} color="error" style={{ marginBottom: 4 }}>
                        {factor}
                      </Tag>
                    ))}
                  </div>
                ) : (
                  <span style={{ color: '#52c41a' }}>无风险</span>
                )}
              </Descriptions.Item>
            </Descriptions>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ScheduleGantt;
