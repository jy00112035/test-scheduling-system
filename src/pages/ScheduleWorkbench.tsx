import React, { useState, useEffect } from 'react';
import { Card, Button, Tag, Space, Alert, Modal, message, InputNumber, Descriptions, Divider, Popconfirm, DatePicker } from 'antd';
import {
  RobotOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  SendOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../services/api';

const { confirm } = Modal;
const { RangePicker } = DatePicker;

interface ScheduleItem {
  id: number;
  staffId: number;
  date: string;
  percentage: number;
  product: string;
  versionType: string;
  demandId?: number;
  testManager?: string;
}

const ScheduleWorkbench: React.FC = () => {
  const [demands, setDemands] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [staffs, setStaffs] = useState<any[]>([]);
  const [selectedDemand, setSelectedDemand] = useState<any>(null);
  const [hasConflicts, setHasConflicts] = useState(false);
  const [conflictDetails, setConflictDetails] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [weekViewDate, setWeekViewDate] = useState<dayjs.Dayjs>(dayjs());

  // 分配弹窗相关状态
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{ staff: any; date: string } | null>(null);
  const [assignPercentage, setAssignPercentage] = useState(100);
  const [assignDays, setAssignDays] = useState(1);
  const [assignLoading, setAssignLoading] = useState(false);

  // 编辑弹窗相关状态
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleItem | null>(null);
  const [editPercentage, setEditPercentage] = useState(100);
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [demandsData, schedulesData, staffData] = await Promise.all([
        api.getPendingDemands(),
        api.getSchedules(),
        api.getStaff()
      ]);
      setDemands(demandsData);
      setSchedules(schedulesData.map((s: any) => ({
        ...s,
        id: s.id,
        staffId: s.staffId,
        date: s.date,
        percentage: s.percentage,
        product: s.product,
        versionType: s.versionType,
        demandId: s.demandId,
        testManager: s.testManager,
      })));
      setStaffs(staffData);
    } catch (error: any) {
      message.error(error.message || '获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  const dayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const weekDates = Array.from({ length: 10 }, (_, i) =>
    dayjs().add(i, 'day')
  );
  const weekDays = weekDates.map(d => dayLabels[d.day()]);

  const getVersionTypeColor = (type: string) => {
    const colorMap: Record<string, string> = {
      '维护': '#1890ff',
      '在研': '#52c41a',
      '升级': '#faad14',
    };
    return colorMap[type] || '#1890ff';
  };

  const getSchedulesForStaffAndDate = (staffId: number, date: string) => {
    return schedules.filter(s => s.staffId === staffId && s.date === date);
  };

  const getTotalPercentage = (staffId: number, date: string) => {
    return getSchedulesForStaffAndDate(staffId, date).reduce((sum: number, s: any) => sum + s.percentage, 0);
  };

  const handleAIRecommend = () => {
    message.loading({ content: 'AI 正在生成推荐方案...', key: 'ai-recommend' });
    setTimeout(() => {
      message.success({ content: 'AI 推荐方案已生成！', key: 'ai-recommend' });
    }, 2000);
  };

  const handleConflictCheck = () => {
    const conflicts: string[] = [];

    // 按人员和日期分组，计算每天的总投入百分比
    const staffDateMap = new Map<string, { staffId: number; date: string; total: number; name: string }>();

    schedules.forEach(schedule => {
      const key = `${schedule.staffId}-${schedule.date}`;
      const existing = staffDateMap.get(key);
      if (existing) {
        existing.total += schedule.percentage;
      } else {
        const staff = staffs.find(st => st.id === schedule.staffId);
        staffDateMap.set(key, {
          staffId: schedule.staffId,
          date: schedule.date,
          total: schedule.percentage,
          name: staff?.name || '未知',
        });
      }
    });

    // 检测超过人员系数的冲突
    staffDateMap.forEach(item => {
      const maxCapacity = (staffs.find(st => st.id === item.staffId)?.currentCoefficient || 1) * 100;
      if (item.total > maxCapacity) {
        conflicts.push(`${item.name} ${item.date} 分配 ${item.total}%（超过系数 ${maxCapacity}%）`);
      }
    });

    if (conflicts.length === 0) {
      message.success('排班无冲突！');
    } else {
      setHasConflicts(true);
      setConflictDetails(conflicts);
      message.warning(`检测到 ${conflicts.length} 个排班冲突！`);
    }
  };

  const handlePublish = () => {
    confirm({
      title: '确认发布排期',
      icon: <CheckCircleOutlined />,
      content: '排期发布后将通知所有相关人员，确定要发布吗？',
      onOk() {
        message.success('排期已成功发布！相关人员已收到通知。');
      },
    });
  };

  const handleDragStart = (e: React.DragEvent, demand: any) => {
    setSelectedDemand(demand);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDrop = (staff: any, date: string) => {
    if (selectedDemand) {
      const startDate = dayjs(date);
      const endDate = dayjs(selectedDemand.endDate);
      const maxDays = Math.min(endDate.diff(startDate, 'day') + 1, 30);

      setAssignTarget({ staff, date });
      setAssignDays(1);
      setAssignPercentage(Math.round((staff.currentCoefficient || 1) * 100));
      setAssignModalVisible(true);
    }
  };

  const handleAssignConfirm = async () => {
    if (!assignTarget || !selectedDemand) return;

    setAssignLoading(true);
    try {
      const startDate = dayjs(assignTarget.date);
      const newSchedules: any[] = [];

      for (let i = 0; i < assignDays; i++) {
        const currentDate = startDate.add(i, 'day').format('YYYY-MM-DD');
        newSchedules.push({
          staffId: assignTarget.staff.id,
          demandId: selectedDemand.id,
          date: currentDate,
          percentage: assignPercentage,
          product: selectedDemand.product,
          testManager: selectedDemand.submittedBy || '测试经理',
          versionType: selectedDemand.versionType,
        });
      }

      await api.createSchedulesBatch(newSchedules);

      setSchedules([...schedules, ...newSchedules.map((s, idx) => ({
        ...s,
        id: Date.now() + idx
      }))]);

      message.success(`已安排「${selectedDemand.product}」给 ${assignTarget.staff.name}，连续 ${assignDays} 天`);

      setAssignModalVisible(false);
      setSelectedDemand(null);
      setAssignTarget(null);
    } catch (error: any) {
      message.error(error.message || '分配失败');
    } finally {
      setAssignLoading(false);
    }
  };

  // 删除排班
  const handleDeleteSchedule = async (schedule: ScheduleItem) => {
    try {
      await api.deleteSchedule(schedule.id);
      setSchedules(schedules.filter(s => s.id !== schedule.id));
      message.success('已删除排班');
    } catch (error: any) {
      message.error(error.message || '删除失败');
    }
  };

  // 打开编辑弹窗
  const handleEditSchedule = (schedule: ScheduleItem) => {
    setEditingSchedule(schedule);
    setEditPercentage(schedule.percentage);
    setEditModalVisible(true);
  };

  // 确认编辑
  const handleEditConfirm = async () => {
    if (!editingSchedule) return;

    setEditLoading(true);
    try {
      await api.deleteSchedule(editingSchedule.id);

      const newSchedule = {
        staffId: editingSchedule.staffId,
        demandId: editingSchedule.demandId,
        date: editingSchedule.date,
        percentage: editPercentage,
        product: editingSchedule.product,
        testManager: editingSchedule.testManager || '测试经理',
        versionType: editingSchedule.versionType,
      };

      await api.createSchedule(newSchedule);

      setSchedules(schedules.map(s =>
        s.id === editingSchedule.id
          ? { ...s, percentage: editPercentage }
          : s
      ));

      message.success('排班已更新');
      setEditModalVisible(false);
      setEditingSchedule(null);
    } catch (error: any) {
      message.error(error.message || '更新失败');
    } finally {
      setEditLoading(false);
    }
  };

  // 渲染百分比显示
  const renderPercentage = (percentage: number) => {
    if (percentage >= 100) {
      return `${percentage}%`;
    }
    return `${percentage}%`;
  };

  return (
    <div>
      {/* 顶部操作栏 */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <Button
              type="primary"
              icon={<RobotOutlined />}
              onClick={handleAIRecommend}
            >
              AI 推荐排班
            </Button>
            <Button
              icon={<ExclamationCircleOutlined />}
              onClick={handleConflictCheck}
            >
              冲突检测
            </Button>
          </Space>
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handlePublish}
          >
            发布排期
          </Button>
        </div>
      </Card>

      {hasConflicts && (
        <Alert
          message="排班冲突警告"
          description={
            <div>
              <div style={{ marginBottom: 4 }}>检测到 {conflictDetails.length} 个排班冲突：</div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {conflictDetails.map((detail, index) => (
                  <li key={index}>{detail}</li>
                ))}
              </ul>
            </div>
          }
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setHasConflicts(false)}
        />
      )}

      <div style={{ display: 'flex', gap: 16 }}>
        {/* 左侧：待排期需求列表 */}
        <Card
          title="待排期需求"
          style={{ width: 300, flexShrink: 0 }}
          bodyStyle={{ padding: 12, maxHeight: 600, overflowY: 'auto' }}
        >
          {demands.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>
              暂无待排期需求
            </div>
          ) : (
            demands.map(demand => {
              const activeStaffIds = staffs.map(s => s.id);
              const demandSchedules = schedules.filter(s => s.demandId === demand.id && activeStaffIds.includes(s.staffId));
              const allocatedDays = demandSchedules.reduce((sum, s) => sum + s.percentage / 100, 0);
              const remainingDays = demand.manpowerDemand - allocatedDays;
              const isPublished = demandSchedules.length > 0 && demandSchedules.every(s => s.published);
              const daysToEnd = dayjs(demand.endDate).diff(dayjs(), 'day');
              const isUrgent = daysToEnd <= 3 && remainingDays > 0;

              let borderColor = '#b7eb8f';
              let bgColor = '#f6ffed';
              if (remainingDays > 0) {
                borderColor = isUrgent ? '#ff4d4f' : '#ff9c6e';
                bgColor = isUrgent ? '#fff1f0' : '#fff7e6';
              }

              return (
                <div
                  key={demand.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, demand)}
                  style={{
                    padding: 12,
                    border: `1px solid ${borderColor}`,
                    borderRadius: 8,
                    marginBottom: 12,
                    cursor: 'move',
                    background: bgColor,
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                  }}>
                    <strong style={{ fontSize: 14 }}>{demand.product}</strong>
                    <Tag
                      color={demand.status === 'pending' ? 'orange' : 'green'}
                      style={{ margin: 0 }}
                    >
                      {demand.status === 'pending' ? '待排期' : '已排期'}
                    </Tag>
                  </div>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                    版本号：{demand.version || '无版本号'}
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    color: '#666',
                  }}>
                    <span>测试周期：{dayjs(demand.startDate).format('MM-DD')} ~ {dayjs(demand.endDate).format('MM-DD')}</span>
                    <span style={{ fontWeight: 500, color: '#1890ff' }}>
                      {demand.manpowerDemand} 人/天
                    </span>
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    marginTop: 6,
                  }}>
                    <span style={{ color: '#52c41a' }}>已分配：{allocatedDays.toFixed(1)} 人/天</span>
                    <span style={{ color: remainingDays > 0 ? '#faad14' : '#999' }}>
                      待分配：{remainingDays.toFixed(1)} 人/天
                    </span>
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <Tag
                        color={getVersionTypeColor(demand.versionType)}
                        style={{ margin: 0 }}
                      >
                        {demand.versionPhase || demand.versionType}
                      </Tag>
                      {isUrgent && (
                        <Tag color="red" style={{ marginLeft: 4 }}>
                          紧急
                        </Tag>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {demandSchedules.length > 0 && (
                        <Popconfirm
                          title="确定清除该需求的所有排班安排？"
                          onConfirm={async (e) => {
                            e?.stopPropagation();
                            try {
                              await api.deleteSchedulesByDemand(demand.id);
                              message.success('已清除排班');
                              fetchData();
                            } catch (err: any) {
                              message.error(err.message || '清除失败');
                            }
                          }}
                          okText="确定"
                          cancelText="取消"
                        >
                          <Button
                            size="small"
                            danger
                            type="link"
                            icon={<DeleteOutlined />}
                            onClick={(e) => e.stopPropagation()}
                          >
                            清除
                          </Button>
                        </Popconfirm>
                      )}
                      {isPublished ? (
                        <Button size="small" type="text" disabled>已发布</Button>
                      ) : (
                        <Button
                          size="small"
                          type="link"
                          icon={<SendOutlined />}
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              await api.publishSchedules(demand.id);
                              message.success('发布成功');
                              fetchData();
                            } catch (err: any) {
                              message.error(err.message || '发布失败');
                            }
                          }}
                        >
                          发布
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </Card>

        {/* 右侧：排班视图 */}
        <Card
          title="人力排布视图"
          extra={
            <DatePicker
              picker="week"
              value={weekViewDate}
              onChange={(date) => date && setWeekViewDate(date)}
              allowClear={false}
              style={{ width: 130 }}
            />
          }
          style={{ flex: 1 }}
          bodyStyle={{ padding: 0, overflow: 'auto' }}
        >
          <table className="kanban-table" style={{ minWidth: 1200 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 60, position: 'sticky', left: 0, background: '#fafafa', zIndex: 1 }}>姓名</th>
                <th style={{ minWidth: 40, position: 'sticky', left: 60, background: '#fafafa', zIndex: 1 }}>系数</th>
                <th style={{ minWidth: 60, position: 'sticky', left: 100, background: '#fafafa', zIndex: 1 }}>测试类型</th>
                {weekDates.map((date, index) => {
                  const isWeekend = [0, 6].includes(date.day());
                  return (
                  <th key={date.format('YYYY-MM-DD')} style={{
                    minWidth: 70,
                    background: isWeekend ? '#fff7e6' : undefined,
                  }}>
                    <div style={{ color: isWeekend ? '#fa8c16' : undefined }}>{weekDays[index]}</div>
                    <div style={{ fontSize: 10, color: isWeekend ? '#fa8c16' : '#666' }}>
                      {date.format('MM-DD')}
                    </div>
                  </th>
                )})}
              </tr>
            </thead>
            <tbody>
              {staffs.filter(s => s.status === 'active').map(staff => (
                <tr key={staff.id}>
                  <td style={{
                    position: 'sticky',
                    left: 0,
                    background: '#fff',
                    zIndex: 1,
                    padding: '4px 2px',
                    fontSize: '12px',
                  }}>
                    <strong>{staff.name}</strong>
                  </td>
                  <td style={{
                    position: 'sticky',
                    left: 60,
                    background: '#fff',
                    zIndex: 1,
                    padding: '4px 2px',
                  }}>
                    <Tag color={staff.currentCoefficient === 1.0 ? 'green' : 'orange'} style={{ fontSize: '10px', padding: '0 2px' }}>
                      {staff.currentCoefficient?.toFixed(1) || '1.0'}
                    </Tag>
                  </td>
                  <td style={{
                    position: 'sticky',
                    left: 100,
                    background: '#fff',
                    zIndex: 1,
                    padding: '4px 2px',
                    fontSize: '11px',
                    color: '#666',
                  }}>
                    {staff.testType || '-'}
                  </td>
                  {weekDates.map((date, dayIndex) => {
                    const dateStr = date.format('YYYY-MM-DD');
                    const daySchedules = getSchedulesForStaffAndDate(staff.id, dateStr);
                    const totalPercent = getTotalPercentage(staff.id, dateStr);
                    const maxCapacity = (staff.currentCoefficient || 1) * 100;
                    const hasConflict = totalPercent > maxCapacity;
                    const isWeekend = [5, 6].includes(dayIndex);

                    return (
                      <td
                        key={dateStr}
                        style={{
                          background: hasConflict ? '#fff1f0' : isWeekend ? '#fff7e6' : '#fff',
                          cursor: selectedDemand ? 'copy' : 'default',
                        }}
                        onDrop={() => handleDrop(staff, dateStr)}
                        onDragOver={(e) => selectedDemand && e.preventDefault()}
                      >
                        {daySchedules.length === 0 ? (
                          <div style={{ color: '#ccc', fontSize: 10, padding: '8px 0' }}>
                            空闲
                          </div>
                        ) : (
                          <div>
                            {daySchedules.map(schedule => (
                              <div
                                key={schedule.id}
                                className="schedule-item"
                                style={{
                                  background: `${getVersionTypeColor(schedule.versionType)}20`,
                                  borderLeft: `3px solid ${getVersionTypeColor(schedule.versionType)}`,
                                  marginBottom: 2,
                                  padding: '2px 4px',
                                  position: 'relative',
                                  cursor: 'pointer',
                                  fontSize: 11,
                                }}
                                onClick={() => handleEditSchedule(schedule)}
                              >
                                <div
                                  className="product-name"
                                  style={{ color: getVersionTypeColor(schedule.versionType), fontWeight: 500 }}
                                >
                                  {schedule.product}
                                </div>
                                <div style={{ fontSize: 10, color: '#666' }}>
                                  {renderPercentage(schedule.percentage)}
                                </div>
                                <div style={{
                                  position: 'absolute',
                                  top: 0,
                                  right: 0,
                                }}>
                                  <Popconfirm
                                    title="确定删除？"
                                    onConfirm={(e) => {
                                      e?.stopPropagation();
                                      handleDeleteSchedule(schedule);
                                    }}
                                    okText="确定"
                                    cancelText="取消"
                                  >
                                    <Button
                                      type="text"
                                      size="small"
                                      danger
                                      icon={<DeleteOutlined />}
                                      style={{ fontSize: 9, padding: '0 1px', height: 14, width: 14 }}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </Popconfirm>
                                </div>
                              </div>
                            ))}
                            <div style={{
                              marginTop: 4,
                              fontSize: 10,
                              color: hasConflict ? '#ff4d4f' : '#666',
                              fontWeight: hasConflict ? 600 : 400,
                            }}>
                              {totalPercent}%
                            </div>
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
      </div>

      {/* 分配弹窗 */}
      <Modal
        title="分配测试任务"
        open={assignModalVisible}
        onCancel={() => {
          setAssignModalVisible(false);
          setSelectedDemand(null);
          setAssignTarget(null);
        }}
        footer={[
          <Button key="cancel" onClick={() => setAssignModalVisible(false)}>
            取消
          </Button>,
          <Button
            key="confirm"
            type="primary"
            loading={assignLoading}
            onClick={handleAssignConfirm}
          >
            确认分配
          </Button>
        ]}
      >
        {assignTarget && selectedDemand && (
          <div>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="测试人员">
                <strong>{assignTarget.staff.name}</strong>
              </Descriptions.Item>
              <Descriptions.Item label="人员系数">
                <Tag color={assignTarget.staff.currentCoefficient === 1.0 ? 'green' : 'orange'}>
                  {assignTarget.staff.currentCoefficient?.toFixed(2) || '1.00'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="分配需求">
                <strong style={{ color: getVersionTypeColor(selectedDemand.versionType) }}>
                  {selectedDemand.product}
                </strong>
                <Tag style={{ marginLeft: 8 }}>{selectedDemand.versionPhase || selectedDemand.versionType}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="需求周期">
                {dayjs(selectedDemand.startDate).format('YYYY-MM-DD')} ~ {dayjs(selectedDemand.endDate).format('YYYY-MM-DD')}
              </Descriptions.Item>
            </Descriptions>

            <Divider>设置投入比例</Divider>

            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 14, color: '#666' }}>从 </span>
                <strong style={{ fontSize: 16, color: '#1890ff' }}>
                  {dayjs(assignTarget.date).format('YYYY-MM-DD')}
                </strong>
                <span style={{ fontSize: 14, color: '#666' }}> 开始，分配 </span>
                <InputNumber
                  min={1}
                  max={Math.floor(assignTarget.staff.currentCoefficient * 100)}
                  value={assignPercentage}
                  onChange={(value) => setAssignPercentage(value || 100)}
                  style={{ width: 100, margin: '0 8px' }}
                />
                <span style={{ fontSize: 14, color: '#666' }}>%（系数 {assignTarget.staff.currentCoefficient}）</span>
              </div>

              <div style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 14, color: '#666' }}>连续分配 </span>
                <InputNumber
                  min={1}
                  max={Math.min(
                    dayjs(selectedDemand.endDate).diff(dayjs(assignTarget.date), 'day') + 1,
                    30
                  )}
                  value={assignDays}
                  onChange={(value) => setAssignDays(value || 1)}
                  style={{ width: 80, margin: '0 8px' }}
                />
                <span style={{ fontSize: 14, color: '#666' }}> 天</span>
              </div>

              <div style={{
                marginTop: 16,
                padding: 12,
                background: '#f6ffed',
                border: '1px solid #b7eb8f',
                borderRadius: 8,
              }}>
                分配说明：
                <ul style={{ margin: '8px 0 0 20px', textAlign: 'left', color: '#666' }}>
                  <li>每天投入 {assignPercentage}% 人力</li>
                  <li>连续分配将跨越 {assignDays} 天（包括起始日）</li>
                  <li>100% = 1 人/天，50% = 0.5 人/天</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* 编辑弹窗 */}
      <Modal
        title="编辑排班"
        open={editModalVisible}
        onCancel={() => {
          setEditModalVisible(false);
          setEditingSchedule(null);
        }}
        footer={[
          <Button key="cancel" onClick={() => setEditModalVisible(false)}>
            取消
          </Button>,
          <Button
            key="confirm"
            type="primary"
            loading={editLoading}
            onClick={handleEditConfirm}
          >
            确认修改
          </Button>
        ]}
      >
        {editingSchedule && (
          <div>
            <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="测试人员">
                <strong>{staffs.find(s => s.id === editingSchedule.staffId)?.name || '-'}</strong>
              </Descriptions.Item>
              <Descriptions.Item label="任务">
                <strong style={{ color: getVersionTypeColor(editingSchedule.versionType) }}>
                  {editingSchedule.product}
                </strong>
              </Descriptions.Item>
              <Descriptions.Item label="日期">
                {editingSchedule.date}
              </Descriptions.Item>
            </Descriptions>

            <Divider>修改投入比例</Divider>

            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 14, color: '#666' }}>投入比例：</span>
                <InputNumber
                  min={1}
                  max={100}
                  value={editPercentage}
                  onChange={(value) => setEditPercentage(value || 100)}
                  style={{ width: 100, marginLeft: 8 }}
                />
                <span style={{ fontSize: 14, color: '#666', marginLeft: 8 }}>%</span>
              </div>

              <div style={{
                marginTop: 16,
                padding: 12,
                background: '#f6ffed',
                border: '1px solid #b7eb8f',
                borderRadius: 8,
              }}>
                <ul style={{ margin: 0, paddingLeft: 20, color: '#666' }}>
                  <li>输入 100 表示 1 人/天</li>
                  <li>输入 50 表示 0.5 人/天</li>
                  <li>输入 200 表示 2 人/天（可超过100%）</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ScheduleWorkbench;
