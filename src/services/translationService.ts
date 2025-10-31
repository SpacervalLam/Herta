import { sendChatStream } from './chatService';
import type { ChatMessage } from '@/types/chat';

/**
 * 翻译请求接口
 */
export interface TranslationRequest {
  /** 要翻译的文本 */
  text: string;
  /** 源语言代码 */
  sourceLanguage: string;
  /** 目标语言代码 */
  targetLanguage: string;
  /** 模型配置 */
  modelConfig: any;
  /** 中止信号 */
  signal?: AbortSignal;
  /** 流式更新回调 */
  onStreamUpdate?: (translatedText: string) => void;
  /** 进度回调 */
  onProgress?: (progress: number) => void;
  /** 超时时间（毫秒） */
  timeout?: number;
}

/**
 * 翻译响应接口
 */
export interface TranslationResponse {
  /** 翻译后的文本 */
  translatedText: string;
  /** 是否成功 */
  success: boolean;
  /** 错误信息（如果有） */
  error?: string;
}

// 翻译特殊提示词前缀 - 用于标识这是一个翻译请求
export const TRANSLATION_PROMPT_PREFIX = 'TRANSLATE_FROM_{{sourceLang}}_TO_{{targetLang}}:';

/**
 * 生成翻译提示词（将用于拼接到用户消息开头）
 */
export const generateTranslationPromptPrefix = (sourceLang: string, targetLang: string): string => {
  return TRANSLATION_PROMPT_PREFIX
    .replace('{{sourceLang}}', sourceLang.toUpperCase())
    .replace('{{targetLang}}', targetLang.toUpperCase());
};

/**
 * 翻译文本 - 基于AI聊天功能实现
 * 核心功能：将用户文本与翻译提示词前缀拼接后发送给模型
 */
export const translateText = async (
  request: TranslationRequest
): Promise<TranslationResponse> => {
  // 基础输入验证
  if (!request.text?.trim()) {
    return {
      translatedText: '',
      success: true
    };
  }

  if (!request.sourceLanguage || !request.targetLanguage) {
    throw new Error('源语言和目标语言不能为空');
  }

  if (!request.modelConfig || !request.modelConfig.apiUrl) {
    throw new Error('请提供有效的模型配置');
  }

  // 检查源语言和目标语言是否相同
  if (request.sourceLanguage.toLowerCase() === request.targetLanguage.toLowerCase()) {
    return {
      translatedText: request.text,
      success: true
    };
  }

  // 检查中止信号
  if (request.signal?.aborted) {
    throw new Error('翻译请求已被中止');
  }

  // 生成翻译提示词前缀
  const translationPrefix = generateTranslationPromptPrefix(request.sourceLanguage, request.targetLanguage);
  
  // 构建最终的翻译消息（提示词前缀 + 用户文本）
  const translationMessage = `${translationPrefix}\n\n${request.text}`;
  
  // 创建符合ChatMessage格式的消息对象 - 只包含当前翻译内容，不需要上下文
  const messages: ChatMessage[] = [
    {
      id: Date.now().toString(),
      timestamp: Date.now(),
      role: 'user' as const,
      content: translationMessage
    }
  ];

  // 设置超时时间
  const timeoutMs = request.timeout || 30000; // 默认30秒超时
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  // 使用Promise包装翻译过程
  return new Promise((resolve, reject) => {
    let translatedText = '';
    
    // 设置超时处理
    timeoutId = setTimeout(() => {
      reject(new Error('翻译超时，请重试'));
    }, timeoutMs);
    
    // 监听中止信号
    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };
    
    if (request.signal) {
      request.signal.addEventListener('abort', () => {
        cleanup();
        reject(new Error('翻译请求已被中止'));
      });
    }
    
    // 使用sendChatStream进行翻译
    sendChatStream({
      endpoint: request.modelConfig.apiUrl,
      messages,
      modelConfig: request.modelConfig,
      apiKey: request.modelConfig.apiKey, 
      signal: request.signal,
      onUpdate: (content: string) => {
        translatedText = content;
        
        // 调用流式更新回调
        if (request.onStreamUpdate) {
          request.onStreamUpdate(translatedText);
        }
      },
      onComplete: () => {
        cleanup();
        
        // 完成进度更新
        if (request.onProgress) {
          request.onProgress(100);
        }
        
        resolve({
          translatedText,
          success: true
        });
      },
      onError: (error: Error) => {
        cleanup();
        reject(new Error(`翻译失败: ${error?.message || '未知错误'}`));
      }
    });
  });
};

/**
 * 翻译服务对象
 */
export const translationService = {
  translateText,
  generateTranslationPromptPrefix,
};

export default translationService;