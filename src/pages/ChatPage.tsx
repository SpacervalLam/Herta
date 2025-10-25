import { useState } from 'react';
import { useChat } from '@/hooks/useChat';
import ChatSidebar from '@/components/chat/ChatSidebar';
import ChatContent from '@/components/chat/ChatContent';
import ChatInput from '@/components/chat/ChatInput';
import SettingsDialog from '@/components/chat/SettingsDialog';

const ChatPage = () => {
  const {
    conversations,
    currentConversation,
    currentConversationId,
    isLoading,
    setCurrentConversationId,
    createNewConversation,
    deleteConversation,
    updateConversationTitle,
    sendMessage,
    stopGeneration,
    retryMessage,
    branchConversation,
    editMessage,
  } = useChat();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="h-screen flex">
      {/* 边栏 */}
      <div className={sidebarCollapsed ? "w-[60px]" : "w-64"} style={{ transition: 'width 0.3s' }}>
        <ChatSidebar
          conversations={conversations}
          currentConversationId={currentConversationId}
          onSelectConversation={setCurrentConversationId}
          onNewConversation={createNewConversation}
          onDeleteConversation={deleteConversation}
          onOpenSettings={() => setSettingsOpen(true)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 聊天内容区域 - 可滚动 */}
        <div className="flex-1 overflow-hidden">
          <ChatContent
            conversation={currentConversation}
            onUpdateTitle={updateConversationTitle}
            onRetryMessage={retryMessage}
            onBranchConversation={branchConversation}
            onEditMessage={editMessage}
          />
        </div>
        
        {/* 输入框 - 固定在底部 */}
        <div className="shrink-0 border-t bg-background">
          <ChatInput
            onSend={sendMessage}
            onStop={stopGeneration}
            isLoading={isLoading}
            disabled={false}
          />
        </div>
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
};

export default ChatPage;
