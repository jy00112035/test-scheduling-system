import React, { useState } from 'react';
import { Card, Form, Input, Button, message, Typography } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';

const { Title, Text, Link } = Typography;

interface LoginPageProps {
  onNavigateRegister?: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onNavigateRegister }) => {
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      await login(values.username, values.password);
      message.success('登录成功！');
    } catch (error: any) {
      message.error(error.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }}>
      <Card style={{ width: 400, boxShadow: '0 14px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={2}>测试排班系统</Title>
          <p style={{ color: '#666' }}>请登录您的账户</p>
        </div>

        <Form
          name="login"
          onFinish={handleSubmit}
          layout="vertical"
          size="large"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="用户名"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
            >
              登录
            </Button>
          </Form.Item>
        </Form>

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Text type="secondary">没有账号？</Text>{' '}
          <Link onClick={onNavigateRegister}>立即注册</Link>
        </div>

        <div style={{ marginTop: 16, padding: 16, background: '#f5f5f5', borderRadius: 4 }}>
          <p style={{ marginBottom: 8, fontWeight: 500 }}>测试账号：</p>
          <p style={{ margin: 0, fontSize: 12, color: '#666' }}>
            admin / admin123 (字段管理员)<br />
            testmanager / test123 (测试经理)<br />
            resourcemanager / resource123 (资源主管)<br />
            projectmanager / project123 (项目经理)<br />
            testexecutor / test123 (测试执行人员)
          </p>
        </div>

      </Card>
      <div style={{ marginTop: 24, paddingBottom: 24, textAlign: 'center' }}>
        <a
          href="https://beian.miit.gov.cn/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, textDecoration: 'none' }}
        >
          陕ICP备2026011261号-1
        </a>
      </div>
    </div>
  );
};

export default LoginPage;
