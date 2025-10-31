import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Square, Plus, ImageIcon, FileTextIcon, MicIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { getSettings } from '@/utils/settingsStorage';
import { MediaAttachment } from '@/types/chat';
import { getActiveModel } from '@/utils/modelStorage';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';

interface ChatInputProps {
  onSend: (message: string, attachments?: MediaAttachment[]) => void;
  onStop: () => void;
  isLoading: boolean;
  disabled?: boolean;
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ChatInput = ({ onSend, onStop, isLoading, disabled, textareaRef: externalTextareaRef }: ChatInputProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [input, setInput] = useState('');
  const [sendKey, setSendKey] = useState<'enter' | 'ctrl-enter'>('ctrl-enter');
  const [attachments, setAttachments] = useState<MediaAttachment[]>([]);
  const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
  // 使用外部传入的ref或内部ref
  const textareaRef = externalTextareaRef || internalTextareaRef;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 多模态支持
  const [supportsMultimodal, setSupportsMultimodal] = useState(false);

  // + 菜单开关
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // 拖拽状态
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  useEffect(() => {
    const checkModelSupport = async () => {
      try {
        // 只有当用户已登录时才获取活动模型
        let activeModel = null;
        if (user) {
          activeModel = await getActiveModel(user.id);
        }
        setSupportsMultimodal(!!activeModel?.supportsMultimodal);
      } catch (error) {
        console.error('Error checking model support:', error);
        setSupportsMultimodal(false);
      }
    };

    checkModelSupport();
    
    // 使用防抖处理设置变化事件，避免频繁请求
    let debounceTimer: number;
    const debouncedCheck = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(checkModelSupport, 100);
    };
    
    window.addEventListener('settings-changed', debouncedCheck);
    window.addEventListener('storage', debouncedCheck);

    return () => {
      clearTimeout(debounceTimer);
      window.removeEventListener('settings-changed', debouncedCheck);
      window.removeEventListener('storage', debouncedCheck);
    };
  }, [user]);


  useEffect(() => {
    // 加载用户设置
    const loadSettings = () => {
      const settings = getSettings();
      setSendKey(settings.sendMessageKey || 'ctrl-enter');
    };

    loadSettings();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'ai-chat-user-settings') {
        loadSettings();
      }
    };

    const handleSettingsChange = () => {
      loadSettings();
    };

