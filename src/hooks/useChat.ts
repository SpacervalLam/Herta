import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { sendChatStream } from '@/services/chatService';
import { getActiveModel } from '@/utils/modelStorage';
import type { Conversation, ChatMessage } from '@/types/chat';
import { MediaAttachment } from '@/types/chat';
import { useAuth } from '@/contexts/AuthContext';
import { conversationService, supabase } from '@/services/supabaseService';
import { useOfflineManager } from '@/hooks/useOfflineManager';

// 数据同步冲突解决策略
export enum ConflictResolutionStrategy {
  LOCAL_WINS = 'local_wins',
  SERVER_WINS = 'server_wins',
  USE_LATEST = 'use_latest',
  MERGE_MESSAGES = 'merge_messages'
}

// 冲突信息接口
interface ConflictInfo {
  conversationId: string;
  localVersion: Conversation;
  serverVersion: Conversation;
  strategy: ConflictResolutionStrategy;
  resolved: boolean;
  resolvedVersion?: Conversation;
}

// 本地存储键名常量
const LOCAL_STORAGE_KEY = 'ai-chat-conversations-local';
const OFFLINE_CONVERSATIONS_KEY = 'offline_conversations';
const OFFLINE_CURRENT_CONVERSATION_KEY = 'offline_current_conversation_id';

