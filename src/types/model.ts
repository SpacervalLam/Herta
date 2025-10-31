// 模型配置类型定义

export type ModelType = 'openai' | 'claude' | 'gemini' | 'local' | 'custom' | 'baidu' | 'anthropic' | 'cohere' | 'llama' | 'deepseek' | 'microsoft' | 'perplexity' | 'anthropic-vertex';

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
  // OpenAI 系列
  {
    id: 'openai-gpt4',
    name: 'OpenAI GPT-4',
    modelType: 'openai',
    apiUrlPlaceholder: 'https://api.openai.com/v1/chat/completions',
    modelName: 'gpt-4',
    description: 'OpenAI GPT-4 模型'
  },
  {
    id: 'openai-gpt35',
    name: 'OpenAI GPT-3.5',
    modelType: 'openai',
    apiUrlPlaceholder: 'https://api.openai.com/v1/chat/completions',
    modelName: 'gpt-3.5-turbo',
    description: 'OpenAI GPT-3.5 Turbo 模型'
  },
  {
    id: 'openai-gpt4v',
    name: 'OpenAI GPT-4V',
    modelType: 'openai',
    apiUrlPlaceholder: 'https://api.openai.com/v1/chat/completions',
    modelName: 'gpt-4-vision-preview',
    description: 'OpenAI GPT-4 视觉模型'
  },
  
  // Anthropic Claude 系列
  {
    id: 'claude-3-opus',
    name: 'Claude 3 Opus',
    modelType: 'claude',
    apiUrlPlaceholder: 'https://api.anthropic.com/v1/messages',
    modelName: 'claude-3-opus-20240229',
    description: 'Anthropic Claude 3 Opus 模型'
  },
  {
    id: 'claude-3-sonnet',
    name: 'Claude 3 Sonnet',
    modelType: 'claude',
    apiUrlPlaceholder: 'https://api.anthropic.com/v1/messages',
    modelName: 'claude-3-sonnet-20240229',
    description: 'Anthropic Claude 3 Sonnet 模型'
  },
  
  // Google Gemini 系列
  {
    id: 'gemini-pro',
    name: 'Google Gemini Pro',
    modelType: 'gemini',
    apiUrlPlaceholder: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
    description: 'Google Gemini Pro 模型'
  },
  {
    id: 'gemini-15-pro',
    name: 'Google Gemini 1.5 Pro',
    modelType: 'gemini',
    apiUrlPlaceholder: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent',
    description: 'Google Gemini 1.5 Pro 模型'
  },
  
  // 百度文心系列
  {
    id: 'baidu-wenxin',
    name: '百度文心（千帆）',
    modelType: 'baidu',
    apiUrlPlaceholder: 'https://qianfan.baidubce.com/v2/chat/completions',
    modelName: 'ernie-4.0-turbo-8k',
    description: '百度文心千帆大模型'
  },
  {
    id: 'baidu-qwen-vl',
    name: '百度千问 VL',
    modelType: 'baidu',
    apiUrlPlaceholder: 'https://qianfan.baidubce.com/v2/chat/completions',
    modelName: 'qwen3-vl-8b-thinking',
    description: '百度千问多模态视觉模型'
  },
  
  // DeepSeek 系列
  {
    id: 'deepseek-coder',
    name: 'DeepSeek Coder',
    modelType: 'deepseek',
    apiUrlPlaceholder: 'https://api.deepseek.com/v1/chat/completions',
    modelName: 'deepseek-coder',
    description: 'DeepSeek 代码大模型'
  },
  
  // 微软系列
  {
    id: 'microsoft-phi',
    name: 'Microsoft Phi-3',
    modelType: 'microsoft',
    apiUrlPlaceholder: 'https://phi.microsoft.com/v1/chat/completions',
    modelName: 'phi-3-mini-4k',
    description: 'Microsoft Phi-3 小型语言模型'
  },
  
  // Cohere 系列
  {
    id: 'cohere-command',
    name: 'Cohere Command R+',
    modelType: 'cohere',
    apiUrlPlaceholder: 'https://api.cohere.com/v1/chat',
    modelName: 'command-r-plus',
    description: 'Cohere Command R+ 模型'
  },
  
  // Perplexity 系列
  {
    id: 'perplexity-llama',
    name: 'Perplexity Llama 3',
    modelType: 'perplexity',
    apiUrlPlaceholder: 'https://api.perplexity.ai/chat/completions',
    modelName: 'llama-3-sonar-large-32k-chat',
    description: 'Perplexity Llama 3 模型'
  },
  
  // 本地部署模型
  {
    id: 'local-lmstudio',
    name: '本地 LM Studio',
    modelType: 'local',
    apiUrlPlaceholder: 'http://localhost:1234/v1/chat/completions',
    description: '本地部署的 LM Studio 模型'
  },
  {
    id: 'local-ollama',
    name: '本地 Ollama',
    modelType: 'local',
    apiUrlPlaceholder: 'http://localhost:11434/v1/chat/completions',
    modelName: 'llama3',
    description: '本地部署的 Ollama 模型'
  },
  
  // 自定义模型
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
  supportsMultimodal: false
};
