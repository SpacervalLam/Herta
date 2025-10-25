import ky, { type KyResponse, type AfterResponseHook, type NormalizedOptions } from 'ky';
import { createParser, type EventSourceParser } from 'eventsource-parser';
import type { ChatMessage } from '@/types/chat';
import type { ModelConfig, CustomRequestConfig } from '@/types/model';

export interface SSEOptions {
  onData: (data: string) => void;
  onEvent?: (event: any) => void;
  onCompleted?: (error?: Error) => void;
  onAborted?: () => void;
  onReconnectInterval?: (interval: number) => void;
}

export const createSSEHook = (options: SSEOptions): AfterResponseHook => {
  const hook: AfterResponseHook = async (request: Request, _options: NormalizedOptions, response: KyResponse) => {
    if (!response.ok) {
      options.onCompleted?.(new Error(`HTTP ${response.status}: ${response.statusText}`));
      return;
    }

    if (!response.body) {
      options.onCompleted?.(new Error('响应体为空'));
      return;
    }

    let completed = false;
    const innerOnCompleted = (error?: Error): void => {
      if (completed) return;
      completed = true;
      options.onCompleted?.(error);
    };

    const reader: ReadableStreamDefaultReader<Uint8Array> = response.body.getReader();
    const decoder: TextDecoder = new TextDecoder('utf8');
    const contentType = response.headers.get('content-type') || '';

    let parser: EventSourceParser | null = null;

    if (contentType.includes('text/event-stream') || contentType.includes('text/plain')) {
      // 标准SSE格式
      parser = createParser({
        onEvent: (event) => {
          if (event.data) {
            options.onEvent?.(event);
            options.onData(event.data);
          }
        }
      });
    } else if (contentType.includes('application/json')) {
      // 百度千帆API可能使用JSON流格式
      console.log('检测到JSON流格式，使用特殊处理');
    }

    const read = (): void => {
      reader.read().then((result) => {
        if (result.done) {
          innerOnCompleted();
          return;
        }

        const chunk = decoder.decode(result.value, { stream: true });

        if (parser) {
          parser.feed(chunk);
        } else {
          // 处理不同的流式格式
          if (contentType.includes('application/json')) {
            // 百度千帆API的JSON流格式
            console.log('处理百度千帆JSON流:', chunk);
            try {
              // 尝试解析为JSON
              const jsonData = JSON.parse(chunk);
              options.onData(JSON.stringify(jsonData));
            } catch (error) {
              // 如果不是完整JSON，可能是流式数据
              const lines = chunk.split('\n').filter(line => line.trim());
              for (const line of lines) {
                // 检查是否是结束标记
                if (line.trim() === '[DONE]' || line.trim() === 'data: [DONE]') {
                  console.log('检测到流式结束标记');
                  continue;
                }
                
                try {
                  JSON.parse(line);
                  options.onData(line);
                } catch (parseError) {
                  console.warn('解析JSON行失败:', parseError);
                }
              }
            }
          } else {
            // 兼容 Ollama / NDJSON 格式
            const lines = chunk.split('\n').filter(line => line.trim());
            for (const line of lines) {
              // 检查是否是结束标记
              if (line.trim() === '[DONE]' || line.trim() === 'data: [DONE]') {
                console.log('检测到流式结束标记');
                continue;
              }
              
              try {
                JSON.parse(line);
                options.onData(line);
              } catch (error) {
                console.warn('解析JSON行失败:', error);
              }
            }
          }
        }

        read();
      }).catch((error) => {
        if (request.signal.aborted) {
          options.onAborted?.();
          return;
        }
        innerOnCompleted(error as Error);
      });
    };

    read();

    return response;
  };

  return hook;
};

export interface ChatStreamOptions {
  endpoint: string;
  messages: ChatMessage[];
  apiKey?: string;
  modelConfig: ModelConfig;
  onUpdate: (content: string) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
  signal?: AbortSignal;
}