export const useChat = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);

  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { user } = useAuth();
  const { isOnline, saveOfflineData, getOfflineData, syncOfflineChanges, recordOfflineChange } = useOfflineManager();

  // 监听网络状态变化
  useEffect(() => {
    if (!user) return;
    
    // 网络恢复时尝试同步数据
    if (isOnline && isOfflineMode) {
      handleNetworkReconnect();
    }
    
    // 更新离线模式状态
    setIsOfflineMode(!isOnline);
  }, [isOnline, user]);

  // 冲突解决函数
  const resolveConflict = (localVersion: Conversation, serverVersion: Conversation, strategy: ConflictResolutionStrategy): Conversation => {
    switch (strategy) {
      case ConflictResolutionStrategy.LOCAL_WINS:
        return { ...localVersion };
      
      case ConflictResolutionStrategy.SERVER_WINS:
        return { ...serverVersion };
      
      case ConflictResolutionStrategy.USE_LATEST:
        return localVersion.updatedAt > serverVersion.updatedAt ? { ...localVersion } : { ...serverVersion };
      
      case ConflictResolutionStrategy.MERGE_MESSAGES:
        // 合并消息，保留所有唯一消息，按时间排序
        const allMessages = [...localVersion.messages, ...serverVersion.messages];
        const uniqueMessages = allMessages.filter((message, index, self) =>
          index === self.findIndex((m) => m.id === message.id)
        );
        
        // 使用更新时间较新的标题
        const resolvedTitle = localVersion.updatedAt > serverVersion.updatedAt ? localVersion.title : serverVersion.title;
        
        return {
          id: localVersion.id,
          title: resolvedTitle,
          messages: uniqueMessages.sort((a, b) => a.timestamp - b.timestamp),
          createdAt: localVersion.createdAt,
          updatedAt: Math.max(localVersion.updatedAt, serverVersion.updatedAt),
          isSaved: true
        };
      
      default:
        return { ...localVersion };
    }
  };
  
  // 检测对话冲突
  const detectConflicts = async (userId: string, localConversations: Conversation[]): Promise<ConflictInfo[]> => {
    const conflicts: ConflictInfo[] = [];
    
    try {
      // 获取服务器上的对话列表
      const serverConversations = await conversationService.getConversations(userId);
      
      // 检测冲突
      for (const localConv of localConversations) {
        const serverConv = serverConversations.find(conv => conv.id === localConv.id);
        
        if (serverConv) {
          // 对话在两端都存在，检查是否有冲突
          const hasConflict = localConv.updatedAt !== serverConv.updatedAt ||
                            JSON.stringify(localConv.messages) !== JSON.stringify(serverConv.messages);
          
          if (hasConflict) {
            conflicts.push({
              conversationId: localConv.id,
              localVersion: localConv,
              serverVersion: serverConv,
              strategy: ConflictResolutionStrategy.USE_LATEST, // 默认策略
              resolved: false
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to detect conflicts:', error);
    }
    
    return conflicts;
  };
  
  // 处理所有检测到的冲突
  const handleConflicts = async (conflicts: ConflictInfo[], userId: string): Promise<void> => {
    if (conflicts.length === 0) return;
    
    toast.info(`发现 ${conflicts.length} 个数据冲突，正在解决...`);
    
    try {
      for (const conflict of conflicts) {
        // 解决冲突
        const resolvedVersion = resolveConflict(
          conflict.localVersion,
          conflict.serverVersion,
          conflict.strategy
        );
        
        conflict.resolvedVersion = resolvedVersion;
        conflict.resolved = true;
        
        // 将解决后的版本保存到服务器
        await conversationService.updateConversation(
          resolvedVersion.id,
          userId,
          {
            title: resolvedVersion.title,
            updatedAt: resolvedVersion.updatedAt
          }
        );
        
        // 更新本地版本
        const updatedConversations = conversations.map(conv =>
          conv.id === resolvedVersion.id ? resolvedVersion : conv
        );
        setConversations(updatedConversations);
        saveConversations(updatedConversations);
      }
      
      toast.success(`成功解决 ${conflicts.length} 个数据冲突`);
    } catch (error) {
      console.error('Failed to handle conflicts:', error);
      toast.error('解决冲突失败，请稍后重试');
    }
  };
  
  // 网络恢复时处理
  const handleNetworkReconnect = useCallback(async () => {
    if (!user) return;
    
    try {
      toast.info('网络已恢复，开始同步数据...');
      
      // 先检测冲突
      const conflicts = await detectConflicts(user.id, conversations);
      if (conflicts.length > 0) {
        // 先解决冲突
        await handleConflicts(conflicts, user.id);
      }
      
      // 同步离线变更到服务器，使用更健壮的方法
      const offlineChanges = getOfflineData(`offline_changes_${user.id}`) || [];
      if (offlineChanges.length === 0) {
        setIsOfflineMode(false);
        toast.success('同步完成：没有待同步数据');
        return;
      }

      // 按时间顺序处理离线变更，添加错误处理和冲突检测
      const successfulChanges: any[] = [];
      for (const change of offlineChanges) {
        try {
          switch (change.type) {
            case 'create_conversation':
              await conversationService.createConversation({ userId: user.id, title: change.data.title, createdAt: change.data.createdAt, updatedAt: change.data.updatedAt, isSaved: change.data.isSaved });
              break;
            case 'update_conversation_title':
              // 更新操作前再次检查是否有冲突
              const serverConv = await conversationService.getConversation(change.conversationId, user.id);
              const localConv = conversations.find(c => c.id === change.conversationId);
              
              if (localConv && serverConv) {
                const hasConflict = JSON.stringify(localConv.messages) !== JSON.stringify(serverConv.messages);
                if (hasConflict) {
                  // 检测到冲突，使用MERGE_MESSAGES策略
                  const resolvedConv = resolveConflict(localConv, serverConv, ConflictResolutionStrategy.MERGE_MESSAGES);
                  await conversationService.updateConversation(
                    resolvedConv.id,
                    user.id,
                    {
                      title: resolvedConv.title,
                      updatedAt: resolvedConv.updatedAt
                    }
                  );
                } else {
                  // 无冲突，应用更新
                  await conversationService.updateConversation(change.conversationId, user.id, { title: change.title, updatedAt: Date.now() });
                }
              } else {
                await conversationService.updateConversation(change.conversationId, user.id, { title: change.title, updatedAt: Date.now() });
              }
              break;
            case 'delete_conversation':
              await conversationService.deleteConversation(change.id, user.id);
              break;
            case 'update_messages':
              const serverMessages = await conversationService.getConversation(change.conversationId, user.id);
              const localMessages = conversations.find(c => c.id === change.conversationId);
              
              if (localMessages && serverMessages) {
                const messagesConflict = JSON.stringify(localMessages.messages) !== JSON.stringify(serverMessages.messages);
                if (messagesConflict) {
                  // 合并消息
                  const mergedConv = resolveConflict(localMessages, serverMessages, ConflictResolutionStrategy.MERGE_MESSAGES);
                  await conversationService.updateConversation(
                    mergedConv.id,
                    user.id,
                    { updatedAt: Date.now() }
                  );
                  // 消息需要通过messageService单独处理
                } else {
                  await conversationService.updateConversation(
                    change.conversationId,
                    user.id,
                    { updatedAt: Date.now() }
                  );
                  // 消息需要通过messageService单独处理
                }
              }
              break;
          }
          successfulChanges.push(change);
        } catch (changeError) {
          console.error(`Failed to apply change type ${change.type}:`, changeError);
          // 继续处理下一个变更
        }
      }

      // 只清除成功应用的变更
      const remainingChanges = offlineChanges.filter((change: any) => !successfulChanges.includes(change));
      if (remainingChanges.length > 0) {
        saveOfflineData(`offline_changes_${user.id}`, remainingChanges);
        toast.warning(`部分同步失败：${successfulChanges.length} 条成功，${remainingChanges.length} 条待重试`);
      } else {
        saveOfflineData(`offline_changes_${user.id}`, []);
        setIsOfflineMode(false);
        toast.success(`同步完成：成功同步 ${successfulChanges.length} 条变更`);
      }
      
      // 重新加载对话列表
      await loadConversations();
    } catch (error) {
      console.error('Failed to sync data after reconnect:', error);
      toast.error('同步失败，请稍后重试');
    }
  }, [user, conversations, saveOfflineData, getOfflineData, resolveConflict]);

  // 保存到离线存储
  const saveToOfflineStorage = useCallback((newConversations: Conversation[], newCurrentId: string | null) => {
    saveOfflineData(OFFLINE_CONVERSATIONS_KEY, newConversations);
    if (newCurrentId) {
      saveOfflineData(OFFLINE_CURRENT_CONVERSATION_KEY, newCurrentId);
    }
  }, [saveOfflineData]);

  // 从离线存储加载数据
  const loadOfflineData = useCallback(() => {
    const offlineConversations = getOfflineData(OFFLINE_CONVERSATIONS_KEY) || [];
    const offlineCurrentId = getOfflineData(OFFLINE_CURRENT_CONVERSATION_KEY);
    
    setConversations(offlineConversations);
    setCurrentConversationId(offlineCurrentId || (offlineConversations.length > 0 ? offlineConversations[0].id : null));
    
    return offlineConversations;
  }, [getOfflineData]);

  // 加载对话数据
  const loadConversations = useCallback(async () => {
    setIsLoadingConversations(true);
    try {
      if (!user) {
        // 未登录用户从localStorage加载
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
              setConversations(parsed);
              if (parsed.length > 0) {
                setCurrentConversationId(parsed[0].id);
              }
            } else {
              console.error('Invalid conversations format in localStorage');
              setConversations([]);
            }
          } catch (parseError) {
            console.error('Failed to parse stored conversations:', parseError);
            setConversations([]);
            toast.error('本地对话数据损坏，已重置');
          }
        }
        return;
      }

      // 离线模式下从离线存储加载
      if (!isOnline) {
        try {
          loadOfflineData();
          setIsOfflineMode(true);
          toast.info('当前处于离线模式，部分功能可能受限');
        } catch (offlineLoadError) {
          console.error('Failed to load offline data:', offlineLoadError);
          setConversations([]);
          toast.error('加载离线数据失败');
        }
        return;
      }

      // 已登录用户从数据库加载
      try {
        const conversationList = await conversationService.getConversations(user.id);
        
        // 验证服务器返回的数据
        if (!Array.isArray(conversationList)) {
          console.error('Invalid conversations format from server');
          throw new Error('服务器返回数据格式错误');
        }
        
        setConversations(conversationList);
        
        // 尝试设置当前对话
        if (conversationList.length > 0) {
          try {
            // 优先使用本地保存的当前对话ID
            const savedCurrentId = localStorage.getItem('last-conversation-id');
            if (savedCurrentId && conversationList.some(c => c.id === savedCurrentId)) {
              setCurrentConversationId(savedCurrentId);
            } else {
              setCurrentConversationId(conversationList[0].id);
            }
          } catch (idError) {
            console.error('Error setting current conversation ID:', idError);
            setCurrentConversationId(conversationList[0].id);
          }
        } else {
          setCurrentConversationId(null);
        }
        
        // 同步到离线存储作为备份
        try {
          saveToOfflineStorage(conversationList, currentConversationId);
        } catch (storageError) {
          console.error('Failed to save to offline storage:', storageError);
          // 不中断流程，继续执行
        }
      } catch (dbError) {
          const errorObject = dbError as Error;
          console.warn('数据库连接失败，切换到离线模式:', { message: errorObject?.message || 'unknown error' });
          // 不抛出异常，直接处理离线模式
          setIsOfflineMode(true);
          
          // 从离线存储加载作为后备
          try {
            loadOfflineData();
            toast.error('数据库连接失败，已切换到离线模式');
            toast.info('已切换到离线模式，您可以继续使用应用');
          } catch (fallbackError) {
            const fallbackErrorObj = fallbackError as Error;
            console.warn('加载离线数据失败:', { message: fallbackErrorObj?.message || 'unknown error' });
            setConversations([]);
            toast.error('加载离线数据也失败，请稍后重试');
          }
        setIsLoadingConversations(false);
        return; // 提前返回，避免执行后面的逻辑
      }
    } finally {
      // 确保始终设置加载状态为false
      if (isLoadingConversations) {
        setIsLoadingConversations(false);
      }
    }
  }, [user, isOnline, loadOfflineData, saveToOfflineStorage, currentConversationId]);


  // 初始化加载和用户变化时重新加载
  useEffect(() => {
    loadConversations();
  }, []);

  // 监听网络状态变化，在线时同步离线数据
  useEffect(() => {
    if (user && isOnline) {
      syncOfflineChanges(user.id);
    }
  }, [user, isOnline, syncOfflineChanges]);

  // 保存对话（根据用户状态选择存储方式）
  const saveConversations = useCallback(async (updatedConversations: Conversation[]) => {
    if (user) {
      // 已登录用户保存到数据库
      try {
        // 这里简化处理，实际应用中可能需要更高效的批量操作
        // 在真实实现中，应该只保存发生变化的对话
        if (isOnline) {
          // 在线状态直接保存到数据库
          for (const conversation of updatedConversations) {
            if (conversation.id && !conversation.id.startsWith('local_')) {
              // 更新已存在的对话
              try {
                const result = await conversationService.updateConversation(conversation.id, user.id, {
                  title: conversation.title,
                  updatedAt: conversation.updatedAt
                });
                // 如果记录不存在，尝试创建新对话
                if (result === null) {
                  console.warn(`Conversation ${conversation.id} not found in database, creating new one`);
                  await conversationService.createConversation({
                    userId: user.id,
                    title: conversation.title,
                    createdAt: conversation.createdAt,
                    updatedAt: conversation.updatedAt
                  });
                }
              } catch (dbError) {
                console.error(`Failed to update conversation ${conversation.id} in database:`, dbError);
                // 继续处理其他对话，不中断整个循环
              }
            } else {
              // 创建新对话
              await conversationService.createConversation({
                userId: user.id,
                userEmail: user.email,
                userName: user.user_metadata?.name || user.email?.split('@')[0],
                title: conversation.title,
                createdAt: conversation.createdAt,
                updatedAt: conversation.updatedAt,
                isSaved: conversation.isSaved
              });
            }
          }
        } else {
          // 离线状态保存到本地缓存，等待网络恢复时同步
          saveOfflineData('conversations', updatedConversations);
        }
      } catch (error) {
        console.error('Failed to save conversations to database:', error);
        // 保存失败时回退到本地存储
        saveOfflineData('conversations', updatedConversations);
      }
    } else {
      // 未登录用户保存到localStorage
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedConversations));
    }
  }, [user, isOnline, saveOfflineData]);

  const currentConversation = conversations.find(c => c.id === currentConversationId);

  // 创建新对话
  const createNewConversation = useCallback(async (title?: string) => {
    try {
      // 参数验证和清理
      const sanitizedTitle = typeof title === 'string' && title.trim() ? title.trim() : '新对话';
      
      // 生成唯一ID和时间戳
      let newId: string;
      try {
        newId = uuidv4();
      } catch (uuidError) {
        console.error('Failed to generate unique ID:', uuidError);
        // 备用ID生成策略
        newId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }
      
      const newConversation: Conversation = {
        id: newId,
        title: sanitizedTitle,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // 更新本地状态的函数，集中错误处理
      const updateLocalState = async (updatedConversations: Conversation[]) => {
        try {
          setConversations(updatedConversations);
          setCurrentConversationId(newId);
          
          // 单独处理localStorage操作
          try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedConversations));
            localStorage.setItem('last-conversation-id', newId);
          } catch (localStorageError) {
            console.error('Failed to save to localStorage:', localStorageError);
            toast.warning('对话已创建，但无法保存到本地存储');
            // 继续执行，不中断流程
          }
          
          // 单独处理离线存储操作
          try {
            if (saveToOfflineStorage) {
              await saveToOfflineStorage(updatedConversations, newId);
            }
          } catch (offlineStorageError) {
            console.error('Failed to save to offline storage:', offlineStorageError);
            // 继续执行，不中断流程
          }
        } catch (stateError) {
          console.error('Failed to update conversation state:', stateError);
          throw stateError;
        }
      };

      if (!user) {
        // 未登录用户处理
        try {
          const updatedConversations = [newConversation, ...conversations];
          await updateLocalState(updatedConversations);
          return newId;
        } catch (error) {
          console.error('Failed to create conversation for anonymous user:', error);
          toast.error('创建新对话失败，请稍后重试');
          return null;
        }
      }

      // 离线模式处理
      if (!isOnline || isOfflineMode) {
        try {
          const updatedConversations = [newConversation, ...conversations];
          await updateLocalState(updatedConversations);
          
          // 记录离线变更
          try {
            if (recordOfflineChange) {
              recordOfflineChange(user.id, {
                type: 'create_conversation',
                data: { ...newConversation, user_id: user.id }
              });
            }
            toast.info('对话已创建（离线模式），网络恢复后将自动同步');
          } catch (recordError) {
            console.error('Failed to record offline change:', recordError);
            toast.warning('对话已创建，但无法记录离线变更');
          }
          
          return newId;
        } catch (error) {
          console.error('Failed to create conversation in offline mode:', error);
          toast.error('创建新对话失败，请稍后重试');
          return null;
        }
      }

      // 在线模式处理
      try {
        // 在线模式：保存到数据库
        await conversationService.createConversation({ userId: user.id, title: newConversation.title, createdAt: newConversation.createdAt, updatedAt: newConversation.updatedAt, isSaved: newConversation.isSaved });
        
        // 更新本地状态
        const updatedConversations = [newConversation, ...conversations];
        await updateLocalState(updatedConversations);
        
        return newId;
      } catch (dbError) {
        console.error('Failed to create conversation in database:', dbError);
        
        // 数据库失败，切换到离线模式并重试
        try {
          setIsOfflineMode(true);
          const updatedConversations = [newConversation, ...conversations];
          await updateLocalState(updatedConversations);
          
          // 记录离线变更
          try {
            if (recordOfflineChange) {
              recordOfflineChange(user.id, {
                type: 'create_conversation',
                data: { ...newConversation, user_id: user.id }
              });
            }
          } catch (recordError) {
            console.error('Failed to record offline change after db error:', recordError);
          }
          
          toast.info('切换到离线模式，对话已创建');
          return newId;
        } catch (fallbackError) {
          console.error('Failed to fallback to offline mode:', fallbackError);
          toast.error('创建对话失败，请稍后重试');
          return null;
        }
      }
    } catch (criticalError) {
      console.error('Critical error in createNewConversation:', criticalError);
      toast.error('发生严重错误，请刷新页面后重试');
      return null;
    }
  }, [conversations, user, isOnline, isOfflineMode, recordOfflineChange, saveToOfflineStorage]);


  // 删除单个对话
  const deleteConversation = useCallback(async (conversationId: string) => {
    if (!user) {
      // 未登录用户从localStorage删除
      const updatedConversations = conversations.filter(c => c.id !== conversationId);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedConversations));
      setConversations(updatedConversations);
      
      // 如果删除的是当前对话，切换到第一个对话
      if (currentConversationId === conversationId) {
        const newCurrentId = updatedConversations.length > 0 ? updatedConversations[0].id : null;
        setCurrentConversationId(newCurrentId);
        if (newCurrentId) {
          localStorage.setItem('last-conversation-id', newCurrentId);
        }
      }
      return;
    }

    // 离线模式处理
    if (!isOnline || isOfflineMode) {
      const updatedConversations = conversations.filter(c => c.id !== conversationId);
      
      // 更新本地状态和离线存储
      setConversations(updatedConversations);
      saveToOfflineStorage(updatedConversations, currentConversationId);
      
      // 如果删除的是当前对话，切换到第一个对话
      if (currentConversationId === conversationId) {
        const newCurrentId = updatedConversations.length > 0 ? updatedConversations[0].id : null;
        setCurrentConversationId(newCurrentId);
        if (newCurrentId) {
          localStorage.setItem('last-conversation-id', newCurrentId);
          saveToOfflineStorage(updatedConversations, newCurrentId);
        }
      }
      
      // 记录离线变更
      recordOfflineChange(user.id, {
        type: 'delete_conversation',
        id: conversationId
      });
      
      toast.info('对话已删除（离线模式），网络恢复后将自动同步');
      return;
    }

    try {
      // 在线模式：从数据库删除
      await conversationService.deleteConversation(conversationId, user.id);
      
      // 更新本地状态
      const updatedConversations = conversations.filter(c => c.id !== conversationId);
      setConversations(updatedConversations);
      
      // 同步到离线存储
      saveToOfflineStorage(updatedConversations, currentConversationId);
      
      // 如果删除的是当前对话，切换到第一个对话
      if (currentConversationId === conversationId) {
        const newCurrentId = updatedConversations.length > 0 ? updatedConversations[0].id : null;
        setCurrentConversationId(newCurrentId);
        if (newCurrentId) {
          localStorage.setItem('last-conversation-id', newCurrentId);
          saveToOfflineStorage(updatedConversations, newCurrentId);
        }
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      setIsOfflineMode(true);
      
      // 失败时转为离线模式处理
      const updatedConversations = conversations.filter(c => c.id !== conversationId);
      saveToOfflineStorage(updatedConversations, currentConversationId);
      setConversations(updatedConversations);
      
      recordOfflineChange(user.id, {
        type: 'delete_conversation',
        id: conversationId
      });
      
      toast.info('切换到离线模式，对话已删除');
    }
  }, [user, conversations, currentConversationId, isOnline, isOfflineMode, saveToOfflineStorage, recordOfflineChange]);

  const updateConversationTitle = useCallback(async (id: string, title: string) => {
    try {
      // 参数验证
      if (!id || typeof title !== 'string' || !title.trim()) {
        toast.error('无效的参数：标题不能为空');
        return;
      }
      
      // 检查对话是否存在
      const conversationExists = conversations.some(c => c.id === id);
      if (!conversationExists) {
        toast.error('找不到指定的对话');
        return;
      }

      try {
        const updatedConversations = conversations.map(c => 
          c.id === id ? { ...c, title, updatedAt: Date.now() } : c
        );
        
        // 更新本地状态
        setConversations(updatedConversations);
        
        // 单独捕获saveConversations的错误
        try {
          await saveConversations(updatedConversations);
        } catch (saveError) {
          console.error('Failed to save conversation title to storage:', saveError);
          toast.warning('标题已更新，但保存失败');
          // 继续执行，不中断流程
        }
        
        // 根据在线状态和用户登录状态处理数据库更新
        if (!user) {
          // 未登录用户只保存到localStorage
          return;
        }
        
        if (!isOnline || isOfflineMode) {
          // 离线模式：记录变更
          try {
            recordOfflineChange(user.id, {
              type: 'update_conversation_title',
              conversationId: id,
              title: title
            });
            toast.info('对话标题已更新（离线模式），网络恢复后将自动同步');
          } catch (recordError) {
            console.error('Failed to record offline change for title update:', recordError);
            toast.warning('标题已更新，但无法记录离线变更');
          }
          return;
        }
        
        // 在线模式：更新数据库
        try {
          const result = await conversationService.updateConversation(id, user.id, { title, updatedAt: Date.now() });
          // 如果记录不存在，尝试创建新对话
          if (result === null) {
            console.warn('Conversation not found in database, creating new one');
            await conversationService.createConversation({
              userId: user.id,
              title: title,
              createdAt: Date.now(),
              updatedAt: Date.now()
            });
          }
        } catch (dbError) {
          console.error('Failed to update conversation title in database:', dbError);
          // 数据库更新失败，切换到离线模式
          try {
            setIsOfflineMode(true);
            recordOfflineChange(user.id, {
              type: 'update_conversation_title',
              conversationId: id,
              title: title
            });
            toast.info('切换到离线模式，标题已更新');
          } catch (fallbackError) {
            console.error('Failed to switch to offline mode after db error:', fallbackError);
            toast.error('更新标题失败，请稍后重试');
          }
        }
      } catch (error) {
        console.error('Failed to update conversation title:', error);
        toast.error('更新对话标题失败');
      }
    } catch (criticalError) {
      console.error('Critical error in updateConversationTitle:', criticalError);
      toast.error('发生严重错误，请刷新页面后重试');
    }
  }, [conversations, user, isOnline, isOfflineMode, saveConversations, recordOfflineChange]);

  const clearConversation = useCallback(async (id: string) => {
    try {
      const updatedConversations = conversations.map(c => 
        c.id === id ? { ...c, messages: [], updatedAt: Date.now() } : c
      );
      
      setConversations(updatedConversations);
      saveConversations(updatedConversations);
      
      // 从数据库清除消息（如果在线且已登录）
      if (user && isOnline) {
        try {
          const result = await conversationService.updateConversation(id, user.id, { updatedAt: Date.now() });
          // 如果记录不存在，尝试创建新对话
          if (result === null) {
            console.warn('Conversation not found in database, creating new one');
            // 从本地conversations数组中查找对应ID的对话
            const conversationToCreate = conversations.find(c => c.id === id);
            if (conversationToCreate) {
              await conversationService.createConversation({
                userId: user.id,
                title: conversationToCreate.title,
                createdAt: conversationToCreate.createdAt,
                updatedAt: Date.now()
              });
            } else {
              console.error('Could not find conversation in local state to create in database');
            }
          }
        } catch (dbError) {
          console.error('Failed to update conversation timestamp in database:', dbError);
        }
        // 注意：数据库中的消息需要通过messageService单独清除
        // 这里只更新对话的更新时间
      }
    } catch (error) {
      console.error('Failed to clear conversation:', error);
      toast.error('清空对话失败');
    }
  }, [conversations, user, isOnline, saveConversations]);

  // AI自动生成对话标题
  const generateConversationTitle = useCallback(async (conversationId: string, firstMessage: string) => {
    const activeModel = getActiveModel();
    if (!activeModel) return;

    try {
      const titlePrompt = `用户用以下问题开启了一次对话，请根据用户的问题，生成一个简短的对话标题，反应用户对话的主题（不超过20个字，不要加引号，只返回标题本身，不要其他任何说明）：用户问题内容：\n\n${firstMessage}`;

      let generatedTitle = '';
      const controller = new AbortController();
      const timeoutMs = 8000;

      const timeoutHandle = setTimeout(() => {
        // 仅标记超时，不强制中断
      }, timeoutMs);

      await sendChatStream({
        endpoint: activeModel.apiUrl,
        apiKey: activeModel.apiKey,
        modelConfig: activeModel,
        messages: [{ id: 'temp', role: 'user', content: titlePrompt, timestamp: Date.now() }],
        onUpdate: (content: string) => {
          // 累积流式内容
          generatedTitle = content.trim();
        },
        onComplete: () => {
          clearTimeout(timeoutHandle);

          let finalTitle = generatedTitle.trim();

          // 🔹 1. 移除 ...<|FunctionCallEnd|> 思维链段落
          finalTitle = finalTitle.replace(/[\s\S]*?<\/think>/gi, '');

          // 🔹 2. 仅取首行并清理多余空格与引号
          finalTitle = finalTitle.split('\n')[0].replace(/^["'\s]+|["'\s]+$/g, '').trim();

          // 🔹 3. 若为空则使用用户消息回退
          if (!finalTitle) {
            finalTitle = firstMessage.trim().slice(0, 12) || 'New Conversation';
          }

          // 🔹 4. 长度约束：最多40字符（宽字符按2算）
          const charCount = Array.from(finalTitle).reduce((sum, ch) => sum + (ch.charCodeAt(0) > 255 ? 2 : 1), 0);
          if (charCount > 40) {
            let total = 0;
            finalTitle = Array.from(finalTitle)
              .filter(ch => {
                total += ch.charCodeAt(0) > 255 ? 2 : 1;
                return total <= 40;
              })
              .join('');
          }

          // 🔹 5. 更新到会话标题
          if (finalTitle) {
            updateConversationTitle(conversationId, finalTitle);
          }
        },
        onError: (err) => {
          clearTimeout(timeoutHandle);
          console.error('标题生成失败:', err);
        },
        signal: controller.signal
      });
    } catch (error) {
      console.error('标题生成错误:', error);
    }
  }, [updateConversationTitle]);



  const sendMessage = useCallback(async (content: string, attachments?: MediaAttachment[]) => {
    try {
      if ((!content.trim() && !attachments?.length) || isLoading) return;

      // 获取当前激活的模型配置
      const activeModel = getActiveModel();
      if (!activeModel) {
        toast.error('请先配置AI模型', {
          description: '点击顶部模型选择器旁的设置图标进行配置'
        });
        return;
      }

      // 检查模型是否支持多模态
      if (attachments?.length && (!activeModel.supportsMultimodal)) {
        toast.error('当前模型不支持多模态输入', {
          description: '请切换到支持图片等媒体的模型'
        });
        return;
      }

      let conversation = currentConversation;
      if (!conversation) {
        // 创建新对话，获取对话ID
        const newConversationId = await createNewConversation();
        // 确保创建成功
        if (!newConversationId) {
          toast.error('创建对话失败，请重试');
          return;
        }
        // 从conversations状态中查找新创建的对话
        const newConversation = conversations.find(c => c.id === newConversationId);
        if (!newConversation) {
          toast.error('获取新对话失败，请重试');
          return;
        }
        conversation = newConversation;
      }

      const isFirstMessage = conversation.messages.length === 0;

      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'user',
        content: content.trim(),
        timestamp: Date.now(),
        attachments: attachments // 添加附件
      };

      // 创建临时更新函数以减少代码重复，并添加错误处理
      const updateConversations = (updater: (conv: Conversation) => Conversation) => {
        try {
          const updatedConversations = conversations.map(c =>
            c.id === conversation!.id ? updater(c) : c
          );
          setConversations(updatedConversations);
          saveConversations(updatedConversations);
        } catch (updateError) {
          console.error('Failed to update conversations:', updateError);
          toast.error('更新对话状态失败');
          // 即使更新失败也继续处理，不中断流程
        }
      };

      // 添加用户消息
      updateConversations(c => ({
        ...c,
        messages: [...c.messages, userMessage],
        updatedAt: Date.now()
      }));

      // 创建assistant消息，记录当前使用的模型信息
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now() + 1}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        modelName: activeModel.name, // 记录模型名称
        modelId: activeModel.id // 记录模型ID
      };

      // 添加assistant消息占位符
      updateConversations(c => ({
        ...c,
        messages: [...c.messages, assistantMessage]
      }));

      setIsLoading(true);
      abortControllerRef.current = new AbortController();

      try {
        // 上传附件到Supabase Storage（如果有）
        let processedAttachments = attachments;
        if (user && attachments?.length && isOnline) {
          try {
            processedAttachments = await Promise.all(
              attachments.map(async (attachment) => {
                // 检查是否是本地文件（base64）
                if (attachment.url.startsWith('data:')) {
                  try {
                    const blob = await (await fetch(attachment.url)).blob();
                    const fileName = attachment.fileName || `attachment-${Date.now()}.${attachment.type}`;
                    const filePath = `user_${user.id}/attachments/${fileName}`;
                    // 注意：这里需要确保supabase已导入
                    const { error } = await supabase
                      .storage
                      .from('attachments')
                      .upload(filePath, blob, { upsert: true });
                    
                    if (error) throw error;
                    
                    // 单独调用getPublicUrl获取公共URL
                    const { data: urlData } = supabase
                      .storage
                      .from('attachments')
                      .getPublicUrl(filePath);
                    
                    return { ...attachment, url: urlData?.publicUrl || '' };
                  } catch (uploadError) {
                    console.error('Failed to upload attachment:', uploadError);
                    // 上传失败时保留原始base64
                    return attachment;
                  }
                }
                return attachment;
              })
            );

            // 更新用户消息中的附件URL
            if (processedAttachments) {
              const updatedUserMessage = { ...userMessage, attachments: processedAttachments };
              updateConversations(c => ({
                ...c,
                messages: c.messages.map(m =>
                  m.id === userMessage.id ? updatedUserMessage : m
                )
              }));
            }
          } catch (uploadBatchError) {
            console.error('Error in attachment batch processing:', uploadBatchError);
            // 继续执行，不中断流程
          }
        }

        await sendChatStream({
          endpoint: activeModel.apiUrl,
          apiKey: activeModel.apiKey,
          modelConfig: activeModel,
          messages: [...conversation.messages, { ...userMessage, attachments: processedAttachments }],
          onUpdate: (content: string) => {
            try {
              updateConversations(c => ({
                ...c,
                messages: c.messages.map(m =>
                  m.id === assistantMessage.id ? { ...m, content } : m
                )
              }));
            } catch (updateError) {
              console.error('Failed to update message content:', updateError);
              // 继续接收更新，不中断流程
            }
          },
          onComplete: async () => {
            try {
              setIsLoading(false);
              abortControllerRef.current = null;

              // 如果是首次消息且对话未保存，标记为已保存
              if (isFirstMessage) {
                updateConversations(c => ({ ...c, isSaved: true }));

                // AI回复完成后生成对话标题
                try {
                  generateConversationTitle(conversation.id, content.trim());
                } catch (titleError) {
                  console.error('Failed to generate conversation title:', titleError);
                  // 标题生成失败不影响主要功能
                }
              }

              // 在线且已登录时，单独保存消息到数据库
              if (user && isOnline) {
                try {
                  const result = await conversationService.updateConversation(
                    conversation.id,
                    user.id,
                    { updatedAt: Date.now() }
                  );
                  // 如果记录不存在，尝试创建新对话
                  if (result === null) {
                    console.warn('Conversation not found in database, creating new one');
                    await conversationService.createConversation({
                      userId: user.id,
                      title: conversation.title,
                      createdAt: conversation.createdAt,
                      updatedAt: Date.now()
                    });
                  }
                  // 消息需要通过messageService单独处理
                } catch (dbError) {
                  console.error('Failed to save messages to database:', dbError);
                  // 切换到离线模式
                  setIsOfflineMode(true);
                  // 记录离线变更
                  try {
                    recordOfflineChange(user.id, {
                      type: 'update_messages',
                      conversationId: conversation.id,
                      messages: [...conversation.messages, { ...userMessage, attachments: processedAttachments }, { ...assistantMessage, content }]
                    });
                    toast.info('切换到离线模式，消息已本地保存');
                  } catch (recordError) {
                    console.error('Failed to record offline change:', recordError);
                  }
                }
              }
            } catch (completeError) {
              console.error('Error in onComplete handler:', completeError);
              // 确保状态重置
              setIsLoading(false);
              abortControllerRef.current = null;
            }
          },
          onError: (error: Error) => {
            try {
              setIsLoading(false);
              abortControllerRef.current = null;
              toast.error('发送消息失败', {
                description: error.message || '请检查模型配置或稍后重试'
              });
              // 移除assistant消息
              updateConversations(c => ({
                ...c,
                messages: c.messages.filter(m => m.id !== assistantMessage.id)
              }));
            } catch (errorHandlerError) {
              console.error('Error in error handler:', errorHandlerError);
              // 确保状态重置
              setIsLoading(false);
              abortControllerRef.current = null;
            }
          },
          signal: abortControllerRef.current.signal
        });
      } catch (error) {
        console.error('Send message error:', error);
        setIsLoading(false);
        abortControllerRef.current = null;
        
        // 移除assistant消息，恢复到用户消息发送后的状态
        try {
          updateConversations(c => ({
            ...c,
            messages: c.messages.filter(m => m.id !== assistantMessage.id)
          }));
        } catch (recoveryError) {
          console.error('Failed to recover from error:', recoveryError);
        }
        
        // 如果用户已登录且在线，切换到离线模式并记录变更
        if (user && isOnline) {
          try {
            setIsOfflineMode(true);
            recordOfflineChange(user.id, {
              type: 'update_messages',
              conversationId: conversation.id,
              messages: [...conversation.messages, userMessage]
            });
            toast.info('切换到离线模式，用户消息已保存');
          } catch (offlineSwitchError) {
            console.error('Failed to switch to offline mode:', offlineSwitchError);
          }
        }
      }
    } catch (criticalError) {
      console.error('Critical error in sendMessage:', criticalError);
      setIsLoading(false);
      abortControllerRef.current = null;
      toast.error('发生严重错误，请刷新页面重试');
    }
  }, [currentConversation, isLoading, conversations, createNewConversation, generateConversationTitle, user, isOnline, isOfflineMode, saveConversations, recordOfflineChange]);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, []);

  const exportConversation = useCallback((id: string) => {
    const conversation = conversations.find(c => c.id === id);
    if (!conversation) return;

    const content = conversation.messages
      .map(m => `${m.role === 'user' ? '用户' : 'AI助手'}: ${m.content}`)
      .join('\n\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${conversation.title}-${new Date().toLocaleDateString()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('对话已导出');
  }, [conversations]);

  // 重试生成回复
  const retryMessage = useCallback(async (messageId: string) => {
    if (!currentConversation || isLoading) return;

    // 找到要重试的消息
    const messageIndex = currentConversation.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1 || currentConversation.messages[messageIndex].role !== 'assistant') return;

    // 找到对应的用户消息
    const userMessageIndex = messageIndex - 1;
    if (userMessageIndex < 0 || currentConversation.messages[userMessageIndex].role !== 'user') return;

    const activeModel = getActiveModel();
    if (!activeModel) {
      toast.error('请先配置AI模型');
      return;
    }

    // 移除当前消息及之后的所有消息
    const messagesBefore = currentConversation.messages.slice(0, userMessageIndex + 1);
    
    // 创建临时更新函数以减少代码重复
    const updateConversations = (updater: (conv: Conversation) => Conversation) => {
      const updatedConversations = conversations.map(c =>
        c.id === currentConversation.id ? updater(c) : c
      );
      setConversations(updatedConversations);
      saveConversations(updatedConversations);
    };

    // 更新对话
    updateConversations(c => ({
      ...c,
      messages: messagesBefore,
      updatedAt: Date.now()
    }));

    // 创建新的assistant消息
    const assistantMessage: ChatMessage = {
      id: `msg-${Date.now() + 1}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      modelName: activeModel.name,
      modelId: activeModel.id
    };

    // 添加新的assistant消息
    updateConversations(c => ({
      ...c,
      messages: [...messagesBefore, assistantMessage]
    }));

    setIsLoading(true);
    abortControllerRef.current = new AbortController();

    try {
      await sendChatStream({
        endpoint: activeModel.apiUrl,
        apiKey: activeModel.apiKey,
        modelConfig: activeModel,
        messages: messagesBefore,
        onUpdate: (content: string) => {
          updateConversations(c => ({
            ...c,
            messages: c.messages.map(m =>
              m.id === assistantMessage.id ? { ...m, content } : m
            )
          }));
        },
        onComplete: async () => {
          setIsLoading(false);
          abortControllerRef.current = null;
          
          // 根据用户和在线状态处理数据库更新
          if (user) {
            if (!isOnline || isOfflineMode) {
              // 离线模式：记录变更
              recordOfflineChange(user.id, {
                type: 'update_messages',
                conversationId: currentConversation.id,
                messages: messagesBefore.concat([assistantMessage])
              });
              toast.info('回复已重新生成（离线模式），网络恢复后将自动同步');
              return;
            }
            
            // 在线模式：更新数据库
            try {
              await conversationService.updateConversation(
                currentConversation.id,
                user.id,
                { updatedAt: Date.now() }
              );
              // 消息需要通过messageService单独处理
            } catch (dbError) {
              console.error('Failed to update messages in database:', dbError);
              // 数据库更新失败，切换到离线模式
              setIsOfflineMode(true);
              recordOfflineChange(user.id, {
                type: 'update_messages',
                conversationId: currentConversation.id,
                messages: messagesBefore.concat([assistantMessage])
              });
              toast.info('切换到离线模式，回复已重新生成');
            }
          }
        },
        onError: (error: Error) => {
          setIsLoading(false);
          abortControllerRef.current = null;
          toast.error('重新生成失败', {
            description: error.message || '请检查模型配置或稍后重试'
          });
          // 移除assistant消息
          updateConversations(c => ({
            ...c,
            messages: c.messages.filter(m => m.id !== assistantMessage.id)
          }));
        },
        signal: abortControllerRef.current.signal
      });
    } catch (error) {
      console.error('Retry message error:', error);
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [currentConversation, isLoading, conversations, user, isOnline, isOfflineMode, saveConversations, recordOfflineChange]);

  // 从指定消息创建分支对话
  const branchConversation = useCallback(async (messageId: string) => {
    if (!currentConversation) return;

    // 找到消息位置
    const messageIndex = currentConversation.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;

    // 复制该消息之前的所有消息（包括该消息）
    const messagesUpToBranch = currentConversation.messages.slice(0, messageIndex + 1);

    // 创建新对话
    const newConversation: Conversation = {
      id: `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: `${currentConversation.title} (分支)`,
      messages: messagesUpToBranch,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isSaved: true
    };

    // 添加到对话列表并切换
    const updatedConversations = [newConversation, ...conversations];
    setConversations(updatedConversations);
    setCurrentConversationId(newConversation.id);
    
    // 保存到存储
    saveConversations(updatedConversations);
    
    // 根据用户和在线状态处理数据库保存
    if (!user) {
      // 未登录用户只保存到localStorage
      return;
    }
    
    if (!isOnline || isOfflineMode) {
      // 离线模式：记录变更
      recordOfflineChange(user.id, {
        type: 'create_conversation',
        conversation: newConversation
      });
      toast.info('分支对话已创建（离线模式），网络恢复后将自动同步');
      return;
    }
    
    // 在线模式：保存到数据库
    try {
      await conversationService.createConversation({ userId: user.id, title: newConversation.title, createdAt: newConversation.createdAt, updatedAt: newConversation.updatedAt, isSaved: newConversation.isSaved });
    } catch (dbError) {
      console.error('Failed to save branch conversation to database:', dbError);
      // 数据库保存失败，切换到离线模式
      setIsOfflineMode(true);
      recordOfflineChange(user.id, {
        type: 'create_conversation',
        conversation: newConversation
      });
      toast.info('切换到离线模式，分支对话已创建');
    }
  }, [currentConversation, conversations, user, isOnline, isOfflineMode, saveConversations, recordOfflineChange]);

  // 批量删除对话
  const deleteConversations = useCallback(async (conversationIds: string[]) => {
    console.log('deleteConversations被调用，删除的对话ID数量:', conversationIds.length);
    console.log('删除的对话ID列表:', conversationIds);
    
    if (conversationIds.length === 0) {
      console.log('没有要删除的对话，直接返回');
      return;
    }
    
    if (!user) {
      console.log('未登录用户，从localStorage删除对话');
      // 未登录用户从localStorage删除
      const updatedConversations = conversations.filter(c => !conversationIds.includes(c.id));
      console.log('删除前对话数量:', conversations.length, '删除后对话数量:', updatedConversations.length);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedConversations));
      setConversations(updatedConversations);
      
      // 如果删除的包含当前对话，切换到第一个对话
      if (currentConversationId && conversationIds.includes(currentConversationId)) {
        console.log('当前对话被删除，需要切换到其他对话');
        const newCurrentId = updatedConversations.length > 0 ? updatedConversations[0].id : null;
        setCurrentConversationId(newCurrentId);
        if (newCurrentId) {
          localStorage.setItem('last-conversation-id', newCurrentId);
        }
      }
      console.log('未登录用户删除处理完成，即将返回');
      return;
    }

    // 离线模式处理
    if (!isOnline || isOfflineMode) {
      console.log('离线模式处理批量删除');
      const updatedConversations = conversations.filter(c => !conversationIds.includes(c.id));
      console.log('删除前对话数量:', conversations.length, '删除后对话数量:', updatedConversations.length);
      
      // 更新本地状态和离线存储
      setConversations(updatedConversations);
      saveToOfflineStorage(updatedConversations, currentConversationId);
      
      // 如果删除的包含当前对话，切换到第一个对话
      if (currentConversationId && conversationIds.includes(currentConversationId)) {
        console.log('当前对话被删除，需要切换到其他对话');
        const newCurrentId = updatedConversations.length > 0 ? updatedConversations[0].id : null;
        setCurrentConversationId(newCurrentId);
        if (newCurrentId) {
          localStorage.setItem('last-conversation-id', newCurrentId);
          saveToOfflineStorage(updatedConversations, newCurrentId);
        }
      }
      
      // 记录离线变更
      console.log('记录离线变更');
      conversationIds.forEach(id => {
        recordOfflineChange(user.id, {
          type: 'delete_conversation',
          id
        });
      });
      
      toast.info('对话已删除（离线模式），网络恢复后将自动同步');
      console.log('离线模式删除处理完成，即将返回');
      return;
    }

    try {
      console.log('在线模式：从数据库批量删除对话');
      // 在线模式：从数据库批量删除
      await conversationService.deleteConversations(conversationIds, user.id);
      console.log('数据库批量删除成功');
      
      // 更新本地状态
      const updatedConversations = conversations.filter(c => !conversationIds.includes(c.id));
      console.log('删除前对话数量:', conversations.length, '删除后对话数量:', updatedConversations.length);
      setConversations(updatedConversations);
      
      // 同步到离线存储
      saveToOfflineStorage(updatedConversations, currentConversationId);
      
      // 如果删除的包含当前对话，切换到第一个对话
      if (currentConversationId && conversationIds.includes(currentConversationId)) {
        console.log('当前对话被删除，需要切换到其他对话');
        const newCurrentId = updatedConversations.length > 0 ? updatedConversations[0].id : null;
        setCurrentConversationId(newCurrentId);
        if (newCurrentId) {
          localStorage.setItem('last-conversation-id', newCurrentId);
          saveToOfflineStorage(updatedConversations, newCurrentId);
        }
      }
      console.log('在线模式删除处理完成，即将返回');
      return;
    } catch (error) {
      console.error('Failed to delete conversations:', error);
      console.log('数据库删除失败，切换到离线模式处理');
      setIsOfflineMode(true);
      
      // 失败时转为离线模式处理
      const updatedConversations = conversations.filter(c => !conversationIds.includes(c.id));
      console.log('删除前对话数量:', conversations.length, '删除后对话数量:', updatedConversations.length);
      saveToOfflineStorage(updatedConversations, currentConversationId);
      setConversations(updatedConversations);
      
      // 记录离线变更
      console.log('记录离线变更');
      conversationIds.forEach(id => {
        recordOfflineChange(user.id, {
          type: 'delete_conversation',
          id
        });
      });
      
      toast.info('对话已标记为删除，网络恢复后将自动同步');
      console.log('错误处理完成，即将返回');
      return;
    }
  }, [conversations, currentConversationId, user, isOnline, isOfflineMode, setConversations, setCurrentConversationId, setIsOfflineMode, recordOfflineChange, saveToOfflineStorage]);

  // 编辑消息并重新生成回复
  const editMessage = useCallback(async (messageId: string, newContent: string) => {
    try {
      // 参数验证
      if (!messageId || typeof messageId !== 'string') {
        toast.error('无效的消息ID');
        return;
      }
      
      if (!newContent || typeof newContent !== 'string' || !newContent.trim()) {
        toast.error('消息内容不能为空');
        return;
      }
      
      if (!currentConversation) {
        toast.warning('没有选中的对话');
        return;
      }
      
      if (isLoading) {
        toast.warning('正在处理其他请求，请稍后再试');
        return;
      }

      // 找到要编辑的消息
      const messageIndex = currentConversation.messages.findIndex(m => m.id === messageId);
      if (messageIndex === -1) {
        toast.warning('消息不存在或已被删除');
        return;
      }
      
      if (currentConversation.messages[messageIndex].role !== 'user') {
        toast.warning('只能编辑用户发送的消息');
        return;
      }

      // 移除该消息之后的所有消息
      const messagesBefore = currentConversation.messages.slice(0, messageIndex);
      const editedMessage = { ...currentConversation.messages[messageIndex], content: newContent };
      
      // 创建临时更新函数以减少代码重复，增加错误处理
      const updateConversations = (updater: (conv: Conversation) => Conversation) => {
        try {
          const updatedConversations = conversations.map(c =>
            c.id === currentConversation.id ? updater(c) : c
          );
          setConversations(updatedConversations);
          
          // 单独捕获saveConversations的错误
          try {
            saveConversations(updatedConversations);
          } catch (saveError) {
            console.error('Failed to save conversations after update:', saveError);
            // 不中断流程，但记录错误
          }
          
          return true;
        } catch (error) {
          console.error('Failed to update conversations:', error);
          return false;
        }
      };

      // 保存原始状态用于可能的回滚
      const originalConversations = [...conversations];

      // 更新对话，移除编辑消息后的内容
      if (!updateConversations(c => ({
        ...c,
        messages: [...messagesBefore, editedMessage],
        updatedAt: Date.now()
      }))) {
        toast.error('更新对话失败');
        return;
      }

      // 创建新的assistant消息
      let assistantMessage: ChatMessage;
      try {
        assistantMessage = {
          id: `msg-${Date.now() + 1}-${Math.random().toString(36).substr(2, 9)}`,
          role: 'assistant',
          content: '',
          timestamp: Date.now()
        };
      } catch (messageError) {
        console.error('Failed to create assistant message:', messageError);
        toast.error('创建AI回复消息失败');
        // 回滚到原始状态
        setConversations(originalConversations);
        return;
      }

      // 添加新的assistant消息
      if (!updateConversations(c => ({
        ...c,
        messages: [...messagesBefore, editedMessage, assistantMessage]
      }))) {
        toast.error('添加AI回复占位符失败');
        setConversations(originalConversations);
        return;
      }

      // 设置加载状态
      setIsLoading(true);
      
      // 创建中止控制器
      if (!abortControllerRef.current) {
        abortControllerRef.current = new AbortController();
      }

      // 获取活跃模型
      const activeModel = getActiveModel();
      if (!activeModel) {
        toast.error('请先配置AI模型');
        setIsLoading(false);
        // 移除assistant消息
        updateConversations(c => ({
          ...c,
          messages: c.messages.filter(m => m.id !== assistantMessage.id)
        }));
        return;
      }

      try {
        await sendChatStream({
          endpoint: activeModel.apiUrl,
          apiKey: activeModel.apiKey,
          modelConfig: activeModel,
          messages: [...messagesBefore, editedMessage],
          onUpdate: (content: string) => {
            try {
              updateConversations(c => ({
                ...c,
                messages: c.messages.map(m =>
                  m.id === assistantMessage.id ? { ...m, content } : m
                )
              }));
            } catch (updateError) {
              console.error('Failed to update message content:', updateError);
              // 继续执行，不中断流式响应
            }
          },
          onComplete: async () => {
            try {
              setIsLoading(false);
              abortControllerRef.current = null;
              
              // 根据用户和在线状态处理数据库更新
              if (user) {
                // 获取更新后的对话
                const updatedConversation = conversations.find(c => c.id === currentConversation.id);
                if (!updatedConversation) {
                  console.error('Updated conversation not found after edit');
                  return;
                }
                
                if (!isOnline || isOfflineMode) {
                  // 离线模式：记录变更
                  try {
                    recordOfflineChange(user.id, {
                      type: 'update_messages',
                      conversationId: currentConversation.id,
                      messages: updatedConversation.messages
                    });
                    toast.info('消息已编辑并重新生成回复（离线模式），网络恢复后将自动同步');
                  } catch (recordError) {
                    console.error('Failed to record offline change:', recordError);
                    toast.warning('消息已编辑，但无法记录离线变更');
                  }
                  return;
                }
                
                // 在线模式：更新数据库
                try {
                  await conversationService.updateConversation(
                    currentConversation.id,
                    user.id,
                    { updatedAt: Date.now() }
                  );
                  // 消息需要通过messageService单独处理
                } catch (dbError) {
                  console.error('Failed to update edited messages in database:', dbError);
                  // 数据库更新失败，切换到离线模式
                  try {
                    setIsOfflineMode(true);
                    recordOfflineChange(user.id, {
                      type: 'update_messages',
                      conversationId: currentConversation.id,
                      messages: updatedConversation.messages
                    });
                    toast.info('切换到离线模式，消息已编辑并重新生成回复');
                  } catch (fallbackError) {
                    console.error('Failed to switch to offline mode:', fallbackError);
                    toast.warning('消息已编辑，但数据库同步失败');
                  }
                }
              }
            } catch (completeError) {
              console.error('Error in onComplete handler:', completeError);
              setIsLoading(false);
              abortControllerRef.current = null;
            }
          },
          onError: (error: Error) => {
            try {
              setIsLoading(false);
              abortControllerRef.current = null;
              toast.error('编辑后发送失败', {
                description: error.message || '请检查模型配置或稍后重试'
              });
              // 移除assistant消息
              updateConversations(c => ({
                ...c,
                messages: c.messages.filter(m => m.id !== assistantMessage.id)
              }));
            } catch (errorHandlerError) {
              console.error('Error in onError handler:', errorHandlerError);
              setIsLoading(false);
              abortControllerRef.current = null;
            }
          },
          signal: abortControllerRef.current.signal
        });
      } catch (error) {
        console.error('Edit message error:', error);
        setIsLoading(false);
        abortControllerRef.current = null;
        // 尝试恢复到编辑后的状态，但不包含未完成的assistant消息
        updateConversations(c => ({
          ...c,
          messages: [...messagesBefore, editedMessage],
          updatedAt: Date.now()
        }));
        toast.error('编辑消息时发生错误，请稍后重试');
      }
    } catch (criticalError) {
      console.error('Critical error in editMessage:', criticalError);
      setIsLoading(false);
      abortControllerRef.current = null;
      toast.error('发生严重错误，请刷新页面后重试');
    }
  }, [currentConversation, isLoading, conversations, user, isOnline, isOfflineMode, saveConversations, recordOfflineChange]);

  const deleteMessage = useCallback(async (messageId: string) => {
    try {
      // 参数验证
      if (!messageId || typeof messageId !== 'string') {
        toast.error('无效的消息ID');
        return;
      }
      
      if (!currentConversation) {
        toast.warning('没有选中的对话');
        return;
      }

      // 检查消息是否存在
      const messageExists = currentConversation.messages.some(m => m.id === messageId);
      if (!messageExists) {
        toast.warning('消息不存在或已被删除');
        return;
      }

      try {
        // 计算要删除的消息索引范围
        let updatedConversations: Conversation[];
        try {
          updatedConversations = conversations.map(c => {
            if (c.id !== currentConversation.id) return c;

            const msgs = c.messages;
            const index = msgs.findIndex(m => m.id === messageId);
            if (index === -1) return c;

            const target = msgs[index];
            let newMessages = [...msgs];

            if (target.role === 'user') {
              // 🔹 如果删除的是用户消息，且下一条是 assistant，则一起删除
              if (msgs[index + 1] && msgs[index + 1].role === 'assistant') {
                newMessages.splice(index, 2);
              } else {
                newMessages.splice(index, 1);
              }
            } else if (target.role === 'assistant') {
              // 🔹 如果删除的是 AI 消息，且前一条是 user，则一起删除
              if (msgs[index - 1] && msgs[index - 1].role === 'user') {
                newMessages.splice(index - 1, 2);
              } else {
                newMessages.splice(index, 1);
              }
            }

            return {
              ...c,
              messages: newMessages,
              updatedAt: Date.now(),
            };
          });
        } catch (mapError) {
          console.error('Failed to compute updated conversations:', mapError);
          toast.error('处理消息删除失败');
          return;
        }

        // 更新本地状态
        const originalConversations = [...conversations]; // 保存原始状态用于回滚
        try {
          setConversations(updatedConversations);
          
          // 单独捕获saveConversations的错误
          try {
            await saveConversations(updatedConversations);
          } catch (saveError) {
            console.error('Failed to save conversations after message deletion:', saveError);
            toast.warning('消息已删除，但保存失败');
            // 继续执行，不中断流程
          }
        } catch (stateError) {
          console.error('Failed to update conversation state:', stateError);
          // 尝试回滚状态
          try {
            setConversations(originalConversations);
          } catch (rollbackError) {
            console.error('Failed to rollback state:', rollbackError);
          }
          toast.error('更新对话状态失败');
          return;
        }
      
        // 根据用户和在线状态处理数据库更新
        if (user) {
          const updatedConversation = updatedConversations.find(c => c.id === currentConversation.id);
          if (!updatedConversation) {
            console.error('Updated conversation not found after deletion');
            toast.error('处理删除结果失败');
            return;
          }
          
          if (!isOnline || isOfflineMode) {
            // 离线模式：记录变更
            try {
              recordOfflineChange(user.id, {
                type: 'update_messages',
                conversationId: currentConversation.id,
                messages: updatedConversation.messages
              });
              toast.info('消息已删除（离线模式），网络恢复后将自动同步');
            } catch (recordError) {
              console.error('Failed to record offline change for message deletion:', recordError);
              toast.warning('消息已删除，但无法记录离线变更');
            }
            return;
          }
          
          // 在线模式：更新数据库
          try {
            await conversationService.updateConversation(
              currentConversation.id,
              user.id,
              { updatedAt: Date.now() }
            );
            // 消息需要通过messageService单独处理
          } catch (dbError) {
            console.error('Failed to delete messages from database:', dbError);
            // 数据库更新失败，切换到离线模式
            try {
              setIsOfflineMode(true);
              recordOfflineChange(user.id, {
                type: 'update_messages',
                conversationId: currentConversation.id,
                messages: updatedConversation.messages
              });
              toast.info('切换到离线模式，消息已删除');
            } catch (fallbackError) {
              console.error('Failed to switch to offline mode after db error:', fallbackError);
              toast.error('消息已删除，但数据库同步失败');
            }
          }
        }
      } catch (error) {
        console.error('Failed to delete message:', error);
        toast.error('删除消息失败');
      }
    } catch (criticalError) {
      console.error('Critical error in deleteMessage:', criticalError);
      toast.error('发生严重错误，请刷新页面后重试');
    }
  }, [currentConversation, conversations, user, isOnline, isOfflineMode, saveConversations, recordOfflineChange]);


  return {
    conversations,
    currentConversation,
    currentConversationId,
    isLoading,
    isLoadingConversations,
    setCurrentConversationId,
    createNewConversation,
    deleteConversation,
    updateConversationTitle,
    clearConversation,
    sendMessage,
    stopGeneration,
    exportConversation,
    retryMessage,
    branchConversation,
    editMessage,
    deleteMessage,
    deleteConversations
  };
};