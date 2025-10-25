import ky, { type KyResponse, type AfterResponseHook, type NormalizedOptions } from 'ky';
import { createParser, type EventSourceParser } from 'eventsource-parser';
import type { ChatMessage } from '@/types/chat';
import type { ModelConfig } from '@/types/model';

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
          // 兼容 Ollama / NDJSON 格式
          const lines = chunk.split('\n').filter(line => line.trim());
          for (const line of lines) {
            try {
              JSON.parse(line);
              options.onData(line);
            } catch (error) {
              console.warn('解析JSON行失败:', error);
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

export const sendChatStream = async (options: ChatStreamOptions): Promise<void> => {
  const { messages, onUpdate, onComplete, onError, signal, modelConfig } = options;

  let currentContent = '';

  const sseHook = createSSEHook({
    onData: (data: string) => {
      try {
        const parsed = JSON.parse(data);
        let content = '';

        // ---- 支持多模型格式 ----
        if (parsed.choices?.[0]?.delta?.content) {
          content = parsed.choices[0].delta.content; // OpenAI
        } else if (parsed.delta?.text) {
          content = parsed.delta.text; // Claude
        } else if (parsed.candidates?.[0]?.content?.parts?.[0]?.text) {
          content = parsed.candidates[0].content.parts[0].text; // Gemini
        } else if (parsed.message?.content) {
          content = parsed.message.content; // Ollama
        } else if (parsed.result) {
          content = parsed.result; // 百度文心
        } else if (parsed.output) {
          content = parsed.output;
        } else if (parsed.content) {
          content = parsed.content;
        } else if (parsed.text) {
          content = parsed.text;
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
        console.warn('解析SSE数据失败:', error);
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

    if (modelConfig.modelType === 'local') {
      // Ollama格式
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
        messages,
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
        messages,
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

    // ---- 构建请求头 ----
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

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
      if (error instanceof Error) message = error.message;
      onError(new Error(message));
    }
  }
};
