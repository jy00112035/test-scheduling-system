import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  Select,
  Button,
  Space,
  message,
  Table,
  Popconfirm,
  Modal,
  InputNumber,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { api } from '../services/api';

const { TextArea } = Input;
const { Option } = Select;

interface FieldConfig {
  id: number;
  fieldName: string;
  fieldType: 'select' | 'input' | 'textArea';
  options: string;
  description: string;
  required: boolean;
  sortOrder: number;
}

const BaseConfig: React.FC = () => {
  const [form] = Form.useForm();
  const [configs, setConfigs] = useState<FieldConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const data = await api.getFieldConfigs();
      setConfigs(data);
    } catch (error: any) {
      message.error(error.message || '获取字段配置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingId(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = (record: FieldConfig) => {
    setEditingId(record.id);
    form.setFieldsValue({
      fieldName: record.fieldName,
      fieldType: record.fieldType,
      options: record.options?.split(',').join('\n') || '',
      description: record.description,
      required: record.required,
      sortOrder: record.sortOrder,
    });
    setIsModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await api.deleteFieldConfig(id);
      setConfigs(configs.filter(config => config.id !== id));
      message.success('字段配置已删除');
    } catch (error: any) {
      message.error(error.message || '删除失败');
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      const configData = {
        ...values,
        options: values.options?.split('\n').filter((o: string) => o.trim()).join(',') || '',
      };

      if (editingId) {
        await api.updateFieldConfig(editingId, configData);
        message.success('字段配置已更新');
      } else {
        await api.createFieldConfig(configData);
        message.success('字段配置已添加');
      }

      setIsModalVisible(false);
      fetchConfigs();
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  const columns = [
    {
      title: '字段名称',
      dataIndex: 'fieldName',
      key: 'fieldName',
      width: 150,
    },
    {
      title: '字段类型',
      dataIndex: 'fieldType',
      key: 'fieldType',
      width: 100,
      render: (type: string) => {
        const typeMap: Record<string, string> = {
          select: '下拉选择',
          input: '文本输入',
          textArea: '文本域',
        };
        return typeMap[type] || type;
      },
    },
    {
      title: '选项',
      dataIndex: 'options',
      key: 'options',
      width: 200,
      render: (options: string) => {
        if (!options) return '-';
        const opts = options.split(',');
        return opts.slice(0, 3).join(', ') + (opts.length > 3 ? '...' : '');
      },
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      width: 150,
    },
    {
      title: '是否必填',
      dataIndex: 'required',
      key: 'required',
      width: 80,
      render: (required: boolean) => required ? '是' : '否',
    },
    {
      title: '排序',
      dataIndex: 'sortOrder',
      key: 'sortOrder',
      width: 80,
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right' as const,
      render: (_: any, record: FieldConfig) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除此字段配置吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Space>
          <span style={{ fontSize: '18px', fontWeight: 500 }}>
            字段配置
          </span>
        </Space>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
          >
            新增字段配置
          </Button>
        </div>

        <Table
          columns={columns}
          dataSource={configs}
          rowKey="id"
          bordered
          loading={loading}
          scroll={{ x: 800 }}
        />
      </Card>

      <Modal
        title={editingId ? '编辑字段配置' : '新增字段配置'}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="fieldName"
            label="字段名称"
            rules={[{ required: true, message: '请输入字段名称' }]}
          >
            <Input placeholder="请输入字段名称" />
          </Form.Item>

          <Form.Item
            name="fieldType"
            label="字段类型"
            rules={[{ required: true, message: '请选择字段类型' }]}
          >
            <Select placeholder="请选择字段类型">
              <Option value="select">下拉选择</Option>
              <Option value="input">文本输入</Option>
              <Option value="textArea">文本域</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="options"
            label="选项配置"
          >
            <Input.TextArea
              placeholder="请输入选项，每行一个（下拉选择类型时必填）"
              rows={4}
            />
          </Form.Item>

          <Form.Item
            name="description"
            label="字段描述"
            rules={[{ required: true, message: '请输入字段描述' }]}
          >
            <TextArea
              placeholder="请输入字段描述"
              rows={3}
            />
          </Form.Item>

          <Form.Item
            name="required"
            label="是否必填"
            valuePropName="checked"
          >
            <Input type="checkbox" />
          </Form.Item>

          <Form.Item
            name="sortOrder"
            label="排序序号"
            rules={[{ required: true, message: '请输入排序序号' }]}
          >
            <InputNumber
              min={1}
              style={{ width: '100%' }}
              placeholder="请输入排序序号"
            />
          </Form.Item>

          <Form.Item style={{ marginTop: 24, marginBottom: 0 }}>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SaveOutlined />}
              >
                保存
              </Button>
              <Button onClick={() => setIsModalVisible(false)}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default BaseConfig;
