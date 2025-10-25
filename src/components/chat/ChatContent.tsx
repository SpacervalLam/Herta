import { useEffect, useRef, useState } from 'react';
import { Edit2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ChatMessage from './ChatMessage';
import ModelSelector from './ModelSelector';
import ModelConfigDialog from './ModelConfigDialog';
import LanguageSwitcher from '@/components/common/LanguageSwitcher';
import type { Conversation } from '@/types/chat';
import { getActiveModelId, getModelConfigs } from '@/utils/modelStorage';

interface ChatContentProps {
  conversation: Conversation | undefined;
  onUpdateTitle: (id: string, title: string) => void;
  onRetryMessage?: (messageId: string) => void;
  onBranchConversation?: (messageId: string) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
}

const ChatContent = ({
  conversation,
  onUpdateTitle,
  onRetryMessage,
  onBranchConversation,
  onEditMessage,
}: ChatContentProps) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [modelKey, setModelKey] = useState(0);
  const [currentModelName, setCurrentModelName] = useState<string>('');

  useEffect(() => {
    // 获取当前模型名称
    const activeModelId = getActiveModelId();
    if (activeModelId) {
      const models = getModelConfigs();
      const model = models.find(m => m.id === activeModelId);
      setCurrentModelName(model?.name || 'AI助手');
    } else {
      setCurrentModelName('AI助手');
    }
  }, [modelKey]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [conversation?.messages]);

  const handleModelChange = () => {
    setModelKey(prev => prev + 1);
  };

  const handleStartEdit = () => {
    if (conversation) {
      setEditedTitle(conversation.title);
      setIsEditingTitle(true);
    }
  };

  const handleSaveTitle = () => {
    if (conversation && editedTitle.trim()) {
      onUpdateTitle(conversation.id, editedTitle.trim());
      setIsEditingTitle(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingTitle(false);
    setEditedTitle('');
  };

  if (!conversation) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <div className="text-6xl">💬</div>
          <div className="text-xl font-semibold">开始新对话</div>
          <div className="text-muted-foreground">
            点击左侧"新建对话"按钮开始与AI助手交流
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b p-4 flex items-center justify-between bg-background shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isEditingTitle ? (
            <>
              <Input
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveTitle();
                  if (e.key === 'Escape') handleCancelEdit();
                }}
                className="max-w-md"
                autoFocus
              />
              <Button size="icon" variant="ghost" onClick={handleSaveTitle}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={handleCancelEdit}>
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold truncate">{conversation.title}</h2>
              <Button size="icon" variant="ghost" onClick={handleStartEdit}>
                <Edit2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ModelSelector key={modelKey} onModelChange={handleModelChange} />
          <ModelConfigDialog onModelChange={handleModelChange} />
          <LanguageSwitcher />
        </div>
      </div>
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto custom-scrollbar smooth-scroll"
      >
        {conversation.messages.length === 0 ? (
          <div className="flex items-center justify-center min-h-full p-8">
            <div className="text-center space-y-4">
              <div className="text-5xl">👋</div>
              <div className="text-lg font-medium">你好！我是{currentModelName}</div>
              <div className="text-muted-foreground max-w-md">
                我可以帮你解答问题、提供建议、进行创作等。请在下方输入框中输入你的问题或需求。
              </div>
              <div className="text-sm text-muted-foreground mt-4 space-y-2">
                <p>⚙️ 点击右上角设置图标配置AI模型</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="divide-y">
            {conversation.messages.map((message) => (
              <ChatMessage 
                key={message.id} 
                message={message} 
                modelName={currentModelName}
                onRetry={onRetryMessage}
                onBranch={onBranchConversation}
                onEdit={onEditMessage}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatContent;
