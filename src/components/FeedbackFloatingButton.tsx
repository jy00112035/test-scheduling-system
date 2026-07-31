import React, { useState } from 'react';
import { FloatButton, Modal, Form, Input, Radio, message } from 'antd';
import { BugOutlined, FormOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import type { FeedbackType } from '../types';

const FeedbackFloatingButton: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await api.createFeedback({
        type: values.type as FeedbackType,
        title: values.title,
        description: values.description,
      });
      message.success('反馈提交成功，感谢您的反馈！');
      form.resetFields();
      setOpen(false);
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        // Form validation error — do nothing, antd shows inline errors
        return;
      }
      message.error((error as Error)?.message || '提交失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <FloatButton
        icon={<FormOutlined />}
        tooltip="提交反馈"
        type="primary"
        style={{ right: 24, bottom: 24, width: 48, height: 48 }}
        onClick={() => setOpen(true)}
      />

      <Modal
        title="提交反馈"
        open={open}
        onOk={handleSubmit}
        onCancel={() => {
          form.resetFields();
          setOpen(false);
        }}
        confirmLoading={loading}
        okText="提交"
        cancelText="取消"
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ type: 'BUG' }}
        >
          <Form.Item
            name="type"
            label="反馈类型"
            rules={[{ required: true, message: '请选择反馈类型' }]}
          >
            <Radio.Group>
              <Radio.Button value="BUG">
                <BugOutlined /> Bug 报告
              </Radio.Button>
              <Radio.Button value="FEATURE">
                <FormOutlined /> 功能需求
              </Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            name="title"
            label="标题"
            rules={[
              { required: true, message: '请输入标题' },
              { max: 200, message: '标题最多200个字符' },
            ]}
          >
            <Input placeholder="简要描述您的反馈" />
          </Form.Item>

          <Form.Item
            name="description"
            label="详细描述"
            rules={[
              { required: true, message: '请输入详细描述' },
              { max: 2000, message: '描述最多2000个字符' },
            ]}
          >
            <Input.TextArea
              rows={4}
              placeholder="请详细描述您遇到的问题或期望的功能"
              showCount
              maxLength={2000}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default FeedbackFloatingButton;
