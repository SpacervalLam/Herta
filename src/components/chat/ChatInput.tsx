import { useState, useRef, useEffect } from 'react';
import { Send, Square, Plus, ImageIcon, FileTextIcon, MicIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { settingsStorage } from '@/utils/settingsStorage';
import { MediaAttachment } from '@/types/chat';
import { getActiveModel } from '@/utils/modelStorage';

interface ChatInputProps {
  onSend: (message: string, attachments?: MediaAttachment[]) => void;
  onStop: () => void;
  isLoading: boolean;
  disabled?: boolean;
}

const ChatInput = ({ onSend, onStop, isLoading, disabled }: ChatInputProps) => {
  const [input, setInput] = useState('');
  const [sendKey, setSendKey] = useState<'enter' | 'ctrl-enter'>('ctrl-enter');
  const [attachments, setAttachments] = useState<MediaAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 检查当前模型是否支持多模态
  const [supportsMultimodal, setSupportsMultimodal] = useState(false);
  
  useEffect(() => {
    const checkModelSupport = () => {
      const activeModel = getActiveModel();
      setSupportsMultimodal(!!activeModel?.supportsMultimodal);
    };
    
    checkModelSupport();
    
    // 监听设置变化
    const handleSettingsChange = () => {
      checkModelSupport();
    };
    
    window.addEventListener('settings-changed', handleSettingsChange);
    return () => {
      window.removeEventListener('settings-changed', handleSettingsChange);
    };
  }, []);

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
    if ((input.trim() || attachments.length) && !isLoading) {
      onSend(input, attachments);
      setInput('');
      setAttachments([]);
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      // 限制文件大小为10MB
      if (file.size > 10 * 1024 * 1024) {
        alert(`文件 ${file.name} 过大，请选择10MB以下的文件`);
        return;
      }

      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          setAttachments(prev => [...prev, {
            type: 'image',
            url: event.target?.result as string,
            fileName: file.name,
            fileSize: file.size
          }]);
        };
        reader.readAsDataURL(file);
      } else if (file.type.startsWith('audio/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          setAttachments(prev => [...prev, {
            type: 'audio',
            url: event.target?.result as string,
            fileName: file.name,
            fileSize: file.size
          }]);
        };
        reader.readAsDataURL(file);
      } else if (file.type.startsWith('video/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          setAttachments(prev => [...prev, {
            type: 'video',
            url: event.target?.result as string,
            fileName: file.name,
            fileSize: file.size
          }]);
        };
        reader.readAsDataURL(file);
      } else {
        alert(`不支持的文件类型: ${file.type}`);
      }
    });
    
    // 重置input值，允许重复选择同一文件
    e.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const triggerFileUpload = (accept: string) => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept;
      fileInputRef.current.click();
    }
  };

  return (
    <div className="p-4">
      <div className="max-w-4xl mx-auto">
        {/* 已上传的附件预览 */}
        {attachments.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {attachments.map((att, index) => (
              <div key={index} className="flex items-center gap-1 bg-muted/50 rounded-full px-3 py-1 text-sm">
                {att.type === 'image' && <ImageIcon className="h-4 w-4" />}
                {att.type === 'audio' && <MicIcon className="h-4 w-4" />}
                {att.type === 'video' && <FileTextIcon className="h-4 w-4" />}
                <span className="truncate max-w-[150px]">{att.fileName}</span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5 p-0 ml-1"
                  onClick={() => removeAttachment(index)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* 圆角矩形输入框容器 */}
        <div className="relative flex items-center gap-2 bg-muted/30 rounded-[28px] border border-border px-4 py-2 focus-within:border-primary transition-colors">
          {/* 隐藏的文件输入 */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileUpload}
            multiple
          />

          {/* 添加按钮 */}
          {supportsMultimodal && !isLoading && (
            <div className="relative group">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="shrink-0 h-8 w-8 rounded-full"
                disabled={disabled || isLoading}
              >
                <Plus className="h-5 w-5" />
              </Button>
              
              {/* 上传选项下拉菜单 */}
              <div className="absolute bottom-full left-0 mb-2 w-40 bg-background border rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                <div className="p-1">
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full justify-start text-sm h-9"
                    onClick={() => triggerFileUpload('image/*')}
                  >
                    <ImageIcon className="h-4 w-4 mr-2" />
                    图片
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full justify-start text-sm h-9"
                    onClick={() => triggerFileUpload('audio/*')}
                  >
                    <MicIcon className="h-4 w-4 mr-2" />
                    音频
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full justify-start text-sm h-9"
                    onClick={() => triggerFileUpload('video/*')}
                  >
                    <FileTextIcon className="h-4 w-4 mr-2" />
                    视频
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* 输入框 */}
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={supportsMultimodal ? "输入问题或添加图片..." : "输入问题..."}
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
              disabled={!(input.trim() || attachments.length) || disabled}
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
            ? '按 Ctrl+Enter 发送消息' 
            : '按 Enter 发送消息，Shift+Enter 换行'}
          {supportsMultimodal && ' | 可添加图片、音频或视频'}
        </div>
      </div>
    </div>
  );
};

export default ChatInput;