import { useState, useCallback } from 'react';
import { useChat } from './useChat';
import { useTranslation } from 'react-i18next';
import translationService from '@/services/translationService';

interface LanguageInfo {
  code: string;
  name: string;
  displayName: string;
}

interface TranslationOptions {
  sourceLang: LanguageInfo;
  targetLang: LanguageInfo;
  text: string;
}

interface TranslationResult {
  translatedText: string;
  error: string | null;
  isLoading: boolean;
}

export const useTranslationConversation = () => {
  const { t } = useTranslation();
  const { isLoading: chatLoading } = useChat();
  const [translatedText, setTranslatedText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 生成翻译系统提示语
  const generateTranslationPrompt = useCallback((sourceLang: LanguageInfo, targetLang: LanguageInfo): string => {
    return `You are a professional translator.
Your task is to translate the given text from ${sourceLang.name} to ${targetLang.name}.
Do not include explanations, comments, or formatting — output only the final translated text.`;
  }, []);

  // 执行翻译
  const translate = useCallback(async (options: TranslationOptions): Promise<TranslationResult> => {
    const { sourceLang, targetLang, text } = options;

    if (!text.trim()) {
      return { translatedText: '', error: null, isLoading: false };
    }

    setIsLoading(true);
    setError(null);

    try {
      // 创建AbortController用于处理中止操作
      const abortController = new AbortController();
      
      // 获取模型配置（这里需要从适当的位置获取，暂时使用一个基础配置）
      // 在实际应用中，应该从useChat hook或全局状态中获取模型配置
      const modelConfig = {
        apiUrl: '', // 应该从实际配置中获取
        // 其他必要的模型配置参数
      };
      
      // 调用实际的翻译服务
      const response = await translationService.translateText({
        text,
        sourceLanguage: sourceLang.code,
        targetLanguage: targetLang.code,
        modelConfig,
        signal: abortController.signal,
        onStreamUpdate: (updatedText: string) => {
          // 这里可以实现实时更新翻译结果的功能
          setTranslatedText(updatedText);
        },
        onProgress: (progress: number) => {
          // 可以处理翻译进度更新
          console.log(`翻译进度: ${progress}%`);
        },
        timeout: 60000, // 60秒超时
      });

      if (response.success) {
        setTranslatedText(response.translatedText);
        return { translatedText: response.translatedText, error: null, isLoading: false };
      } else {
        const errorMessage = response.error || t('translation.error.translationFailed');
        setError(errorMessage);
        return { translatedText: '', error: errorMessage, isLoading: false };
      }
    } catch (err: any) {
      const errorMessage = err.message || t('translation.error.translationFailed');
      setError(errorMessage);
      return { translatedText: '', error: errorMessage, isLoading: false };
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  // 清空翻译结果
  const clearTranslation = useCallback(() => {
    setTranslatedText('');
    setError(null);
  }, []);

  return {
    translatedText,
    error,
    isLoading: isLoading || chatLoading,
    translate,
    clearTranslation,
    generateTranslationPrompt,
  };
};

export default useTranslationConversation;