// 处理多模态消息内容
const processMultimodalMessage = (message: ChatMessage): any => {
  if (!message.attachments?.length) {
    return message.content;
  }

  const content = [];
  
  // 添加媒体内容
  for (const attachment of message.attachments) {
    if (attachment.type === 'image') {
      content.push({
        type: 'image_url',
        image_url: {
          url: attachment.url
        }
      });
    } else if (attachment.type === 'audio') {
      content.push({
        type: 'audio',
        audio: {
          url: attachment.url
        }
      });
    } else if (attachment.type === 'video') {
      content.push({
        type: 'video',
        video: {
          url: attachment.url
        }
      });
    }
  }

  // 添加文本内容
  if (message.content.trim()) {
    content.push({ type: 'text', text: message.content });
  }

  return content;
};

// 构建自定义请求体
const buildCustomRequestBody = (
  template: string,
  messages: ChatMessage[],
  modelConfig: ModelConfig,
  apiKey?: string
): any => {
  // 处理消息格式
  const processedMessages = messages.map(msg => {
    // 特殊处理：只有百度千帆API需要多模态格式
    if (modelConfig.modelType === 'baidu' || modelConfig.apiUrl.includes('qianfan.baidubce.com')) {
      const processedContent = processMultimodalMessage(msg);
      return {
        role: msg.role,
        content: processedContent
      };
    } else {
      // 其他模型（包括Ollama）使用原始消息格式
      return {
        role: msg.role,
        content: msg.content
      };
    }
  });

  // 替换模板变量
  let requestBodyStr = template
    .replace(/\{\{modelName\}\}/g, modelConfig.modelName || modelConfig.name)
    .replace(/\{\{messages\}\}/g, JSON.stringify(processedMessages))
    .replace(/\{\{maxTokens\}\}/g, String(modelConfig.maxTokens || 2000))
    .replace(/\{\{temperature\}\}/g, String(modelConfig.temperature || 0.7))
    .replace(/\{\{apiKey\}\}/g, apiKey || '');

  // 特殊处理：如果是百度千帆API，确保添加stream参数
  if (modelConfig.apiUrl.includes('qianfan.baidubce.com')) {
    try {
      const requestBody = JSON.parse(requestBodyStr);
      if (!requestBody.hasOwnProperty('stream')) {
        requestBody.stream = true;
        requestBodyStr = JSON.stringify(requestBody);
      }
    } catch (error) {
      console.warn('无法为百度千帆API添加stream参数:', error);
    }
  }

  try {
    return JSON.parse(requestBodyStr);
  } catch (error) {
    throw new Error(`自定义请求体模板解析失败: ${error}`);
  }
};

// 解析自定义响应
const parseCustomResponse = (data: string, responseParser: CustomRequestConfig['responseParser']): string => {
  try {
    const parsed = JSON.parse(data);
    
    if (!responseParser) {
      // 使用默认解析逻辑
      return parseDefaultResponse(parsed);
    }

    // 使用自定义路径解析
    const content = getNestedValue(parsed, responseParser.contentPath);
    return content || '';
  } catch (error) {
    console.warn('解析自定义响应失败:', error);
    return '';
  }
};

// 获取嵌套值
const getNestedValue = (obj: any, path: string): any => {
  return path.split('.').reduce((current, key) => {
    if (key.includes('[') && key.includes(']')) {
      const arrayKey = key.substring(0, key.indexOf('['));
      const index = parseInt(key.substring(key.indexOf('[') + 1, key.indexOf(']')));
      return current?.[arrayKey]?.[index];
    }
    return current?.[key];
  }, obj);
};

// 默认响应解析
const parseDefaultResponse = (parsed: any): string => {
  if (parsed.choices?.[0]?.delta?.content) {
    return parsed.choices[0].delta.content;
  } else if (parsed.delta?.text) {
    return parsed.delta.text;
  } else if (parsed.candidates?.[0]?.content?.parts?.[0]?.text) {
    return parsed.candidates[0].content.parts[0].text;
  } else if (parsed.message?.content) {
    return parsed.message.content;
  } else if (parsed.result) {
    return parsed.result;
  } else if (parsed.output) {
    return parsed.output;
  } else if (parsed.content) {
    return parsed.content;
  } else if (parsed.text) {
    return parsed.text;
  }
  return '';
};

