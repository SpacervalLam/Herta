import ky, { type KyResponse, type AfterResponseHook, type NormalizedOptions } from 'ky';
import { createParser, type EventSourceParser } from 'eventsource-parser';
import type { ChatMessage } from '@/types/chat';
import type { ModelConfig, CustomRequestConfig } from '@/types/model';
import { getModelConfig } from '@/utils/modelStorage';

// 翻译提示词前缀标识 - 与translationService保持一致
const TRANSLATION_PROMPT_PREFIX = 'TRANSLATE_FROM_';

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
                  continue;
                }
                
                try {
                  JSON.parse(line);
                  options.onData(line);
                } catch (parseError) {
                  // 静默处理解析错误
                }
              }
            }
          } else {
            // 兼容 Ollama / NDJSON 格式
            const lines = chunk.split('\n').filter(line => line.trim());
            for (const line of lines) {
              // 检查是否是结束标记
              if (line.trim() === '[DONE]' || line.trim() === 'data: [DONE]') {
                  continue;
                }
              
              try {
                JSON.parse(line);
                options.onData(line);
              } catch (error) {
                // 静默处理解析错误
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
  userId?: string;
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
  console.log('开始构建自定义请求体', { 
    modelId: modelConfig.id, 
    modelType: modelConfig.modelType, 
    modelName: modelConfig.modelName || modelConfig.name,
    messageCount: messages.length,
    hasApiKey: !!apiKey
  });
  
  // 处理消息格式
  const processedMessages = messages.map(msg => {
    // 特殊处理：只有百度千帆API需要多模态格式
    if (modelConfig.modelType === 'baidu' || modelConfig.apiUrl.includes('qianfan.baidubce.com')) {
      const processedContent = processMultimodalMessage(msg);
      console.log('处理百度千帆API多模态消息', { role: msg.role, hasAttachments: !!msg.attachments?.length });
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
    .replace(/\{\{apiKey\}\}/g, apiKey ? '[REDACTED]' : '');

  // 特殊处理：如果是百度千帆API，先尝试非流式请求
  if (modelConfig.apiUrl.includes('qianfan.baidubce.com')) {
    try {
      const requestBody = JSON.parse(requestBodyStr);
      // 百度千帆可能不支持流式响应，先尝试非流式
      if (requestBody.hasOwnProperty('stream')) {
        console.log('百度千帆API请求，禁用stream参数', { modelId: modelConfig.id });
        delete requestBody.stream;
        requestBodyStr = JSON.stringify(requestBody);
      }
    } catch (error: unknown) {
    // 静默处理错误
    console.warn('百度千帆API请求体预处理失败', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  try {
    console.log('自定义请求体构建成功', { modelId: modelConfig.id });
    return JSON.parse(requestBodyStr);
  } catch (error: unknown) {
    console.error('自定义请求体模板解析失败', { 
      error: error instanceof Error ? error.message : String(error), 
      modelId: modelConfig.id,
      templateLength: template.length
    });
    throw new Error(`自定义请求体模板解析失败: ${error instanceof Error ? error.message : String(error)}`);
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
      // 静默处理解析错误
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
  // 百度千帆流式响应格式
  if (parsed.choices?.[0]?.delta?.content) {
    return parsed.choices[0].delta.content;
  }
  // 百度千帆非流式响应格式
  else if (parsed.choices?.[0]?.message?.content) {
    return parsed.choices[0].message.content;
  }
  // 百度千帆其他格式
  else if (parsed.result) {
    return parsed.result;
  }
  // 百度千帆错误格式
  else if (parsed.error) {
    return '';
  }
  
  return '';
};

// 默认响应解析
const parseDefaultResponse = (parsed: any): string => {
  // OpenAI格式
  if (parsed.choices?.[0]?.delta?.content) {
    return parsed.choices[0].delta.content;
  }
  // Claude格式
  else if (parsed.delta?.text) {
    return parsed.delta.text;
  }
  // Gemini格式
  else if (parsed.candidates?.[0]?.content?.parts?.[0]?.text) {
    return parsed.candidates[0].content.parts[0].text;
  }
  // Ollama格式
  else if (parsed.message?.content) {
    return parsed.message.content;
  }
  // 百度千帆格式
  else if (parsed.result) {
    return parsed.result;
  }
  // 其他格式
  else if (parsed.output) {
    return parsed.output;
  }
  else if (parsed.content) {
    return parsed.content;
  }
  else if (parsed.text) {
    return parsed.text;
  }
  
  return '';
};

export const sendChatStream = async (options: ChatStreamOptions): Promise<void> => {
  console.log('开始发送聊天流请求', { 
    modelId: options.modelConfig?.id, 
    modelName: options.modelConfig?.name || options.modelConfig?.modelName,
    modelType: options.modelConfig?.modelType,
    messageCount: options.messages?.length || 0,
    hasApiKey: !!options.apiKey,
    temperature: options.modelConfig?.temperature,
    maxTokens: options.modelConfig?.maxTokens
  });

  const { messages, onUpdate, onComplete, onError, signal, modelConfig, apiKey: providedApiKey, userId } = options;
  
  // 记录最后一条用户消息内容预览
  const lastUserMessage = messages.filter(msg => msg.role === 'user').pop();
  if (lastUserMessage) {
    console.log('用户输入内容预览', { 
      content: lastUserMessage.content.substring(0, 100) + (lastUserMessage.content.length > 100 ? '...' : ''),
      hasAttachments: !!lastUserMessage.attachments?.length
    });
  }

  // 处理消息列表，支持翻译提示词
  let processedMessages = [...messages];
  
  // 如果没有提供API key，尝试从当前活动模型获取
  let apiKey = providedApiKey;
  if (!apiKey && modelConfig?.id && userId) {
    try {
      const activeModel = await getModelConfig(modelConfig.id, userId);
      if (activeModel?.apiKey) {
        apiKey = activeModel.apiKey;
      }
    } catch (error) {
      console.error('获取模型API key失败:', error);
    }
  } else if (!apiKey && !userId) {
    console.warn('无法获取API key：用户未登录');
  }
  
  // 检查最后一条用户消息是否需要处理翻译提示词
  if (processedMessages.length > 0 && processedMessages[processedMessages.length - 1].role === 'user') {
    const lastMessage = processedMessages[processedMessages.length - 1];
    // 确保翻译提示词在消息开头（与translationService兼容）
    if (typeof lastMessage.content === 'string') {
      // 检查是否包含翻译提示词格式
      const translationRegex = new RegExp(`^${TRANSLATION_PROMPT_PREFIX}[A-Z]+_TO_[A-Z]+:`);
      if (translationRegex.test(lastMessage.content)) {
        // 已正确格式化为翻译提示词在开头，不需要额外处理
        // 这里保持原有逻辑，确保翻译功能正常工作
        // 如果需要额外处理，可以在这里添加
      } else if (lastMessage.content.includes('TRANSLATE_FROM_')) {
        // 如果翻译提示词在消息中间，提取并移到合适位置
        const lines = lastMessage.content.split('\n');
        let promptLine = '';
        let contentLines: string[] = [];
        
        // 分离提示词行和内容行
        for (const line of lines) {
          if (line.startsWith('TRANSLATE_FROM_')) {
            promptLine = line;
          } else {
            contentLines.push(line);
          }
        }
        
        if (promptLine) {
          // 更新最后一条消息为纯内容
          processedMessages[processedMessages.length - 1] = {
            ...lastMessage,
            content: contentLines.join('\n').trim()
          };
          // 在系统消息中添加翻译提示词
          processedMessages.unshift({
            id: Date.now().toString(),
            timestamp: Date.now(),
            role: 'system',
            content: promptLine
          });
        }
      }
    }
  }

  let currentContent = '';

  // 特殊处理：如果是百度千帆API，先尝试流式请求，失败则回退到非流式

  const sseHook = createSSEHook({
    onData: (data: string) => {
      try {
        // 检查是否是流式结束标记
        if (data.trim() === '[DONE]' || data.trim() === 'data: [DONE]') {
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
          
          // 特殊处理百度千帆API的流式响应
          if (modelConfig.apiUrl.includes('qianfan.baidubce.com')) {
            content = parseBaiduQianfanResponse(parsed);
          } else {
            content = parseDefaultResponse(parsed);
          }
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
            // 静默处理解析错误
          }
    },
    onCompleted: (error?: Error) => {
      if (error) {
        // 如果是百度千帆API且流式请求失败，尝试非流式请求
        if (modelConfig.apiUrl.includes('qianfan.baidubce.com') && error.message.includes('401')) {
          fallbackToNonStreaming();
        } else {
          onError(error);
        }
      } else {
        onComplete();
      }
    },
    onAborted: () => {
    }
  });

  // 百度千帆API非流式请求回退函数
  const fallbackToNonStreaming = async () => {
    try {
      console.log('开始百度千帆非流式API回退请求', { modelId: modelConfig.id });
      
      const requestBody = buildCustomRequestBody(
        modelConfig.customRequestConfig?.requestBodyTemplate || '{"model": "{{modelName}}", "messages": {{messages}}}',
        processedMessages,
        modelConfig,
        apiKey
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

      console.log('发送API请求', { apiUrl: modelConfig.apiUrl, requestSize: JSON.stringify(requestBody).length });
      const response = await ky.post(modelConfig.apiUrl, {
        json: requestBody,
        headers,
        signal
      });

      console.log('API请求成功响应', { status: response.status, statusText: response.statusText });
      const data = await response.json() as any;
      console.log('接收API响应数据', { hasChoices: !!data.choices, hasResult: !!data.result });

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
            processedMessages,
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
            messages: processedMessages,
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
          messages: processedMessages.map(msg => {
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
          headers[key] = headers[key].replace('{{apiKey}}', apiKey || '');
        }
      });
    } else if (modelConfig.customRequestConfig?.enabled && !modelConfig.customRequestConfig.headers) {
      // 如果启用了自定义请求配置但没有自定义请求头，使用默认逻辑
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
    } else {
      // 使用默认请求头逻辑
      if (apiKey) {
        if (modelConfig.modelType === 'openai') {
          headers['Authorization'] = `Bearer ${apiKey}`;
        } else if (modelConfig.modelType === 'claude') {
          headers['x-api-key'] = apiKey;
          headers['anthropic-version'] = '2023-06-01';
        } else if (modelConfig.modelType === 'baidu') {
          // 百度千帆API使用特殊的认证格式
          headers['Authorization'] = `Bearer ${apiKey}`;
          headers['Content-Type'] = 'application/json';
        } else {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }
      }
    }

    // ---- 调试信息已移除 ----

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
      console.error('发送请求出错:', { 
        error: error instanceof Error ? error.message : String(error),
        modelId: modelConfig.id,
        apiUrl: modelConfig.apiUrl,
        errorType: error instanceof TypeError ? 'TypeError' : 
                  error instanceof SyntaxError ? 'SyntaxError' : 
                  'UnknownError' // 使用UnknownError代替TimeoutError
      });
      let message = '发送消息失败';
      if (error instanceof Error) {
        message = error.message;
        
        // 特殊处理Ollama错误 - 移除调试信息
        if (modelConfig.modelType === 'local') {
          // 错误信息保留，但移除console.error
        }
      }
      onError(new Error(message));
    }
  } finally {
    console.log('聊天请求处理完成', { modelId: modelConfig.id });
  }
};
