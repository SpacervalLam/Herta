import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Copy, Languages, ArrowLeftRight } from 'lucide-react';
import { translationService } from '@/services/translationService';
import { getActiveModel } from '@/utils/modelStorage';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';


// 支持的语言列表
const SUPPORTED_LANGUAGES = [
  { code: 'zh', name: 'Chinese', displayName: '中文' },
  { code: 'en', name: 'English', displayName: 'English' },
  { code: 'ja', name: 'Japanese', displayName: '日本語' },
  { code: 'ko', name: 'Korean', displayName: '한국어' },
  { code: 'fr', name: 'French', displayName: 'Français' },
  { code: 'de', name: 'German', displayName: 'Deutsch' },
  { code: 'es', name: 'Spanish', displayName: 'Español' },
  { code: 'ru', name: 'Russian', displayName: 'Русский' },
];

interface TranslationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TranslationHistoryItem {
  id: string;
  sourceText: string;
  translatedText: string;
  sourceLang: { code: string; name: string; displayName: string };
  targetLang: { code: string; name: string; displayName: string };
  timestamp: number;
}

// 可用的AI翻译模型列表
// 使用ModelSelector组件获取用户配置的模型列表

const TranslationModal: React.FC<TranslationModalProps> = ({ open, onOpenChange }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [sourceText, setSourceText] = useState('');
  const [realTimeTranslatedText, setRealTimeTranslatedText] = useState('');
  // AI翻译相关功能已移除
  const [sourceLang, setSourceLang] = useState(SUPPORTED_LANGUAGES[0]);
  const [targetLang, setTargetLang] = useState(SUPPORTED_LANGUAGES[1]);
  const [isRealTimeTranslating, setIsRealTimeTranslating] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [translationHistory, setTranslationHistory] = useState<TranslationHistoryItem[]>([]);
  const [copySuccess, setCopySuccess] = useState(false);
  const [debounceTimeout, setDebounceTimeout] = useState<number | null>(null);
  const [activeModelName, setActiveModelName] = useState('');
  
  // 获取当前活动模型名称
  useEffect(() => {
    const activeModel = getActiveModel();
    setActiveModelName(activeModel?.name || '未知模型');
  }, []);
  // Removed unused textareaRef
  
  // History item functionality can be implemented here if needed in the future

  // 交换源语言和目标语言
  const swapLanguages = () => {
    const temp = sourceLang;
    setSourceLang(targetLang);
    setTargetLang(temp);
    
    const currentTranslation = getCurrentTranslatedText();
    setSourceText(currentTranslation);
    
    // 交换后重置翻译结果，让系统自动进行新的翻译
    setRealTimeTranslatedText('');
  };

  // 复制译文到剪贴板
  const copyTranslatedText = async () => {
    const textToCopy = getCurrentTranslatedText();
    if (textToCopy) {
      try {
        await navigator.clipboard.writeText(textToCopy);
        setCopySuccess(true);
        toast({
          variant: 'default',
          title: t('translation.copiedToClipboard'),
          description: t('translation.copySuccessMessage'),
          duration: 2000,
        });
        
        // 3秒后重置复制成功状态
        setTimeout(() => setCopySuccess(false), 3000);
      } catch (err) {
        console.error('Failed to copy:', err);
        toast({
          variant: 'destructive',
          title: t('translation.copyFailed'),
          description: t('translation.copyErrorMessage'),
        });
      }
    }
  };

  // 从本地存储加载历史记录
  const loadHistoryFromStorage = useCallback(() => {
    try {
      const savedHistory = localStorage.getItem('translationHistory');
      if (savedHistory) {
        setTranslationHistory(JSON.parse(savedHistory));
      }
    } catch (err) {
      console.error('Failed to load history from storage:', err);
    }
  }, []);

  // 保存历史记录到本地存储
  const saveHistoryToStorage = useCallback((history: TranslationHistoryItem[]) => {
    try {
      localStorage.setItem('translationHistory', JSON.stringify(history));
    } catch (err) {
      console.error('Failed to save history to storage:', err);
    }
  }, []);

  // 添加键盘快捷键支持
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Ctrl/Cmd + Shift + X 清空输入
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'X') {
      e.preventDefault();
      clearInput();
    }
    
    // Ctrl/Cmd + Shift + C 复制译文
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C' && getCurrentTranslatedText()) {
      e.preventDefault();
      copyTranslatedText();
    }
  }, [sourceText, sourceLang, targetLang]);

  // 清空输入
  const clearInput = () => {
    setSourceText('');
    setRealTimeTranslatedText('');
    setError(null);
  };



  // 从历史记录加载
  const loadFromHistory = (item: TranslationHistoryItem) => {
    setSourceText(item.sourceText);
    // 从历史记录加载时，设置为实时翻译模式（仅显示结果）
    setRealTimeTranslatedText(item.translatedText);
    setSourceLang(item.sourceLang);
    setTargetLang(item.targetLang);
  };



  // 实时翻译处理 - 优化为百度翻译风格的交互体验
  const handleRealTimeTranslate = useCallback(async ({ signal }: { signal?: AbortSignal } = {}) => {
    if (!sourceText.trim()) return;
    
    // 如果信号已经中止，直接返回
    if (signal?.aborted) {
      return;
    }

    setIsRealTimeTranslating(true);
    setError(null);
    
    try {
        // 使用翻译服务进行实时翻译
        const activeModel = getActiveModel();
        if (!activeModel?.apiUrl) {
          console.error('没有可用的模型配置');
          return;
        }
        
        const result = await translationService.translateText({
          text: sourceText,
          sourceLanguage: sourceLang.code,
          targetLanguage: targetLang.code,
          modelConfig: activeModel,
          timeout: 5000,
          signal
        });
      
      // 检查信号是否已中止，避免更新已取消的请求结果
      if (!signal?.aborted && result.success) {
        setRealTimeTranslatedText(result.translatedText);
      }
    } catch (err) {
      // 实时翻译失败时，不显示错误提示，避免影响用户体验
      // 对于中止的请求，不记录错误
      if (!signal?.aborted) {
        console.error('Real-time translation error:', err);
      }
    } finally {
      if (!signal?.aborted) {
        setIsRealTimeTranslating(false);
      }
    }
  }, [sourceText, sourceLang, targetLang]);

  // AI翻译相关功能已移除

  // 监听源文本变化，执行实时翻译
  useEffect(() => {
    // 清除之前的定时器
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }
    
    // 清除之前的翻译请求
    const controller = new AbortController();
    const signal = controller.signal;
    
    // 只有在文本变化并且长度大于0时才触发翻译
    if (sourceText.trim().length > 0) {
      // 对于较短的文本（少于10个字符），使用更短的延迟以获得更快的响应
      // 对于较长的文本，使用稍长的延迟以避免过度请求
      const delay = sourceText.length < 10 ? 300 : 500;
      
      const timeoutId = setTimeout(() => {
        // 只有当用户停止输入一段时间后才进行翻译
        handleRealTimeTranslate({ signal });
      }, delay);
      
      setDebounceTimeout(timeoutId);
      
      return () => {
        clearTimeout(timeoutId);
        controller.abort(); // 中止未完成的翻译请求
      };
    } else {
      setRealTimeTranslatedText('');
    }
  }, [sourceText, handleRealTimeTranslate]);
  
  // 获取当前显示的翻译结果
  const getCurrentTranslatedText = () => {
    return realTimeTranslatedText;
  };
  
  // 检查当前是否正在翻译
  const isTranslating = () => {
    return isRealTimeTranslating;
  };
  // 组件挂载时加载历史记录
  useEffect(() => {
    if (open) {
      loadHistoryFromStorage();
    }
  }, [open, loadHistoryFromStorage]);

  // 清空历史记录
  const clearHistory = useCallback(() => {
    setTranslationHistory([]);
    saveHistoryToStorage([]);
    toast({
      variant: 'default',
      title: t('translation.historyCleared'),
      description: t('translation.historyClearMessage'),
    });
  }, [t, saveHistoryToStorage, toast]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl md:max-w-5xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b bg-card/95 backdrop-blur-sm">
          <div className="flex justify-between items-center w-full">
            <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
              <Globe className="h-5 w-5 text-primary" />
              <span>{t('translation.title')}</span>
            </DialogTitle>
          </div>
        </DialogHeader>

        <Tabs defaultValue="translation" className="flex-1 flex flex-col">
          <TabsList className="w-full p-1 bg-muted/50">
            <TabsTrigger value="translation" className="flex-1">
              {t('translation.title')}
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1">
            {t('translation.history')}
          </TabsTrigger>
          </TabsList>

          <TabsContent value="translation" className="p-6 flex flex-col flex-1">
            {/* 语言选择 */}
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap sm:mb-6 sm:gap-4">
              <div className="flex-1 min-w-[130px] sm:min-w-[150px]">
                <Select value={sourceLang.code} onValueChange={(value) => {
                  const lang = SUPPORTED_LANGUAGES.find(l => l.code === value);
                  if (lang) setSourceLang(lang);
                }}>
                  <SelectTrigger className="h-11 border-muted-foreground/20 hover:border-primary transition-colors">
                    <SelectValue placeholder={t('translation.sourceLanguage')} />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <SelectItem key={lang.code} value={lang.code} className="cursor-pointer">
                        <span className="font-medium mr-2">{lang.displayName}</span>
                        <span className="text-xs text-muted-foreground">({lang.name})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={swapLanguages} 
                      className="rounded-full border border-muted-foreground/20 hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all hover:border-primary/50"
                    >
                      <ArrowLeftRight className="h-5 w-5 transition-transform hover:scale-110 duration-300" strokeWidth={1.5} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('translation.swapLanguages')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <div className="flex-1 min-w-[150px]">
                <Select value={targetLang.code} onValueChange={(value) => {
                  const lang = SUPPORTED_LANGUAGES.find(l => l.code === value);
                  if (lang) setTargetLang(lang);
                }}>
                  <SelectTrigger className="h-11 border-muted-foreground/20 hover:border-primary transition-colors">
                    <SelectValue placeholder={t('translation.targetLanguage')} />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <SelectItem key={lang.code} value={lang.code} className="cursor-pointer">
                        <span className="font-medium mr-2">{lang.displayName}</span>
                        <span className="text-xs text-muted-foreground">({lang.name})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 翻译内容区域 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 flex-1 min-h-[350px] sm:min-h-[400px]">
              {/* 源文本 */}
              <Card className="flex flex-col h-full border rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden">
                <div className="px-4 py-3 border-b flex justify-between items-center bg-muted/30">
                  <span className="text-sm font-semibold">{sourceLang.displayName}</span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={clearInput} 
                    className="h-8 px-3 text-xs hover:bg-primary/5 transition-colors"
                  >
                    {t('common.clear')}
                  </Button>
                </div>
                <CardContent className="p-0 flex-1 flex flex-col">
                  <Textarea
                    placeholder={t('translation.enterText')}
                    value={sourceText}
                    onChange={(e) => setSourceText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1 resize-none border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 px-4 py-4 text-sm placeholder:text-muted-foreground/60"
                    spellCheck="false"
                    autoFocus
                  />
                  <div className="px-4 py-2 border-t text-xs flex justify-between items-center bg-muted/10">
                    <span>{sourceText.length} {t('translation.characters')}</span>
                    <div className="flex items-center space-x-2">
                      {/* AI翻译按钮已移除 */}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 译文 */}
              <Card className="flex flex-col h-full border rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden">
                <div className="px-4 py-3 border-b flex justify-between items-center bg-muted/30">
                    <div className="flex items-center space-x-2">
                      <Languages className="h-4 w-4" />
                      <span className="text-sm font-semibold">{targetLang.displayName}</span>
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={copyTranslatedText}
                            disabled={!getCurrentTranslatedText().trim()}
                            className="h-8 px-3 text-xs hover:bg-primary/5 transition-colors"
                          >
                            {t('translation.copy')}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{copySuccess ? t('translation.copied') : t('translation.copy')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                </div>
                <CardContent className="p-0 flex-1 flex flex-col">
                  {error ? (
                    <Alert variant="destructive" className="m-4 text-xs">
                      <AlertDescription>{error.message}</AlertDescription>
                    </Alert>
                  ) : isTranslating() ? (
                    <div className="p-4 flex-1 flex items-center justify-center">
                      <div className="space-y-2 p-4 bg-muted/10 rounded-md w-full animate-pulse">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    </div>
                  ) : (
                    <div className="relative flex-1 flex flex-col">
                      <Textarea
                        placeholder={`${t('translation.translatedText')} ${t('translation.modelDependent')} ${activeModelName}`}
                        value={getCurrentTranslatedText()}
                        readOnly
                        className="flex-1 resize-none border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 px-4 py-4 text-sm placeholder:text-muted-foreground/60 bg-muted/5"
                      />
                    </div>
                  )}
                  <div className="px-4 py-2 border-t text-xs text-muted-foreground bg-muted/10">
                    <div className="flex justify-between items-center">
                      <span>{getCurrentTranslatedText().length} {t('translation.characters')}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 错误提示 */}
            {error && error.message && (
              <Alert 
                variant="destructive" 
                className="mt-4 sm:mt-6 rounded-lg border-destructive/30 bg-destructive/5 hover:bg-destructive/10 transition-colors"
              >
                <AlertDescription className="text-sm font-medium">{error.message}</AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="history" className="p-6 flex flex-col flex-1">
            <div className="flex justify-between items-center mb-4 flex-col sm:flex-row gap-3">
              <h3 className="font-semibold text-base">{t('translation.recentTranslations')}</h3>
              {translationHistory.length > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={clearHistory}
                  className="w-full sm:w-auto h-8 px-3 text-xs hover:bg-primary/5 transition-colors"
                >
                  {t('translation.clearHistory')}
                </Button>
              )}
            </div>
            <ScrollArea className="flex-1 min-h-[350px] sm:min-h-[400px] border rounded-md">
              {translationHistory.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  {t('translation.noHistory')}
                </div>
              ) : (
                <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
                  {translationHistory.map((item) => (
                    <Card
                      key={item.id}
                      className="cursor-pointer hover:shadow-md hover:border-primary/30 transition-all duration-200 border rounded-lg overflow-hidden"
                      onClick={() => loadFromHistory(item)}
                    >
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-3 text-xs text-muted-foreground">
                          <span className="font-medium text-primary/80">{`${item.sourceLang.displayName} → ${item.targetLang.displayName}`}</span>
                          <span className="text-xs opacity-80">{new Date(item.timestamp).toLocaleString()}</span>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1.5">{t('translation.source')}:</p>
                            <p className="text-sm font-medium break-words leading-relaxed">{item.sourceText}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1.5">{t('translation.translation')}:</p>
                            <p className="text-sm break-words text-muted-foreground leading-relaxed">{item.translatedText}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default TranslationModal;