    window.addEventListener('storage', handleStorageChange);
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
  }, [input, attachments]);

  // 点击文档外部关闭菜单
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [menuOpen]);

  const handleSend = useCallback(() => {
    // 只有在非加载状态且有输入内容或附件时才允许发送
    if ((input.trim() || attachments.length) && !isLoading) {
      onSend(input, attachments);
      setInput('');
      setAttachments([]);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        // 发送消息后保持焦点在输入框
        textareaRef.current.focus();
      }
    }
  }, [input, attachments, isLoading, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (sendKey === 'ctrl-enter') {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSend();
      }
    } else {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    }
  };

  const addAttachmentsFromFiles = (files: FileList | File[]) => {
    Array.from(files).forEach((file) => {
      if (file.size > MAX_FILE_SIZE) {
        alert(t('chat.fileTooLarge', { name: file.name }));
        return;
      }

      if (file.type.startsWith('image/') || file.type.startsWith('audio/') || file.type.startsWith('video/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const base = event.target?.result as string;
          const type = file.type.startsWith('image/')
            ? 'image'
            : file.type.startsWith('audio/')
              ? 'audio'
              : 'video';
          setAttachments((prev) => [
            ...prev,
            {
              type,
              url: base,
              fileName: file.name,
              fileSize: file.size,
            } as MediaAttachment,
          ]);
        };
        reader.readAsDataURL(file);
      } else {
        alert(t('chat.unsupportedFileType', { type: file.type }));
      }
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    addAttachmentsFromFiles(files);
    e.target.value = '';
    setMenuOpen(false);
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const triggerFileUpload = (accept: string) => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept;
      fileInputRef.current.click();
      setMenuOpen(false);
    }
  };

  // --- 拖拽处理 ---
  const onDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    setIsDragging(true);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      addAttachmentsFromFiles(files);
    }
  };

  // --- 剪贴板粘贴图片支持 ---
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!supportsMultimodal) return; // 当前模型不支持多模态则忽略
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        addAttachmentsFromFiles(imageFiles);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [supportsMultimodal]);


  return (
    <div className="p-4">
      <div className="max-w-4xl mx-auto">
        {/* 附件预览 */}
        {attachments.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {attachments.map((att, index) => (
              <div key={index} className="relative group">
                {att.type === 'image' && (
                  <div className="relative">
                    <img
                      src={att.url}
                      alt={att.fileName || t('chat.image')}
                      className="w-16 h-16 object-cover rounded-lg border border-border"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      className="absolute -top-2 -right-2 h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removeAttachment(index)}
                      aria-label={t('common.delete')}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                {att.type === 'audio' && (
                  <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                    <MicIcon className="h-4 w-4" />
                    <audio src={att.url} controls className="max-w-[120px]" />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-5 w-5 p-0"
                      onClick={() => removeAttachment(index)}
                      aria-label={t('common.delete')}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                {att.type === 'video' && (
                  <div className="relative">
                    <video
                      src={att.url}
                      className="w-16 h-16 object-cover rounded-lg border border-border"
                      muted
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      className="absolute -top-2 -right-2 h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removeAttachment(index)}
                      aria-label={t('common.delete')}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 隐藏文件输入 */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileUpload}
          multiple
        />

        {/* 输入区 */}
        <div
          className={cn(
            'relative flex items-center gap-2 bg-muted/30 rounded-[28px] border border-border px-4 py-2 transition-colors',
            isDragging ? 'border-primary bg-primary/10' : 'focus-within:border-primary'
          )}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          aria-label={t('chat.dropToUpload')}
        >
          {/* + 按钮 */}
          {supportsMultimodal && !isLoading && (
            <div ref={menuRef} className="relative">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="shrink-0 h-8 w-8 rounded-full"
                disabled={disabled || isLoading}
                onClick={() => setMenuOpen((open) => !open)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                title={t('common.add')}
              >
                <Plus className="h-5 w-5" />
              </Button>

              {/* 菜单 */}
              {menuOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-44 bg-background border rounded-md shadow-lg z-10">
                  <div className="p-1">
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-sm h-9"
                      onClick={() => triggerFileUpload('image/*')}
                    >
                      <ImageIcon className="h-4 w-4 mr-2" />
                      {t('chat.image')}
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-sm h-9"
                      onClick={() => triggerFileUpload('audio/*')}
                    >
                      <MicIcon className="h-4 w-4 mr-2" />
                      {t('chat.audio')}
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-sm h-9"
                      onClick={() => triggerFileUpload('video/*')}
                    >
                      <FileTextIcon className="h-4 w-4 mr-2" />
                      {t('chat.video')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 输入框 */}
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              supportsMultimodal
                ? t('chat.inputPlaceholderMultimodal')
                : t('chat.inputPlaceholder')
            }
            disabled={disabled}
            className={cn(
              'flex-1 min-h-[40px] max-h-[200px] resize-none border-0 bg-transparent',
              'focus-visible:ring-0 focus-visible:ring-offset-0 px-0 py-2',
              'placeholder:text-muted-foreground'
            )}
            rows={1}
          />

          {/* 发送/停止 */}
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

          {/* 拖拽提示 */}
          {isDragging && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="px-4 py-2 rounded-md border-2 border-dashed border-primary bg-white/60 text-sm">
                {t('chat.dropToUpload')}
              </div>
            </div>
          )}
        </div>

        {/* 提示文字 */}
        <div className="mt-2 text-xs text-muted-foreground text-center">
          {sendKey === 'ctrl-enter'
            ? t('chat.sendWithCtrlEnter')
            : t('chat.sendWithEnter')}
          {supportsMultimodal && ` | ${t('chat.supportsMultimodalHint')}`}
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
