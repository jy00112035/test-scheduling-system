import React, { useState, useEffect } from 'react';
import { Card, Select, DatePicker, Tag, Modal, Descriptions, Spin, message, Empty } from 'antd';
import { CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { api } from '../services/api';

const { RangePicker } = DatePicker;

interface DailySchedule {
  date: string;
  totalPercentage: number;
  staffCount: number;
}

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
  scheduleStartDate: string | null;
  scheduleEndDate: string | null;
  scheduleExceedsDemand: boolean;
  dailySchedules: DailySchedule[];
}

// 解析日期为本地时间（避免时区偏移）
const parseLocalDate = (dateStr: string): Dayjs => {
  // 提取日期部分 YYYY-MM-DD，忽略时间部分
  const datePart = dateStr.substring(0, 10);
  return dayjs(datePart);
};

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
        const itemStart = parseLocalDate(item.startDate);
        const itemEnd = parseLocalDate(item.endDate);
        return itemEnd.isAfter(start) && itemStart.isBefore(end);
      });
    }

    setFilteredData(filtered);
  }, [ganttData, productFilter, statusFilter, dateRange]);

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
    if (filteredData.length === 0) {
      const now = dayjs();
      return { start: now.startOf('month').subtract(3, 'day'), end: now.endOf('month').add(3, 'day') };
    }

    const dates = filteredData.flatMap(item => {
      const ds = [parseLocalDate(item.startDate), parseLocalDate(item.endDate)];
      if (item.scheduleStartDate) ds.push(parseLocalDate(item.scheduleStartDate));
      if (item.scheduleEndDate) ds.push(parseLocalDate(item.scheduleEndDate));
      if (item.dailySchedules) {
        item.dailySchedules.forEach(d => ds.push(parseLocalDate(d.date)));
      }
      return ds;
    });

    const minDate = dates.reduce((min, d) => d.isBefore(min) ? d : min, dates[0]);
    const maxDate = dates.reduce((max, d) => d.isAfter(max) ? d : max, dates[0]);

    return {
      start: minDate.startOf('month').subtract(3, 'day'),
      end: maxDate.endOf('month').add(3, 'day')
    };
  };

  const timelineRange = getTimelineRange();
  const totalDays = timelineRange.end.diff(timelineRange.start, 'day');

  // 获取产品列表
  const productOptions = Array.from(new Set(ganttData.map(item => item.product)));

  // 获取需求周期框体颜色
  // 绿色 = 人力满足 + 不超出（两者必须同时满足）
  // 橙色 = 人力不足 或 延期满足
  const getScheduleStatusColor = (item: GanttViewItem) => {
    const hasSchedules = item.scheduleStartDate && item.scheduleEndDate
      && item.dailySchedules && item.dailySchedules.length > 0;

    // 未排班 → 灰色
    if (!hasSchedules) return '#d9d9d9';

    // 人力满足 且 不超出 → 绿色
    if (item.allocatedDays >= item.manpowerDemand && !item.scheduleExceedsDemand) {
      return '#52c41a';
    }

    // 人力不足 或 延期满足 → 橙色
    return '#faad14';
  };

  // 获取排班状态描述
  const getScheduleStatusText = (item: GanttViewItem) => {
    const hasSchedules = item.scheduleStartDate && item.scheduleEndDate
      && item.dailySchedules && item.dailySchedules.length > 0;

    if (!hasSchedules) return '未排班';
    if (item.allocatedDays >= item.manpowerDemand && !item.scheduleExceedsDemand) {
      return '人力满足';
    }
    return '人力不足/延期';
  };

  // 渲染甘特图条
  const renderGanttBar = (item: GanttViewItem) => {
    const demandStart = parseLocalDate(item.startDate);
    const demandEnd = parseLocalDate(item.endDate);

    // 计算条框有效范围：覆盖需求周期 + 排班实际日期
    let barStart = demandStart;
    let barEnd = demandEnd;
    if (item.scheduleStartDate) {
      const sStart = parseLocalDate(item.scheduleStartDate);
      if (sStart.isBefore(barStart)) barStart = sStart;
    }
    if (item.scheduleEndDate) {
      const sEnd = parseLocalDate(item.scheduleEndDate);
      if (sEnd.isAfter(barEnd)) barEnd = sEnd;
    }

    const barStartOffset = barStart.diff(timelineRange.start, 'day');
    const barDuration = barEnd.diff(barStart, 'day') + 1;

    const leftPercent = (barStartOffset / totalDays) * 100;
    const widthPercent = (barDuration / totalDays) * 100;

    const scheduleColor = getScheduleStatusColor(item);
    const hasRisk = item.riskScore >= 50;

    // 计算需求周期在条框内的相对位置
    const demandLeftInBar = demandStart.diff(barStart, 'day');
    const demandDuration = demandEnd.diff(demandStart, 'day') + 1;
    const demandLeftPercent = (demandLeftInBar / barDuration) * 100;
    const demandWidthPercent = (demandDuration / barDuration) * 100;

    // 判断排班是否超出测试周期
    const extendsLeft = demandStart.diff(barStart, 'day') > 0;
    const extendsRight = barEnd.diff(demandEnd, 'day') > 0;
    const hasExtension = extendsLeft || extendsRight;

    // 需求周期内的每日排班（白色半透明方块）
    const renderDailyDemandSchedules = () => {
      if (!item.dailySchedules || item.dailySchedules.length === 0) return null;
      return item.dailySchedules.map((daily, idx) => {
        const dailyDate = parseLocalDate(daily.date);
        if (dailyDate.isBefore(demandStart, 'day') || dailyDate.isAfter(demandEnd, 'day')) return null;
        const dayOffset = dailyDate.diff(demandStart, 'day');
        const dayLeftPercent = (dayOffset / demandDuration) * 100;
        const dayWidthPercent = (1 / demandDuration) * 100;
        const opacity = Math.min(1, daily.totalPercentage / 100);
        return (
          <div
            key={`d-${idx}`}
            style={{
              position: 'absolute',
              left: `${dayLeftPercent}%`,
              width: `${dayWidthPercent}%`,
              height: '100%',
              background: `rgba(255, 255, 255, ${opacity * 0.7})`,
              borderRight: '1px solid rgba(255,255,255,0.2)',
            }}
            title={`${daily.date}: ${daily.totalPercentage}% (${daily.staffCount}人)`}
          />
        );
      });
    };

    // 超出需求周期的排班色块（红色半透明）
    const renderDailyExtensionSchedules = () => {
      if (!hasExtension || !item.dailySchedules || item.dailySchedules.length === 0) return null;
      return item.dailySchedules.map((daily, idx) => {
        const dailyDate = parseLocalDate(daily.date);
        // 只渲染超出需求周期的日期
        if (!dailyDate.isBefore(demandStart, 'day') && !dailyDate.isAfter(demandEnd, 'day')) return null;
        if (dailyDate.isBefore(barStart, 'day') || dailyDate.isAfter(barEnd, 'day')) return null;
        const dayOffset = dailyDate.diff(barStart, 'day');
        const dayLeftPercent = (dayOffset / barDuration) * 100;
        const dayWidthPercent = (1 / barDuration) * 100;
        const opacity = Math.min(1, daily.totalPercentage / 100);
        return (
          <div
            key={`ext-${idx}`}
            style={{
              position: 'absolute',
              left: `${dayLeftPercent}%`,
              width: `${dayWidthPercent}%`,
              height: '100%',
              background: `rgba(255, 77, 79, ${opacity * 0.5})`,
              borderRight: '1px solid rgba(255,255,255,0.2)',
            }}
            title={`${daily.date}: ${daily.totalPercentage}% (${daily.staffCount}人) [超出测试周期]`}
          />
        );
      });
    };

    // 构建提示信息
    const tooltip = [
      `测试周期: ${demandStart.format('YYYY-MM-DD')} ~ ${demandEnd.format('YYYY-MM-DD')}`,
      hasExtension
        ? `实际排班范围: ${barStart.format('YYYY-MM-DD')} ~ ${barEnd.format('YYYY-MM-DD')}`
        : '',
      item.scheduleStartDate && item.scheduleEndDate
        ? `排班周期: ${item.scheduleStartDate} ~ ${item.scheduleEndDate}`
        : '排班周期: 未排班',
      `已排人力: ${item.allocatedDays.toFixed(1)} 人/天`,
      `需求人力: ${item.manpowerDemand.toFixed(1)} 人/天`,
      `状态: ${getScheduleStatusText(item)}`,
      hasExtension ? '⚠️ 排班超出测试周期' : '',
    ].filter(Boolean).join('\n');

    return (
      <div
        style={{
          position: 'absolute',
          left: `${leftPercent}%`,
          width: `${widthPercent}%`,
          height: 32,
          background: 'transparent',
          borderRadius: 4,
          overflow: 'visible',
          cursor: hasRisk ? 'pointer' : 'default',
          transition: 'all 0.3s',
        }}
        onClick={() => hasRisk && handleRiskClick(item)}
        title={tooltip}
      >
        {/* 超出部分：红色半透明延伸尾 */}
        {hasExtension && (
          <div style={{
            position: 'absolute',
            left: 0,
            width: '100%',
            height: '100%',
            background: `rgba(255, 77, 79, 0.15)`,
            borderRadius: 4,
            border: '1px dashed #ff4d4f',
            overflow: 'hidden',
          }}>
            {/* 超出部分的每日排班色块 */}
            {renderDailyExtensionSchedules()}
          </div>
        )}

        {/* 需求周期框体：可见边框 + 状态色填充 */}
        <div style={{
          position: 'absolute',
          left: `${demandLeftPercent}%`,
          width: `${demandWidthPercent}%`,
          height: '100%',
          background: scheduleColor,
          borderRadius: 4,
          border: '2px solid rgba(0,0,0,0.25)',
          boxSizing: 'border-box',
          overflow: 'hidden',
          zIndex: 1,
        }}>
          {/* 需求周期内的每日排班色块 */}
          {renderDailyDemandSchedules()}

          {/* 产品名称 + 进度 */}
          <div style={{
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            height: '100%',
            padding: '0 8px',
          }}>
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
              {hasRisk && <ExclamationCircleOutlined style={{ marginLeft: 4, color: '#fff' }} />}
            </div>
            <div style={{
              marginLeft: 'auto',
              fontSize: 11,
              color: '#fff',
              background: 'rgba(0,0,0,0.25)',
              padding: '2px 6px',
              borderRadius: 3,
            }}>
              {item.progressPercentage.toFixed(0)}%
            </div>
          </div>
        </div>
      </div>
    );
  };

  // 渲染时间轴刻度
  const renderTimeline = () => {
    const ticks: Dayjs[] = [];
    let current = timelineRange.start.startOf('day');

    while (current.isBefore(timelineRange.end) || current.isSame(timelineRange.end, 'day')) {
      ticks.push(current);
      current = current.add(1, 'day'); // 每天一个刻度
    }

    return (
      <div style={{ display: 'flex', height: 40, borderBottom: '2px solid #d9d9d9' }}>
        {/* 左侧占位列：与甘特图行的产品列对齐 */}
        <div style={{ width: 160, flexShrink: 0 }} />
        {/* 中间占位列：与甘特图行的天数列对齐 */}
        <div style={{ width: 80, flexShrink: 0 }} />
        {/* 甘特图区域：与甘特图条的父容器宽度一致 */}
        <div style={{ flex: 1, position: 'relative' }}>
          {/* 竖向网格线（每天） */}
          {Array.from({ length: totalDays + 1 }, (_, i) => {
            const date = timelineRange.start.add(i, 'day');
            const leftPercent = (i / totalDays) * 100;
            const isMonday = date.day() === 1;
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
          {/* 每日日期标签 */}
          {ticks.map((tick, idx) => {
            const offset = tick.diff(timelineRange.start, 'day');
            const leftPercent = (offset / totalDays) * 100;
            const isMonday = tick.day() === 1;
            const isFirstOfMonth = tick.date() === 1;

            return (
              <div
                key={idx}
                style={{
                  position: 'absolute',
                  left: `${leftPercent}%`,
                  top: 0,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  zIndex: 2,
                  pointerEvents: 'none',
                }}
              >
                <span style={{
                  fontSize: 10,
                  color: isMonday ? '#1890ff' : '#999',
                  fontWeight: isMonday ? 600 : 400,
                  lineHeight: '14px',
                }}>
                  {tick.format('D')}
                </span>
                {(isFirstOfMonth || idx === 0) && (
                  <span style={{
                    fontSize: 9,
                    color: '#bbb',
                    lineHeight: '12px',
                  }}>
                    {tick.format('M')}月
                  </span>
                )}
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
                {/* 图例 + 时间轴冻结容器 */}
                <div style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 100,
                  background: '#fff',
                  paddingBottom: 4,
                }}>
                {/* 颜色图例 */}
                <div style={{
                  display: 'flex',
                  gap: 16,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: '1px solid #f0f0f0',
                }}>
                  <span style={{ fontSize: 12, color: '#999' }}>图例：</span>
                  {[
                    { color: '#d9d9d9', label: '未排班' },
                    { color: '#52c41a', label: '人力满足（未超期）' },
                    { color: '#faad14', label: '人力不足/延期' },
                    { color: '#ff4d4f', label: '超期部分' },
                  ].map(item => (
                    <span key={item.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                      <span style={{
                        display: 'inline-block',
                        width: 14,
                        height: 14,
                        background: item.color,
                        borderRadius: 2,
                        border: '1px solid rgba(0,0,0,0.15)',
                      }} />
                      {item.label}
                    </span>
                  ))}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                    <span style={{
                      display: 'inline-block',
                      width: 14,
                      height: 14,
                      background: '#fff',
                      border: '1px dashed #ff4d4f',
                      borderRadius: 2,
                    }} />
                    超出测试周期
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                    <ExclamationCircleOutlined style={{ color: '#ff4d4f', fontSize: 12 }} />
                    风险警告
                  </span>
                </div>

                {/* 时间轴 */}
                {renderTimeline()}
                </div>

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
                          {parseLocalDate(item.startDate).format('MM/DD')} ~ {parseLocalDate(item.endDate).format('MM/DD')}
                        </div>
                      </div>

                      {/* 第二列：超期/人力状态 */}
                      <div style={{ width: 80, flexShrink: 0, paddingRight: 12, textAlign: 'center' }}>
                        {item.daysToEnd < 0 ? (
                          // 已超期
                          item.allocatedDays >= item.manpowerDemand ? (
                            <span style={{ color: '#ff4d4f', fontWeight: 500, fontSize: 13 }}>
                              超期 {Math.abs(item.daysToEnd)} 天
                            </span>
                          ) : (
                            <span style={{ color: '#ff4d4f', fontWeight: 500, fontSize: 12, lineHeight: '18px' }}>
                              超期 {Math.abs(item.daysToEnd)} 天
                              <br />
                              <span style={{ color: '#faad14', fontSize: 11 }}>
                                需求未满足
                              </span>
                            </span>
                          )
                        ) : (
                          // 未超期
                          item.allocatedDays >= item.manpowerDemand ? (
                            <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />
                          ) : (
                            <span style={{ color: '#faad14', fontWeight: 500, fontSize: 12 }}>
                              需求未满足
                            </span>
                          )
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
                {parseLocalDate(selectedRiskItem.startDate).format('YYYY-MM-DD')} ~ {parseLocalDate(selectedRiskItem.endDate).format('YYYY-MM-DD')}
              </Descriptions.Item>
              <Descriptions.Item label="完成期限">
                <span style={{ color: selectedRiskItem.daysToEnd <= 0 ? '#ff4d4f' : selectedRiskItem.daysToEnd <= 3 ? '#faad14' : undefined }}>
                  {parseLocalDate(selectedRiskItem.endDate).format('YYYY-MM-DD')}
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