export const sendChatStream = async (options: ChatStreamOptions): Promise<void> => {
  const { messages, onUpdate, onComplete, onError, signal, modelConfig } = options;

  let currentContent = '';

  const sseHook = createSSEHook({
    onData: (data: string) => {
      try {
        // 检查是否是流式结束标记
        if (data.trim() === '[DONE]' || data.trim() === 'data: [DONE]') {
          console.log('检测到流式结束标记');
          return;
        }

        // 清理数据，移除可能的前缀
        let cleanData = data;
        if (data.startsWith('data: ')) {
          cleanData = data.substring(6);
        }

        let content = '';

        // 检查是否使用自定义请求配置
        if (modelConfig.customRequestConfig?.enabled && modelConfig.customRequestConfig.responseParser) {
          content = parseCustomResponse(cleanData, modelConfig.customRequestConfig.responseParser);
        } else {
          // 使用默认解析逻辑
          const parsed = JSON.parse(cleanData);
          content = parseDefaultResponse(parsed);
        }

        if (content) {
          const modelName = modelConfig.modelName || modelConfig.name;
          if (modelName && content.includes(modelName)) {
            content = content.replace(new RegExp(`\\b${modelName}\\b`, 'g'), '').trim();
          }
          currentContent += content;
          onUpdate(currentContent);
        }
      } catch (error) {
        console.warn('解析SSE数据失败:', error, 'Data:', data);
      }
    },
    onCompleted: (error?: Error) => {
      if (error) onError(error);
      else onComplete();
    },
    onAborted: () => {
      console.log('Stream aborted');
    }
  });

  try {
    // ---- 根据模型类型构建请求体 ----
    let requestBody: any;

    // 检查是否使用自定义请求配置
    if (modelConfig.customRequestConfig?.enabled && modelConfig.customRequestConfig.requestBodyTemplate) {
      try {
        requestBody = buildCustomRequestBody(
          modelConfig.customRequestConfig.requestBodyTemplate,
          messages,
          modelConfig,
          options.apiKey
        );
      } catch (error) {
        onError(new Error(`自定义请求体构建失败: ${error}`));
        return;
      }
    } else {
      // 使用默认请求体构建逻辑
      if (modelConfig.modelType === 'local') {
        // Ollama格式 - 恢复到原始工作格式
        requestBody = {
          model: modelConfig.modelName || 'llama2',
          messages,
          stream: true,
          temperature: modelConfig.temperature,
          num_predict: modelConfig.maxTokens
        };
      } else if (modelConfig.modelType === 'baidu') {
        // 百度文心千帆格式（兼容OpenAI）
        requestBody = {
          model: modelConfig.modelName || 'ernie-4.0-turbo-8k',
          messages: messages.map(msg => {
            // 百度千帆API需要特殊的多模态格式
            const processedContent = processMultimodalMessage(msg);
            return {
              role: msg.role,
              content: processedContent
            };
          }),
          stream: true
        };
        if (modelConfig.maxTokens) {
          requestBody.max_output_tokens = modelConfig.maxTokens;
        }
        if (modelConfig.temperature !== undefined) {
          requestBody.temperature = modelConfig.temperature;
        }
      } else {
        // 其他模型：OpenAI、Claude、Gemini
        requestBody = {
          messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          stream: true
        };

        if (modelConfig.modelType === 'openai') {
          requestBody.model = modelConfig.modelName || 'gpt-4';
          requestBody.max_tokens = modelConfig.maxTokens;
          requestBody.temperature = modelConfig.temperature;
        } else if (modelConfig.modelType === 'claude') {
          requestBody.max_tokens = modelConfig.maxTokens;
          requestBody.temperature = modelConfig.temperature;
        } else if (modelConfig.modelType === 'gemini') {
          requestBody.maxOutputTokens = modelConfig.maxTokens;
          requestBody.temperature = modelConfig.temperature;
        } else {
          requestBody.model = modelConfig.modelName || 'gpt-4';
          requestBody.max_tokens = modelConfig.maxTokens;
          requestBody.temperature = modelConfig.temperature;
        }
      }
    }

    // ---- 构建请求头 ----
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    // 检查是否使用自定义请求头
    if (modelConfig.customRequestConfig?.enabled && modelConfig.customRequestConfig.headers) {
      // 合并自定义请求头
      Object.assign(headers, modelConfig.customRequestConfig.headers);
      
      // 替换API Key变量
      Object.keys(headers).forEach(key => {
        if (typeof headers[key] === 'string' && headers[key].includes('{{apiKey}}')) {
          headers[key] = headers[key].replace('{{apiKey}}', options.apiKey || '');
        }
      });
    } else if (modelConfig.customRequestConfig?.enabled && !modelConfig.customRequestConfig.headers) {
      // 如果启用了自定义请求配置但没有自定义请求头，使用默认逻辑
      if (options.apiKey) {
        headers['Authorization'] = `Bearer ${options.apiKey}`;
      }
    } else {
      // 使用默认请求头逻辑
      if (options.apiKey) {
        if (modelConfig.modelType === 'openai') {
          headers['Authorization'] = `Bearer ${options.apiKey}`;
        } else if (modelConfig.modelType === 'claude') {
          headers['x-api-key'] = options.apiKey;
          headers['anthropic-version'] = '2023-06-01';
        } else if (modelConfig.modelType === 'baidu') {
          headers['Authorization'] = `Bearer ${options.apiKey}`;
        } else {
          headers['Authorization'] = `Bearer ${options.apiKey}`;
        }
      }
    }

    // ---- 调试信息 ----
    console.log('=== 请求调试信息 ===');
    console.log('Model Config:', {
      modelType: modelConfig.modelType,
      customRequestConfig: modelConfig.customRequestConfig,
      apiUrl: modelConfig.apiUrl,
      modelName: modelConfig.modelName
    });
    console.log('Endpoint:', options.endpoint);
    console.log('API Key (masked):', options.apiKey ? `${options.apiKey.substring(0, 8)}...` : 'None');
    console.log('Headers:', headers);
    console.log('Request Body:', JSON.stringify(requestBody, null, 2));
    console.log('Messages structure:', JSON.stringify(requestBody.messages, null, 2));
    console.log('Stream enabled:', requestBody.stream);
    
    // 特殊调试：Ollama请求体验证
    if (modelConfig.modelType === 'local') {
      console.log('=== Ollama 调试信息 ===');
      console.log('Model name:', requestBody.model);
      console.log('Messages count:', requestBody.messages?.length);
      console.log('First message:', requestBody.messages?.[0]);
      console.log('Stream:', requestBody.stream);
      console.log('Temperature:', requestBody.temperature);
      console.log('Num predict:', requestBody.num_predict);
      console.log('========================');
    }
    
    console.log('==================');

    // ---- 发送请求 ----
    await ky.post(options.endpoint, {
      json: requestBody,
      headers,
      signal,
      hooks: {
        afterResponse: [sseHook]
      }
    });

  } catch (error) {
    if (!signal?.aborted) {
      let message = '发送消息失败';
      if (error instanceof Error) {
        message = error.message;
        console.error('请求失败详情:', error);
        
        // 特殊处理Ollama错误
        if (modelConfig.modelType === 'local') {
          console.error('Ollama请求失败，请检查：');
          console.error('1. Ollama服务是否正在运行');
          console.error('2. 模型名称是否正确');
          console.error('3. API端点是否正确');
          console.error('4. 请求体格式是否正确');
        }
      }
      onError(new Error(message));
    }
  }
};
