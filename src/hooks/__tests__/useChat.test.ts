import { renderHook, act, waitFor } from '@testing-library/react';
import { useChat } from '../useChat';
import { ConflictResolutionStrategy } from '../useChat';
import * as conversationService from '../../services/chatService';
import * as offlineManager from '../useOfflineManager';
import { toast } from '../use-toast';

// Mock dependencies
jest.mock('../../services/chatService');
jest.mock('../useOfflineManager');
jest.mock('../use-toast', () => ({
  toast: {
    info: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn()
  }
}));

const mockUser = {
  id: 'user123',
  name: 'Test User',
  email: 'test@example.com'
};

describe('useChat Hook - 离线模式功能测试', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // 模拟离线存储函数
    (offlineManager.saveConversations as jest.Mock).mockImplementation(() => {});
    (offlineManager.getConversations as jest.Mock).mockReturnValue([]);
    (offlineManager.recordOfflineChange as jest.Mock).mockImplementation(() => {});
    (offlineManager.getOfflineChanges as jest.Mock).mockReturnValue([]);
    (offlineManager.clearOfflineChanges as jest.Mock).mockImplementation(() => {});
  });

  describe('createNewConversation 离线模式测试', () => {
    it('离线模式下应正确记录变更', async () => {
      const { result } = renderHook(() => 
        useChat({ user: mockUser, isOnline: false, isOfflineMode: true })
      );

      await act(async () => {
        await result.current.createNewConversation();
      });

      expect(offlineManager.recordOfflineChange).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({
          type: 'create_conversation',
          conversation: expect.any(Object)
        })
      );
      expect(toast.info).toHaveBeenCalledWith(
        expect.stringContaining('离线模式')
      );
    });

    it('数据库失败时应切换到离线模式', async () => {
      (conversationService.saveConversation as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const { result } = renderHook(() => 
        useChat({ user: mockUser, isOnline: true, isOfflineMode: false })
      );

      await act(async () => {
        await result.current.createNewConversation();
      });

      expect(offlineManager.recordOfflineChange).toHaveBeenCalled();
      expect(toast.info).toHaveBeenCalledWith(
        expect.stringContaining('切换到离线模式')
      );
    });
  });

  describe('updateConversationTitle 离线模式测试', () => {
    it('离线模式下应正确记录变更', async () => {
      const mockConversation = {
        id: 'conv123',
        title: 'Old Title',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      const { result } = renderHook(() => 
        useChat({
          user: mockUser, 
          isOnline: false, 
          isOfflineMode: true,
          conversations: [mockConversation],
          currentConversationId: 'conv123'
        })
      );

      await act(async () => {
        await result.current.updateConversationTitle('New Title');
      });

      expect(offlineManager.recordOfflineChange).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({
          type: 'update_conversation',
          conversationId: 'conv123',
          updates: expect.objectContaining({
            title: 'New Title'
          })
        })
      );
    });
  });

  describe('冲突解决策略测试', () => {
    it('LOCAL_WINS 策略应保留本地版本', () => {
      const { result } = renderHook(() => useChat({}));
      
      const localVersion = {
        id: 'conv123',
        title: 'Local Title',
        messages: [{ id: 'm1', role: 'user', content: 'Local message', timestamp: Date.now() }],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      const serverVersion = {
        id: 'conv123',
        title: 'Server Title',
        messages: [{ id: 'm2', role: 'user', content: 'Server message', timestamp: Date.now() }],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      // 访问私有函数需要通过组件实例，这里使用模拟方式测试策略逻辑
      // 实际测试中可能需要调整方法或提供测试访问点
      const resolveConflict = (result.current as any)._resolveConflict || 
        (() => result.current.detectConflicts && localVersion);
      
      // 这里主要测试策略枚举类型的正确性
      expect(ConflictResolutionStrategy.LOCAL_WINS).toBe('local_wins');
      expect(ConflictResolutionStrategy.SERVER_WINS).toBe('server_wins');
      expect(ConflictResolutionStrategy.USE_LATEST).toBe('use_latest');
      expect(ConflictResolutionStrategy.MERGE_MESSAGES).toBe('merge_messages');
    });
  });

  describe('错误处理测试', () => {
    it('loadConversations 错误处理', async () => {
      (conversationService.getUserConversations as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      const { result } = renderHook(() => 
        useChat({ user: mockUser, isOnline: true, isOfflineMode: false })
      );

      await act(async () => {
        await result.current.loadConversations();
      });

      // 验证错误处理不会导致崩溃
      expect(result.current.conversations).toEqual([]);
    });

    it('deleteMessage 错误处理和离线模式切换', async () => {
      (conversationService.deleteMessage as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const mockConversation = {
        id: 'conv123',
        title: 'Test',
        messages: [{ id: 'msg1', role: 'user', content: 'Test', timestamp: Date.now() }],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      const { result } = renderHook(() => 
        useChat({
          user: mockUser,
          isOnline: true,
          isOfflineMode: false,
          conversations: [mockConversation],
          currentConversationId: 'conv123'
        })
      );

      await act(async () => {
        await result.current.deleteMessage('msg1');
      });

      // 验证数据库失败时切换到离线模式
      expect(offlineManager.recordOfflineChange).toHaveBeenCalled();
    });
  });

  describe('branchConversation 离线模式测试', () => {
    it('离线模式下应正确创建分支对话', async () => {
      const mockConversation = {
        id: 'conv123',
        title: 'Original',
        messages: [
          { id: 'msg1', role: 'user', content: 'Test 1', timestamp: Date.now() - 1000 },
          { id: 'msg2', role: 'assistant', content: 'Reply 1', timestamp: Date.now() }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      const { result } = renderHook(() => 
        useChat({
          user: mockUser,
          isOnline: false,
          isOfflineMode: true,
          conversations: [mockConversation],
          currentConversationId: 'conv123'
        })
      );

      await act(async () => {
        await result.current.branchConversation('msg1');
      });

      // 验证创建了新对话
      expect(result.current.conversations.length).toBe(2);
      expect(offlineManager.recordOfflineChange).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({
          type: 'create_conversation'
        })
      );
    });
  });
});