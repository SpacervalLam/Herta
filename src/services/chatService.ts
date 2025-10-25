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

  // 特殊处理：如果是百度千帆API，先尝试非流式请求
  if (modelConfig.apiUrl.includes('qianfan.baidubce.com')) {
    try {
      const requestBody = JSON.parse(requestBodyStr);
      // 百度千帆可能不支持流式响应，先尝试非流式
      if (requestBody.hasOwnProperty('stream')) {
        delete requestBody.stream;
        requestBodyStr = JSON.stringify(requestBody);
      }
      console.log('百度千帆API请求体（非流式）:', requestBodyStr);
    } catch (error) {
      console.warn('无法处理百度千帆API请求体:', error);
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

// 百度千帆API响应解析
const parseBaiduQianfanResponse = (parsed: any): string => {
  console.log('解析百度千帆响应:', JSON.stringify(parsed, null, 2));
  
  // 百度千帆流式响应格式
  if (parsed.choices?.[0]?.delta?.content) {
    console.log('使用百度千帆流式格式解析');
    return parsed.choices[0].delta.content;
  }
  // 百度千帆非流式响应格式
  else if (parsed.choices?.[0]?.message?.content) {
    console.log('使用百度千帆非流式格式解析');
    return parsed.choices[0].message.content;
  }
  // 百度千帆其他格式
  else if (parsed.result) {
    console.log('使用百度千帆result格式解析');
    return parsed.result;
  }
  // 百度千帆错误格式
  else if (parsed.error) {
    console.log('百度千帆API错误:', parsed.error);
    return '';
  }
  
  console.log('未找到百度千帆可解析的内容格式');
  return '';
};

// 默认响应解析
const parseDefaultResponse = (parsed: any): string => {
  console.log('尝试解析响应:', JSON.stringify(parsed, null, 2));
  
  // OpenAI格式
  if (parsed.choices?.[0]?.delta?.content) {
    console.log('使用OpenAI格式解析');
    return parsed.choices[0].delta.content;
  }
  // Claude格式
  else if (parsed.delta?.text) {
    console.log('使用Claude格式解析');
    return parsed.delta.text;
  }
  // Gemini格式
  else if (parsed.candidates?.[0]?.content?.parts?.[0]?.text) {
    console.log('使用Gemini格式解析');
    return parsed.candidates[0].content.parts[0].text;
  }
  // Ollama格式
  else if (parsed.message?.content) {
    console.log('使用Ollama格式解析');
    return parsed.message.content;
  }
  // 百度千帆格式
  else if (parsed.result) {
    console.log('使用百度千帆格式解析');
    return parsed.result;
  }
  // 其他格式
  else if (parsed.output) {
    console.log('使用output格式解析');
    return parsed.output;
  }
  else if (parsed.content) {
    console.log('使用content格式解析');
    return parsed.content;
  }
  else if (parsed.text) {
    console.log('使用text格式解析');
    return parsed.text;
  }
  
  console.log('未找到可解析的内容格式');
  return '';
};

export const sendChatStream = async (options: ChatStreamOptions): Promise<void> => {
  const { messages, onUpdate, onComplete, onError, signal, modelConfig } = options;

  let currentContent = '';

  // 特殊处理：如果是百度千帆API，先尝试流式请求，失败则回退到非流式
  if (modelConfig.apiUrl.includes('qianfan.baidubce.com')) {
    console.log('使用百度千帆API（尝试流式请求）');
  }

  const sseHook = createSSEHook({
    onData: (data: string) => {
      console.log('收到SSE数据:', data);
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
        console.log('清理后的数据:', cleanData);

        let content = '';

        // 检查是否使用自定义请求配置
        if (modelConfig.customRequestConfig?.enabled && modelConfig.customRequestConfig.responseParser) {
          content = parseCustomResponse(cleanData, modelConfig.customRequestConfig.responseParser);
        } else {
          // 使用默认解析逻辑
          const parsed = JSON.parse(cleanData);
          console.log('解析响应数据:', parsed);
          
          // 特殊处理百度千帆API的流式响应
          if (modelConfig.apiUrl.includes('qianfan.baidubce.com')) {
            content = parseBaiduQianfanResponse(parsed);
          } else {
            content = parseDefaultResponse(parsed);
          }
          console.log('提取的内容:', content);
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
      if (error) {
        // 如果是百度千帆API且流式请求失败，尝试非流式请求
        if (modelConfig.apiUrl.includes('qianfan.baidubce.com') && error.message.includes('401')) {
          console.log('百度千帆流式请求失败，尝试非流式请求');
          fallbackToNonStreaming();
        } else {
          onError(error);
        }
      } else {
        onComplete();
      }
    },
    onAborted: () => {
      console.log('Stream aborted');
    }
  });

  // 百度千帆API非流式请求回退函数
  const fallbackToNonStreaming = async () => {
    try {
      console.log('使用百度千帆非流式请求');
      
      const requestBody = buildCustomRequestBody(
        modelConfig.customRequestConfig?.requestBodyTemplate || '{"model": "{{modelName}}", "messages": {{messages}}}',
        messages,
        modelConfig,
        modelConfig.apiKey
      );
      
      // 移除stream参数
      if (requestBody.stream) {
        delete requestBody.stream;
      }
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${modelConfig.apiKey}`,
        ...modelConfig.customRequestConfig?.headers
      };

      // 替换API Key
      if (modelConfig.apiKey) {
        Object.keys(headers).forEach(key => {
          if (headers[key].includes('{{apiKey}}')) {
            headers[key] = headers[key].replace('{{apiKey}}', modelConfig.apiKey!);
          }
        });
      }

      console.log('百度千帆非流式请求头:', headers);
      console.log('百度千帆非流式请求体:', requestBody);

      const response = await ky.post(modelConfig.apiUrl, {
        json: requestBody,
        headers,
        signal
      });

      const data = await response.json() as any;
      console.log('百度千帆非流式响应:', data);

      // 解析响应内容
      let content = '';
      if (data.choices?.[0]?.message?.content) {
        content = data.choices[0].message.content;
      } else if (data.result) {
        content = data.result;
      } else if (data.error) {
        throw new Error(data.error.message || '百度千帆API错误');
      }

      if (content) {
        onUpdate(content);
        onComplete();
      } else {
        onError(new Error('未收到有效响应'));
      }
    } catch (error) {
      console.error('百度千帆非流式API请求失败:', error);
      onError(error as Error);
    }
  };

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
        // Ollama格式 - 兼容更多模型的基础格式
        requestBody = {
          model: modelConfig.modelName || 'llama2',
          messages,
          stream: true
        };
        
        // 只添加有效的参数，避免某些模型不支持的参数
        if (modelConfig.temperature !== undefined && modelConfig.temperature !== null) {
          requestBody.temperature = modelConfig.temperature;
        }
        if (modelConfig.maxTokens && modelConfig.maxTokens > 0) {
          requestBody.num_predict = modelConfig.maxTokens;
        }
        
        // 特殊处理：deepseek-r1模型可能需要不同的参数格式
        if (modelConfig.modelName?.includes('deepseek-r1')) {
          console.log('检测到deepseek-r1模型，使用特殊处理');
          // 移除可能导致问题的参数
          delete requestBody.temperature;
          delete requestBody.num_predict;
          
          // 使用options格式
          requestBody.options = {};
          if (modelConfig.temperature !== undefined && modelConfig.temperature !== null) {
            requestBody.options.temperature = modelConfig.temperature;
          }
          if (modelConfig.maxTokens && modelConfig.maxTokens > 0) {
            requestBody.options.num_predict = modelConfig.maxTokens;
          }
        }
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
        console.log('百度千帆流式请求体:', JSON.stringify(requestBody, null, 2));
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
          // 百度千帆API使用特殊的认证格式
          headers['Authorization'] = `Bearer ${options.apiKey}`;
          headers['Content-Type'] = 'application/json';
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
      console.log('Model config temperature:', modelConfig.temperature);
      console.log('Model config maxTokens:', modelConfig.maxTokens);
      console.log('Full request body keys:', Object.keys(requestBody));
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
