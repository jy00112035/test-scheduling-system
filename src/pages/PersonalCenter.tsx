import React, { useState } from 'react';
import { Card, Form, Input, Button, message, Descriptions, Tag } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { useUserRole } from '../context/UserRoleContext';
import { api } from '../services/api';

const roleLabels: Record<string, string> = {
  testManager: '测试经理',
  resourceManager: '资源主管',
  projectManager: '项目经理',
  testExecutor: '测试执行人员',
  fieldAdmin: '字段管理员',
};

const PersonalCenter: React.FC = () => {
  const { user } = useAuth();
  const { role } = useUserRole();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const handleChangePassword = async (values: {
    oldPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => {
    setLoading(true);
    try {
      await api.changePassword(values.oldPassword, values.newPassword, values.confirmPassword);
      message.success('密码修改成功');
      form.resetFields();
    } catch (error: any) {
      message.error(error.message || '密码修改失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
      <Card title="个人信息" style={{ marginBottom: 24 }}>
        <Descriptions column={1}>
          <Descriptions.Item label="用户名">{user?.username}</Descriptions.Item>
          <Descriptions.Item label="显示名称">{user?.displayName}</Descriptions.Item>
          <Descriptions.Item label="当前角色">
            <Tag color="blue">{roleLabels[role] || role}</Tag>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="修改密码">
        <Form
          form={form}
          layout="vertical"
          onFinish={handleChangePassword}
          style={{ maxWidth: 400 }}
        >
          <Form.Item
            name="oldPassword"
            label="原密码"
            rules={[{ required: true, message: '请输入原密码' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="请输入原密码" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码至少6个字符' },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="请输入新密码（至少6个字符）" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的新密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="请再次输入新密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              修改密码
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default PersonalCenter;
