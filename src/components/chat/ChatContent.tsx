import { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ChatMessage from './ChatMessage';
import type { Conversation } from '@/types/chat';
import { getActiveModelId, getModelConfigs } from '@/utils/modelStorage';
import { useAuth } from '@/contexts/AuthContext';

interface ChatContentProps {
  conversation: Conversation | undefined;
  onUpdateTitle: (id: string, title: string) => void;
  onRetryMessage?: (messageId: string) => void;
  onBranchConversation?: (messageId: string) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onDeleteMessage?: (messageId: string) => void;
}

const ChatContent = ({
  conversation,
  onUpdateTitle,
  onRetryMessage,
  onBranchConversation,
  onEditMessage,
  onDeleteMessage,
}: ChatContentProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');

  const [currentModelName, setCurrentModelName] = useState<string>('');

  useEffect(() => {
    // 获取当前模型名称
    const loadModelName = async () => {
      if (!user?.id) {
        setCurrentModelName(t('chat.assistant'));
        return;
      }
      
      try {
        const activeModelId = await getActiveModelId(user.id);
        if (activeModelId) {
          const models = await getModelConfigs(user.id);
          const model = models.find(m => m.id === activeModelId);
          setCurrentModelName(model?.name || t('chat.assistant'));
        } else {
          setCurrentModelName(t('chat.assistant'));
        }
      } catch (error) {
        console.error('Failed to load model name:', error);
        setCurrentModelName(t('chat.assistant'));
      }
    };
    
    loadModelName();
    
    // 监听模型变更事件
    const handleModelChange = () => {
      loadModelName();
    };
    
    window.addEventListener('model-changed', handleModelChange);
    return () => {
      window.removeEventListener('model-changed', handleModelChange);
    };
  }, [t, user?.id]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [conversation?.messages]);



  // 先定义handleStartEdit函数
  const handleStartEdit = () => {
    if (conversation) {
      setEditedTitle(conversation.title);
      setIsEditingTitle(true);
    }
  };
  
  // 创建一个引用类型以便能够从外部访问组件方法
  const componentRef = useRef<{
    handleStartEdit: () => void;
  }>(null);
  
  // 将方法赋值给引用，以便外部可以调用
  useEffect(() => {
    componentRef.current = {
      handleStartEdit
    };
    if (typeof window !== 'undefined') {
      // 为window对象添加类型断言
      (window as any)['chatContentRef'] = componentRef;
    }
  }, [handleStartEdit]);

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
          <div className="text-xl font-semibold">{t('chat.startNewChat')}</div>
          <div className="text-muted-foreground">
            {t('chat.clickNewChatToStart')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 编辑标题的临时覆盖层 */}
      {isEditingTitle && conversation && (
        <div className="fixed top-0 left-0 right-0 p-4 bg-background border-b z-30 flex items-center justify-start">
          <Input
            value={editedTitle}
            onChange={(e) => setEditedTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveTitle();
              if (e.key === 'Escape') handleCancelEdit();
            }}
            className="max-w-md"
            autoFocus
            placeholder={t('chat.conversationTitlePlaceholder')}
          />
          <Button size="icon" variant="ghost" onClick={handleSaveTitle}>
            <Check className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={handleCancelEdit}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto custom-scrollbar smooth-scroll bg-background/80 backdrop-blur-sm"
      >
        {(!conversation.messages || conversation.messages.length === 0) ? (
          <div className="flex items-center justify-center min-h-full p-8">
            <div className="text-center space-y-4">
              <div className="text-5xl">👋</div>
              <div className="text-lg font-medium">{t('chat.hello', { modelName: currentModelName })}</div>
              <div className="text-muted-foreground max-w-md">
                {t('chat.welcomeMessage')}
              </div>
              <div className="text-sm text-muted-foreground mt-4 space-y-2">
                <p>{t('chat.configureModelHint')}</p>
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
                onDelete={onDeleteMessage}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatContent;