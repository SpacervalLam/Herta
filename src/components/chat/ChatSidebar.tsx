import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, MessageSquare, Trash2, Settings, PanelLeftClose, PanelLeft, Search, Globe, ChevronDown, ChevronUp, Check } from 'lucide-react';
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
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ChatSidebarProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onDeleteConversations?: (ids: string[]) => void;
  onOpenSettings: () => void;
  onOpenTranslation?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  isSelectionMode?: boolean;
  setIsSelectionMode?: (mode: boolean) => void;
  setIsClickOutsideDetectionEnabled?: (enabled: boolean) => void;
  isLoadingConversations?: boolean;
}

const ChatSidebar = ({
    conversations,
    currentConversationId,
    onSelectConversation,
    onNewConversation,
    onDeleteConversation,
    onDeleteConversations,
    onOpenSettings,
    onOpenTranslation,
    collapsed = false,
    onToggleCollapse,
    isSelectionMode: propIsSelectionMode,
    setIsSelectionMode: propSetIsSelectionMode,
    setIsClickOutsideDetectionEnabled,
    isLoadingConversations = false
  }: ChatSidebarProps) => {
    const [featuresExpanded, setFeaturesExpanded] = useState(false);
    const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  // 使用从父组件传入的状态和设置函数，如果没有则使用本地状态
  const [localIsSelectionMode, setLocalIsSelectionMode] = useState(false);
  const isSelectionMode = propIsSelectionMode ?? localIsSelectionMode;
  const setIsSelectionMode = propSetIsSelectionMode ?? setLocalIsSelectionMode;
  
  const [selectedConversationIds, setSelectedConversationIds] = useState<string[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<number | null>(null);
  const [isLongPressing, setIsLongPressing] = useState(false);
  const [isEnteredByLongPress, setIsEnteredByLongPress] = useState(false);
  const [lastSelectedConversationId, setLastSelectedConversationId] = useState<string | null>(null);
  // 单个删除确认相关状态
  const [singleDeleteId, setSingleDeleteId] = useState<string>('');
  const [showSingleDeleteConfirm, setShowSingleDeleteConfirm] = useState(false);
  
  // 当从父组件传入的多选模式状态变化时，清空选中的对话
  useEffect(() => {
    if (!isSelectionMode) {
      setSelectedConversationIds([]);
      setIsEnteredByLongPress(false);
      setLastSelectedConversationId(null);
    }
  }, [isSelectionMode]);
  
  // 处理长按结束
  const handleLongPressEnd = () => {
    // 清除长按定时器
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    setIsLongPressing(false);
  };
  
  // 处理长按开始
  const handleLongPressStart = (conversationId: string) => {
    if (!isSelectionMode && onDeleteConversations) {
      setIsLongPressing(true);
      const timer = setTimeout(() => {
        // 进入多选模式并选中当前对话
        setIsSelectionMode(true);
        setSelectedConversationIds([conversationId]);
        setIsEnteredByLongPress(true);
        setLastSelectedConversationId(conversationId);
      }, 500); // 长按时间设置为0.5秒
      setLongPressTimer(timer);
    }
  };

  // 键盘事件监听，处理删除键
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 当处于多选模式并且有选中的对话，按下删除键时显示确认弹窗
      if (isSelectionMode && selectedConversationIds.length > 0 && 
          (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault();
        setShowDeleteConfirm(true);
      }
    };

    // 添加键盘事件监听
    document.addEventListener('keydown', handleKeyDown);
    
    // 清理函数
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSelectionMode, selectedConversationIds]);

  const filteredConversations = conversations.filter(conv =>
    conv.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div
        className={cn(
         "flex flex-col h-full border-r bg-background/90 backdrop-blur-sm transition-all duration-300",
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
            {/* 会话列表加载指示器 */}
            {isLoadingConversations && (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin border-2 border-t-transparent rounded-full border-muted-foreground"></div>
                <div className="text-sm text-muted-foreground">加载中...</div>
              </div>
            )}
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

          <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
            {/* 移除批量操作工具栏，使用其他方式处理多选状态 */}
            
            {filteredConversations.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-8">
                {searchQuery ? t('chat.noConversations') : t('chat.noConversations')}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredConversations.map((conversation) => {
                  const isSelected = selectedConversationIds.includes(conversation.id);
                  
                  return (
                    <div
                      key={conversation.id}
                      data-conversation-item
                      className={cn(
                        'group relative flex items-center gap-2 rounded-lg p-3 cursor-pointer transition-colors',
                        'hover:bg-accent',
                        currentConversationId === conversation.id && !isSelectionMode && 'bg-accent',
                        isSelected && 'bg-accent ring-1 ring-primary',
                        isLongPressing && 'bg-accent/70'
                      )}
                      onClick={(e) => {
                        // 防止长按后触发点击事件
                        if (isLongPressing) {
                          setIsLongPressing(false);
                          return;
                        }
                        
                        // 如果是通过长按进入的多选模式，第一次点击时不触发选中状态切换
                        if (isSelectionMode && isEnteredByLongPress) {
                          e.stopPropagation();
                          setIsEnteredByLongPress(false);
                          return;
                        }
                        
                        if (isSelectionMode) {
                          e.stopPropagation();
                          
                          // 处理shift+点击选中连续对话
                          if (e.shiftKey && lastSelectedConversationId && selectedConversationIds.length > 0) {
                            // 获取当前对话和上一次选中对话在列表中的索引
                            const currentIndex = filteredConversations.findIndex(conv => conv.id === conversation.id);
                            const lastIndex = filteredConversations.findIndex(conv => conv.id === lastSelectedConversationId);
                            
                            // 确保两个索引都有效
                            if (currentIndex !== -1 && lastIndex !== -1) {
                              // 确定起始和结束索引
                              const startIndex = Math.min(currentIndex, lastIndex);
                              const endIndex = Math.max(currentIndex, lastIndex);
                              
                              // 获取起始到结束之间的所有对话ID
                              const conversationIdsToSelect = [];
                              
                              // 先保留已选中的对话
                              const alreadySelected = new Set(selectedConversationIds);
                              
                              // 添加新选中的连续对话
                              for (let i = startIndex; i <= endIndex; i++) {
                                const convId = filteredConversations[i].id;
                                conversationIdsToSelect.push(convId);
                                alreadySelected.add(convId);
                              }
                              
                              // 如果当前对话已被选中，则取消选中连续范围
                              if (isSelected) {
                                // 从已选中的集合中移除连续范围内的对话
                                for (let i = startIndex; i <= endIndex; i++) {
                                  alreadySelected.delete(filteredConversations[i].id);
                                }
                                setSelectedConversationIds([...alreadySelected]);
                              } else {
                                // 选中连续范围内的所有对话
                                setSelectedConversationIds([...alreadySelected]);
                              }
                            }
                          } else {
                            // 普通点击，切换单个对话的选中状态
                            setSelectedConversationIds(prev => {
                              const newSelected = isSelected
                                ? prev.filter(id => id !== conversation.id)
                                : [...prev, conversation.id];
                              return newSelected;
                            });
                          }
                          
                          // 更新上一次选中的对话ID
                          setLastSelectedConversationId(conversation.id);
                        } else {
                          onSelectConversation(conversation.id);
                        }
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (!isSelectionMode && onDeleteConversations) {
                          setIsSelectionMode(true);
                          setSelectedConversationIds([conversation.id]);
                          setIsEnteredByLongPress(true);
                          setLastSelectedConversationId(conversation.id);
                        }
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleLongPressStart(conversation.id);
                      }}
                      onMouseUp={() => handleLongPressEnd()}
                      onMouseLeave={() => handleLongPressEnd()}
                      onTouchStart={(e) => {
                        e.preventDefault();
                        handleLongPressStart(conversation.id);
                      }}
                      onTouchEnd={() => handleLongPressEnd()}
                      data-conversation-id={conversation.id}
                    >
                      {isSelectionMode ? (
                        <div className={`h-4 w-4 rounded border flex items-center justify-center ${isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>
                          {isSelected && <Check className="h-3 w-3" />}
                        </div>
                      ) : (
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div className="truncate">
                        {conversation.title}
                      </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 ml-auto"
                          onClick={(e) => {
                              e.stopPropagation();
                              if (isSelectionMode && onDeleteConversations && selectedConversationIds.length > 0) {
                                // 在多选模式下，删除所有选中的对话
                                // 禁用外部点击检测
                                if (setIsClickOutsideDetectionEnabled) {
                                  setIsClickOutsideDetectionEnabled(false);
                                }
                                setShowDeleteConfirm(true);
                              } else {
                                // 非多选模式下，显示单个删除确认弹窗
                                // 使用统一的AlertDialog组件而不是window.confirm()
                                setSingleDeleteId(conversation.id);
                                setShowSingleDeleteConfirm(true);
                              }
                            }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
          <div className="border-t p-2">
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
    
      {/* 单个对话删除确认弹窗 */}
      <AlertDialog open={showSingleDeleteConfirm} onOpenChange={(open) => {
        setShowSingleDeleteConfirm(open);
        // 当弹窗关闭时，重新启用外部点击检测
        if (!open && setIsClickOutsideDetectionEnabled) {
          setIsClickOutsideDetectionEnabled(true);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('chat.deleteConversation') || 'Delete conversation?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('chat.deleteConversationDescription') || 'This action cannot be undone. The conversation will be permanently deleted.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={(e) => {
                // 阻止事件冒泡，防止被判定为外部点击
                e.stopPropagation();
                setShowSingleDeleteConfirm(false);
              }}>
                {t('common.cancel')}
              </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // 阻止事件冒泡，防止被判定为外部点击
                e.stopPropagation();
                if (singleDeleteId) {
                  onDeleteConversation(singleDeleteId);
                }
                setShowSingleDeleteConfirm(false);
                setSingleDeleteId('');
              }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 多选删除确认弹窗 */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={(open) => {
        setShowDeleteConfirm(open);
        // 当弹窗关闭时，重新启用外部点击检测
        if (!open && setIsClickOutsideDetectionEnabled) {
          setIsClickOutsideDetectionEnabled(true);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('chat.deleteMultipleConversations', { count: selectedConversationIds.length }) || `Delete ${selectedConversationIds.length} conversations?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('chat.deleteMultipleConversationsDescription') || 'This action cannot be undone. All selected conversations will be permanently deleted.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={(e) => {
                // 阻止事件冒泡，防止被判定为外部点击导致退出多选模式
                e.stopPropagation();
                setShowDeleteConfirm(false);
              }}>
                {t('common.cancel')}
              </AlertDialogCancel>
              <AlertDialogAction onClick={(e) => {
                // 阻止事件冒泡，防止被判定为外部点击导致退出多选模式
                e.stopPropagation();
                const ids = [...selectedConversationIds];
                setShowDeleteConfirm(false);
                
                // 立即执行删除操作，不等待定时器
                (async () => {
                  try {
                    // 优先使用批量删除函数，如果存在的话
                    if (onDeleteConversations) {
                      await onDeleteConversations(ids);
                    } else {
                      // 如果没有批量删除函数，则使用Promise.all确保所有删除操作完成
                      await Promise.all(
                        ids.map(id => onDeleteConversation(id))
                      );
                    }
                    
                    // 删除完成后退出多选模式并清空选中列表
                    setTimeout(() => {
                      if (setIsSelectionMode) {
                        setIsSelectionMode(false);
                      } else if (propSetIsSelectionMode) {
                        propSetIsSelectionMode(false);
                      }
                      setSelectedConversationIds([]);
                    }, 100);
                  } catch (error) {
                    console.error('删除对话失败:', error);
                  }
                })();
              }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                {t('common.delete')}
              </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ChatSidebar;
