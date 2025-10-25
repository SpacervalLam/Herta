import { useState, useRef, useEffect } from 'react';
import { Send, Square, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { settingsStorage } from '@/utils/settingsStorage';

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop: () => void;
  isLoading: boolean;
  disabled?: boolean;
}

const ChatInput = ({ onSend, onStop, isLoading, disabled }: ChatInputProps) => {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [sendKey, setSendKey] = useState<'enter' | 'ctrl-enter'>('ctrl-enter');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // 加载用户设置
    const loadSettings = () => {
      const settings = settingsStorage.getSettings();
      setSendKey(settings.sendMessageKey);
    };

    loadSettings();

    // 监听storage事件，当设置改变时更新
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'ai-chat-user-settings') {
        loadSettings();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    // 监听自定义事件（用于同一标签页内的更新）
    const handleSettingsChange = () => {
      loadSettings();
    };
    
    window.addEventListener('settings-changed', handleSettingsChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('settings-changed', handleSettingsChange);
    };
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const handleSend = () => {
    if (input.trim() && !isLoading) {
      onSend(input);
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (sendKey === 'ctrl-enter') {
      // Ctrl+Enter 发送，Enter 换行
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSend();
      }
    } else {
      // Enter 发送，Shift+Enter 换行
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    }
  };

  return (
    <div className="p-4">
      <div className="max-w-4xl mx-auto">
        {/* 圆角矩形输入框容器 */}
        <div className="relative flex items-center gap-2 bg-muted/30 rounded-[28px] border border-border px-4 py-2 focus-within:border-primary transition-colors">
          {/* 添加按钮 */}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="shrink-0 h-8 w-8 rounded-full"
            disabled={disabled || isLoading}
          >
            <Plus className="h-5 w-5" />
          </Button>

          {/* 输入框 */}
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.inputPlaceholder')}
            disabled={disabled || isLoading}
            className={cn(
              'flex-1 min-h-[40px] max-h-[200px] resize-none border-0 bg-transparent',
              'focus-visible:ring-0 focus-visible:ring-offset-0 px-0 py-2',
              'placeholder:text-muted-foreground'
            )}
            rows={1}
          />

          {/* 发送按钮 */}
          {isLoading ? (
            <Button
              type="button"
              onClick={onStop}
              size="icon"
              variant="destructive"
              className="shrink-0 h-9 w-9 rounded-full"
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || disabled}
              size="icon"
              className="shrink-0 h-9 w-9 rounded-full bg-primary hover:bg-primary/90"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* 提示文字 */}
        <div className="mt-2 text-xs text-muted-foreground text-center">
          {sendKey === 'ctrl-enter' 
            ? t('chat.sendWithCtrlEnter') 
            : t('chat.sendWithEnter')}
        </div>
      </div>
    </div>
  );
};

export default ChatInput;