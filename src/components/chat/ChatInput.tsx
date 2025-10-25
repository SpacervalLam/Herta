import { useState, useRef, useEffect, DragEvent } from 'react';
import {
  Send,
  Square,
  Plus,
  Image as ImageIcon,
  X as XIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { settingsStorage } from '@/utils/settingsStorage';
import { toast } from 'sonner';
import { MessageContentItem } from '@/types/chat';

interface ChatInputProps {
  onSend: (content: string | MessageContentItem[]) => void;
  onStop: () => void;
  isLoading: boolean;
  disabled?: boolean;
}

const ChatInput = ({ onSend, onStop, isLoading, disabled }: ChatInputProps) => {
  const { t } = useTranslation();
  const [textInput, setTextInput] = useState('');
  const [contentItems, setContentItems] = useState<MessageContentItem[]>([]);
  const [sendKey, setSendKey] = useState<'enter' | 'ctrl-enter'>('ctrl-enter');
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 加载发送快捷键设置
  useEffect(() => {
    const loadSettings = () => {
      const settings = settingsStorage.getSettings();
      setSendKey(settings.sendMessageKey);
    };
    loadSettings();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'ai-chat-user-settings') loadSettings();
    };
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('settings-changed', loadSettings);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('settings-changed', loadSettings);
    };
  }, []);

  // 自动调整输入框高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [textInput]);

  /** 处理图片添加逻辑（上传或拖拽共用） */
  const addImages = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newItems: MessageContentItem[] = [];
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) {
        toast.error(t('chat.invalidImageFormat'));
        return;
      }
      if (file.size > 15 * 1024 * 1024) {
        toast.error(t('chat.imageTooLarge'));
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const imageUrl = event.target?.result as string;
        newItems.push({ type: 'image_url', image_url: { url: imageUrl } });
        setContentItems((prev) => [...prev, ...newItems]);
      };
      reader.readAsDataURL(file);
    });
  };

  // 上传图片
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    addImages(e.target.files);
    e.target.value = ''; // 允许重复选择
  };

  // 拖拽上传逻辑
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (disabled || isLoading) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || isLoading) return;
    const files = e.dataTransfer.files;
    addImages(files);
  };

  const removeImage = (index: number) => {
    setContentItems(contentItems.filter((_, i) => i !== index));
  };

  const handleSend = () => {
    if (isLoading) return;
    const newContentItems: MessageContentItem[] = [...contentItems];
    if (textInput.trim()) {
      newContentItems.push({ type: 'text', text: textInput.trim() });
    }
    if (newContentItems.length === 0) {
      toast.warning(t('chat.emptyInput'));
      return;
    }
    onSend(
      newContentItems.length === 1 && newContentItems[0].type === 'text'
        ? newContentItems[0].text!
        : newContentItems
    );
    setTextInput('');
    setContentItems([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

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

  return (
    <div className="p-4">
      <div className="max-w-4xl mx-auto">
        {/* 图片预览 */}
        {contentItems.some((item) => item.type === 'image_url') && (
          <div className="flex flex-wrap gap-2 mb-3">
            {contentItems
              .filter((item) => item.type === 'image_url')
              .map((item, index) => (
                <div
                  key={index}
                  className="relative h-20 w-20 rounded-md overflow-hidden border"
                >
                  <img
                    src={item.image_url?.url}
                    alt="Uploaded"
                    className="h-full w-full object-cover"
                  />
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute top-0 right-0 h-5 w-5 p-0 rounded-none"
                    onClick={() => removeImage(index)}
                  >
                    <XIcon className="h-3 w-3" />
                  </Button>
                </div>
              ))}
          </div>
        )}

        {/* 输入框（支持拖拽上传） */}
        <div
          className={cn(
            'relative flex items-center gap-2 bg-muted/30 rounded-[28px] border border-border px-3 py-2 transition-colors',
            'focus-within:border-primary',
            isDragging && 'border-primary bg-primary/10'
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* ChatGPT风格加号按钮 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="shrink-0 h-8 w-8 rounded-full"
                disabled={disabled || isLoading}
              >
                <Plus className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-36">
              <DropdownMenuItem
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || isLoading}
                className="cursor-pointer"
              >
                <ImageIcon className="h-4 w-4 mr-2" />
                {t('chat.uploadImage')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
            multiple
          />

          <Textarea
            ref={textareaRef}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isDragging ? t('chat.dropToUpload') : t('chat.inputPlaceholder')
            }
            disabled={disabled || isLoading}
            className={cn(
              'flex-1 min-h-[40px] max-h-[200px] resize-none border-0 bg-transparent',
              'focus-visible:ring-0 focus-visible:ring-offset-0 px-0 py-2',
              'placeholder:text-muted-foreground'
            )}
            rows={1}
          />

          {/* 发送 / 停止按钮 */}
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
              disabled={
                (!textInput.trim() && contentItems.length === 0) || disabled
              }
              size="icon"
              className="shrink-0 h-9 w-9 rounded-full bg-primary hover:bg-primary/90"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* 发送提示 */}
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
