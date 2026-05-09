import React, { useState } from 'react';
import { Card, Form, Input, Button, Select, message, Typography } from 'antd';
import { UserOutlined, LockOutlined, IdcardOutlined } from '@ant-design/icons';
import { api } from '../services/api';

const { Option } = Select;
const { Text, Link } = Typography;

interface RegisterPageProps {
  onNavigateLogin: () => void;
}

const RegisterPage: React.FC<RegisterPageProps> = ({ onNavigateLogin }) => {
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const handleSubmit = async (values: {
    username: string;
    displayName: string;
    password: string;
    confirmPassword: string;
    role: string;
  }) => {
    setLoading(true);
    try {
      await api.register(values);
      message.success('注册成功！请等待管理员审批后登录。');
      form.resetFields();
    } catch (error: any) {
      message.error(error.message || '注册失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }}>
      <Card style={{ width: 420, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0, color: '#667eea' }}>测试排班系统</h2>
          <p style={{ color: '#666', marginTop: 8 }}>创建新账户</p>
        </div>

        <Form form={form} layout="vertical" onFinish={handleSubmit} size="large">
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名至少3个字符' },
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="请输入用户名（用于登录）" />
          </Form.Item>

          <Form.Item
            name="displayName"
            label="显示名称"
            rules={[{ required: true, message: '请输入显示名称' }]}
          >
            <Input prefix={<IdcardOutlined />} placeholder="请输入显示名称" />
          </Form.Item>

          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少6个字符' },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="请输入密码（至少6个字符）" />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            label="确认密码"
            rules={[
              { required: true, message: '请再次输入密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="请再次输入密码" />
          </Form.Item>

          <Form.Item
            name="role"
            label="角色"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select placeholder="请选择角色">
              <Option value="testExecutor">测试执行人员（资源主管审批）</Option>
              <Option value="testManager">测试经理（项目经理审批）</Option>
              <Option value="resourceManager">资源主管（项目经理审批）</Option>
              <Option value="projectManager">项目经理（项目经理审批）</Option>
              <Option value="fieldAdmin">字段管理员（项目经理审批）</Option>
            </Select>
          </Form.Item>

          <Form.Item style={{ marginBottom: 12 }}>
            <Button type="primary" htmlType="submit" loading={loading} block>
              注册
            </Button>
          </Form.Item>

          <div style={{ textAlign: 'center' }}>
            <Text type="secondary">已有账号？</Text>{' '}
            <Link onClick={onNavigateLogin}>返回登录</Link>
          </div>
        </Form>
      </Card>
    </div>
  );
};

export default RegisterPage;
