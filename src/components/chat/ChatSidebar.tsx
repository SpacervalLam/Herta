import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, MessageSquare, Trash2, Settings, PanelLeftClose, PanelLeft, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Conversation } from '@/types/chat';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ChatSidebarProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onOpenSettings: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const ChatSidebar = ({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onOpenSettings,
  collapsed = false,
  onToggleCollapse
}: ChatSidebarProps) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    if (days === 1) {
      return '昨天';
    }
    if (days < 7) {
      return `${days}天前`;
    }
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  };

  // 过滤对话列表：只显示已保存的对话
  const filteredConversations = conversations.filter(conv =>
    (conv.isSaved !== false) &&
    conv.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div
      className={cn(
        "flex flex-col h-full border-r bg-muted/30 transition-all duration-300",
        collapsed ? "w-[60px]" : "w-full"
      )}
    >
      {/* 收缩状态 */}
      {collapsed ? (
        <TooltipProvider>
          <div className="flex flex-col items-center gap-2 p-2">
            {/* 展开按钮 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={onToggleCollapse}
                  size="icon"
                  variant="ghost"
                  className="w-11 h-11"
                >
                  <PanelLeft className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{t('sidebar.expand')}</p>
              </TooltipContent>
            </Tooltip>

            {/* 新建对话按钮 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={onNewConversation}
                  size="icon"
                  variant="default"
                  className="w-11 h-11"
                >
                  <Plus className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{t('chat.newChat')}</p>
              </TooltipContent>
            </Tooltip>

            {/* 设置按钮 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={onOpenSettings}
                  size="icon"
                  variant="ghost"
                  className="w-11 h-11"
                >
                  <Settings className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{t('common.settings')}</p>
              </TooltipContent>
            </Tooltip>

          </div>
        </TooltipProvider>
      ) : (
        /* 展开状态 */
        <>
          <div className="p-4 border-b space-y-2 shrink-0">
            {/* 收缩按钮 */}
            <div className="flex justify-between items-center mb-2">
              <h2 className="font-semibold text-lg">{t('sidebar.conversations')}</h2>
              <Button
                onClick={onToggleCollapse}
                size="icon"
                variant="ghost"
                className="h-8 w-8"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </div>

            <Button
              onClick={onNewConversation}
              className="w-full justify-start gap-2"
              variant="default"
            >
              <Plus className="h-4 w-4" />
              {t('chat.newChat')}
            </Button>

            <Button
              onClick={onOpenSettings}
              className="w-full justify-start gap-2"
              variant="outline"
            >
              <Settings className="h-4 w-4" />
              {t('common.settings')}
            </Button>
          </div>

          {/* 搜索框 */}
          <div className="px-4 pt-3 pb-2 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder={t('sidebar.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* 对话列表 */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
            {filteredConversations.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-8">
                {searchQuery ? t('chat.noConversations') : t('chat.noConversations')}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredConversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    className={cn(
                      'group relative flex items-center gap-2 rounded-lg p-3 cursor-pointer transition-colors',
                      'hover:bg-accent',
                      currentConversationId === conversation.id && 'bg-accent'
                    )}
                    onClick={() => onSelectConversation(conversation.id)}
                  >
                    <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {conversation.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatTime(conversation.updatedAt)}
                      </div>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('chat.deleteConversation')}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('chat.deleteConfirm')}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => onDeleteConversation(conversation.id)}
                          >
                            {t('common.delete')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ChatSidebar;
