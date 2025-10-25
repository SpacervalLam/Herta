// 模型配置类型定义

export type ModelType = 'openai' | 'claude' | 'gemini' | 'local' | 'custom' | 'baidu'; // 新增 'baidu'

export interface ModelConfig {
  id: string;
  name: string;
  modelType: ModelType;
  apiUrl: string;
  apiKey?: string;
  modelName?: string; // OpenAI/百度模型名称，如 'gpt-4' 或 'ernie-bot'
  description?: string;
  maxTokens?: number;
  temperature?: number;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  // 高级配置
  supportsMultimodal?: boolean; // 是否支持多模态输入
  customRequestConfig?: CustomRequestConfig; // 自定义请求配置
}

// 自定义请求配置
export interface CustomRequestConfig {
  enabled: boolean; // 是否启用自定义请求体
  requestBodyTemplate: string; // 请求体模板（JSON字符串）
  headers?: Record<string, string>; // 自定义请求头
  responseParser?: ResponseParserConfig; // 响应解析配置
}

// 响应解析配置
export interface ResponseParserConfig {
  contentPath: string; // 响应内容在JSON中的路径，如 "choices[0].message.content"
  errorPath?: string; // 错误信息路径，如 "error.message"
  usagePath?: string; // 使用量信息路径，如 "usage"
}

export interface ModelPreset {
  id: string;
  name: string;
  modelType: ModelType;
  apiUrlPlaceholder: string;
  modelName?: string; // 默认模型名称
  description: string;
}

export const MODEL_PRESETS: ModelPreset[] = [
  {
    id: 'openai-gpt4',
    name: 'OpenAI GPT-4',
    modelType: 'openai',
    apiUrlPlaceholder: '/api/openai/v1/chat/completions',
    modelName: 'gpt-4',
    description: 'OpenAI GPT-4 模型'
  },
  {
    id: 'openai-gpt35',
    name: 'OpenAI GPT-3.5',
    modelType: 'openai',
    apiUrlPlaceholder: '/api/openai/v1/chat/completions',
    modelName: 'gpt-3.5-turbo',
    description: 'OpenAI GPT-3.5 Turbo 模型'
  },
  {
    id: 'claude',
    name: 'Claude',
    modelType: 'claude',
    apiUrlPlaceholder: '/api/claude/v1/messages',
    description: 'Anthropic Claude 模型'
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    modelType: 'gemini',
    apiUrlPlaceholder: '/api/gemini/v1/models/gemini-pro:generateContent',
    description: 'Google Gemini Pro 模型'
  },
  {
    id: 'baidu-wenxin',
    name: '百度文心（千帆）',
    modelType: 'baidu',
    apiUrlPlaceholder: 'https://qianfan.baidubce.com/v2/chat/completions',
    modelName: 'ernie-4.0-turbo-8k',
    description: '百度文心千帆大模型'
  },
  {
    id: 'local-lmstudio',
    name: '本地 LM Studio',
    modelType: 'local',
    apiUrlPlaceholder: 'http://localhost:1234/v1/chat/completions',
    description: '本地部署的 LM Studio 模型'
  },
  {
    id: 'custom',
    name: '自定义模型',
    modelType: 'custom',
    apiUrlPlaceholder: 'https://your-api-endpoint.com/v1/chat/completions',
    description: '自定义 API 接口'
  },

];

export const DEFAULT_MODEL_CONFIG: Partial<ModelConfig> = {
  maxTokens: 2000,
  temperature: 0.7,
  enabled: true,
  supportsMultimodal: false,
  customRequestConfig: {
    enabled: false,
    requestBodyTemplate: '',
    headers: {},
    responseParser: {
      contentPath: 'choices[0].message.content',
      errorPath: 'error.message',
      usagePath: 'usage'
    }
  }
};
