import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, MessageSquare, Trash2, Settings, PanelLeftClose, PanelLeft, Search, Globe, ChevronDown, ChevronUp } from 'lucide-react';
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
  onOpenTranslation?: () => void;
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
  onOpenTranslation,
  collapsed = false,
  onToggleCollapse
}: ChatSidebarProps) => {
  const [featuresExpanded, setFeaturesExpanded] = useState(false);
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');



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
      {collapsed ? (
        <TooltipProvider>
          <div className="flex flex-col items-center gap-2 p-2">
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

            {onOpenTranslation && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={onOpenTranslation}
                    size="icon"
                    variant="ghost"
                    className="w-11 h-11"
                  >
                    <Globe className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{t('translation.title')}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          <div className="absolute bottom-0 left-0 p-2">
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
        <>
          <div className="p-4 border-b space-y-2 shrink-0">
            <div className="flex justify-between items-center mb-2">
              <h2 className="font-semibold text-lg">Herta</h2>
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
          </div>

          <div className="px-4 pt-1 pb-2 border-b">
            <div
              onClick={() => setFeaturesExpanded(!featuresExpanded)}
              className="flex items-center justify-between w-full py-1 cursor-pointer hover:text-primary transition-colors"
            >
              <div className="text-xs text-muted-foreground">
                <span>{t('sidebar.commonFeatures') || '常用功能'}</span>
              </div>
              {featuresExpanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </div>
            {featuresExpanded && (
              <div className="mt-2 space-y-2">
                {onOpenTranslation && (
                  <div
                    onClick={onOpenTranslation}
                    className="flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-accent transition-colors"
                  >
                    <Globe className="h-4 w-4" />
                    <span>{t('translation.title')}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="px-4 py-2 border-b">
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

          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 pb-20">
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
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <div className="truncate">
                      {conversation.title}
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {t('chat.deleteConversation')}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('chat.deleteConversationDescription')}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>
                            {t('common.cancel')}
                          </AlertDialogCancel>
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
          
          <div className="absolute bottom-0 left-0 p-2">
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
        </>
      )}
    </div>
  );
};

export default ChatSidebar;
