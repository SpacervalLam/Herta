import { useState, useEffect, useRef } from 'react';
import { Edit2 } from 'lucide-react';
import { useChat } from '@/hooks/useChat';
import ChatSidebar from '@/components/chat/ChatSidebar';
import ChatContent from '@/components/chat/ChatContent';
import ChatInput from '@/components/chat/ChatInput';
import SettingsDialog from '@/components/chat/SettingsDialog';
import TranslationModal from '@/components/features/TranslationModal';
import UserMenu from '@/components/Auth/UserMenu';
import ModelSelector from '@/components/chat/ModelSelector';
import ModelConfigDialog from '@/components/chat/ModelConfigDialog';
import { Button } from '@/components/ui/button';

const ChatPage = () => {
  // 用于引用ChatInput组件中的textarea元素
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const {
    conversations,
    currentConversation,
    currentConversationId,
    isLoading,
    isLoadingConversations,
    setCurrentConversationId,
    createNewConversation,
    deleteConversation,
    updateConversationTitle,
    sendMessage,
    stopGeneration,
    retryMessage,
    branchConversation,
    editMessage,
    deleteMessage, 
  } = useChat();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [translationOpen, setTranslationOpen] = useState(false);
  // 跟踪多选模式状态
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  // 控制是否启用外部点击检测
  const [isClickOutsideDetectionEnabled, setIsClickOutsideDetectionEnabled] = useState(true);

  // 点击页面任何地方都能退出多选模式
  useEffect(() => {
    // 只有当启用了外部点击检测且处于多选模式时，才添加事件监听
    if (isClickOutsideDetectionEnabled && isSelectionMode) {
      const handleClickOutside = (event: MouseEvent) => {
        // 检查点击目标是否不是侧边栏及其子元素
        const sidebarElement = document.querySelector('.h-screen.flex > div:first-child');
        if (sidebarElement && !sidebarElement.contains(event.target as Node)) {
          // 退出多选模式
          setIsSelectionMode(false);
        }
      };

      // 添加全局点击事件监听
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        // 清理事件监听
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
    // 如果不满足条件，则不添加事件监听
    return () => {};
  }, [isSelectionMode, isClickOutsideDetectionEnabled]);

  // 添加全局键盘事件监听器，实现按Enter键聚焦输入框
  useEffect(() => {
    const handleGlobalKeyPress = (e: KeyboardEvent) => {
      // 仅在按下Enter键且焦点不在输入框时触发
      if (e.key === 'Enter' && document.activeElement !== textareaRef.current) {
        // 确保输入框存在且可以聚焦
        if (textareaRef.current) {
          textareaRef.current.focus();
          e.preventDefault();
        }
      }
    };

    // 添加键盘事件监听器
    document.addEventListener('keydown', handleGlobalKeyPress);
    
    // 清理函数
    return () => {
      document.removeEventListener('keydown', handleGlobalKeyPress);
    };
  }, []);

  return (
    <div className="h-screen flex">
      {/* 边栏 */}
      <div className={sidebarCollapsed ? "w-[60px]" : "w-64"} style={{ transition: 'width 0.3s' }}>
        <ChatSidebar
          conversations={conversations}
          currentConversationId={currentConversationId}
          isLoadingConversations={isLoadingConversations}
          onSelectConversation={setCurrentConversationId}
          onNewConversation={createNewConversation}
          onDeleteConversation={deleteConversation}
          onDeleteConversations={(ids: string[]) => {
            ids.forEach(id => deleteConversation(id));
          }}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenTranslation={() => setTranslationOpen(true)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          // 传递多选模式状态和设置函数
          isSelectionMode={isSelectionMode}
          setIsSelectionMode={setIsSelectionMode}
          // 传递控制外部点击检测的函数
          setIsClickOutsideDetectionEnabled={setIsClickOutsideDetectionEnabled}
        />
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* 用户菜单 - 固定在右上角 */}
        <div className="absolute top-4 right-4 z-20">
          <UserMenu />
        </div>
        
        {/* 顶部工具栏区域 - 集成模型选择、配置和对话标题 */}
        <div className="border-b p-4 flex items-center justify-between bg-background shrink-0">
          {/* 左侧：对话标题 */}
          <div className="flex-1 min-w-0">
            {currentConversation && (
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold truncate">{currentConversation.title}</h2>
                <Button size="icon" variant="ghost" onClick={() => {
                  if ((window as any)['chatContentRef']?.current?.handleStartEdit) {
                    (window as any)['chatContentRef'].current.handleStartEdit();
                  }
                }}>
                  <Edit2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          
          {/* 右侧：模型选择和配置 - 与用户菜单保持距离 */}
          <div className="flex items-center gap-2 mr-20">
            <ModelSelector />
            <ModelConfigDialog />
          </div>
        </div>
        
        {/* 聊天内容区域 - 可滚动 */}
        <div className="flex-1 overflow-hidden">
          <ChatContent
            conversation={currentConversation}
            onUpdateTitle={updateConversationTitle}
            onRetryMessage={retryMessage}
            onBranchConversation={branchConversation}
            onEditMessage={editMessage}
            onDeleteMessage={deleteMessage} 
          />
        </div>
        
        {/* 输入框 - 固定在底部 */}
        <div className="shrink-0 border-t bg-background/80 backdrop-blur-sm">
          <ChatInput
            onSend={sendMessage}
            onStop={stopGeneration}
            isLoading={isLoading}
            disabled={false}
            textareaRef={textareaRef as React.RefObject<HTMLTextAreaElement>}
          />
        </div>
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <TranslationModal open={translationOpen} onOpenChange={setTranslationOpen} />
    </div>
  );
};

export default ChatPage;
