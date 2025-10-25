import { ModelConfig, AuthType } from '@/types/model';
import { UnifiedMessage } from '@/types/chat';
import { generateBaiduAuthHeader } from '@/utils/baiduAuth'; // 需实现百度签名逻辑

// 适配器基类
export abstract class ModelAdapter {
  abstract getRequestUrl(config: ModelConfig): string;
  abstract getHeaders(config: ModelConfig): Record<string, string>;
  abstract buildRequestBody(config: ModelConfig, messages: UnifiedMessage[]): any;
}

// 百度千帆适配器（多模态）
export class BaiduQianfanAdapter extends ModelAdapter {
  getRequestUrl(config: ModelConfig) {
    return `${config.apiUrl}${config.apiPath || '/v2/chat/completions'}`;
  }

  getHeaders(config: ModelConfig) {
    if (config.authType !== 'baidu-bce' || !config.apiKey || !config.apiSecret) {
      throw new Error('百度千帆需要正确配置AK和SK');
    }
    const authHeader = generateBaiduAuthHeader(
      config.apiKey, 
      config.apiSecret,
      'POST',
      new URL(this.getRequestUrl(config)).pathname
    );
    return {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
      'X-Bce-Date': new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
    };
  }

  buildRequestBody(config: ModelConfig, messages: UnifiedMessage[]) {
    return {
      model: config.modelName,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content // 直接使用多模态数组
      })),
      stream: true,
      temperature: config.temperature,
      max_tokens: config.maxTokens
    };
  }
}

// OpenAI适配器（支持GPT-4V多模态）
export class OpenAIAdapter extends ModelAdapter {
  getRequestUrl(config: ModelConfig) {
    return `${config.apiUrl}${config.apiPath || '/v1/chat/completions'}`;
  }

  getHeaders(config: ModelConfig) {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    };
  }

  buildRequestBody(config: ModelConfig, messages: UnifiedMessage[]) {
    return {
      model: config.modelName,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content // GPT-4V支持相同格式
      })),
      stream: true,
      temperature: config.temperature,
      max_tokens: config.maxTokens
    };
  }
}

// 适配器工厂：根据模型类型返回对应适配器
export const getAdapter = (modelType: string): ModelAdapter => {
  switch (modelType) {
    case 'baidu-qianfan':
      return new BaiduQianfanAdapter();
    case 'openai':
      return new OpenAIAdapter();
    // 其他模型适配器...
    default:
      throw new Error(`未支持的模型类型: ${modelType}`);
  }
};