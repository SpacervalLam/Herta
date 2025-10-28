import { useState, useEffect, useCallback } from 'react';
import { conversationService, supabase } from '@/services/supabaseService';
import { toast } from 'sonner';
// 删除未使用的导入

const OFFLINE_STORAGE_KEY = 'offline-changes';

// 定义迁移状态接口
interface MigrationStatus {
  isMigrating: boolean;
  progress: number;
  total: number;
  lastError: string | null;
  completed: boolean;
}

// 定义对话和消息的接口
export interface LocalMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  updatedAt?: string;
  attachments?: any[];
}

export interface LocalConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: LocalMessage[];
}

export const useOfflineManager = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus>({
    isMigrating: false,
    progress: 0,
    total: 0,
    lastError: null,
    completed: false
  });

  // 监听网络状态变化
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 保存离线数据
  const saveOfflineData = useCallback((dataType: string, data: any) => {
    try {
      const offlineData = JSON.parse(localStorage.getItem(OFFLINE_STORAGE_KEY) || '{}');
      offlineData[dataType] = {
        data,
        timestamp: Date.now()
      };
      localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(offlineData));
    } catch (error) {
      console.error('Failed to save offline data:', error);
    }
  }, []);

  // 获取离线数据
  const getOfflineData = useCallback((dataType: string) => {
    try {
      const offlineData = JSON.parse(localStorage.getItem(OFFLINE_STORAGE_KEY) || '{}');
      return offlineData[dataType] || null;
    } catch (error) {
      console.error('Failed to get offline data:', error);
      return null;
    }
  }, []);

  // 同步离线变更到数据库
  const syncOfflineChanges = useCallback(async (userId: string) => {
    try {
      // 生成UUID的辅助函数
      const generateUUID = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      };

      // 检查字符串是否为有效的UUID格式
      const isUUID = (str: string) => {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        return uuidRegex.test(str);
      };
      
      const offlineData = JSON.parse(localStorage.getItem(OFFLINE_STORAGE_KEY) || '{}');
      let hasSyncedChanges = false;

      // 同步对话数据
      if (offlineData.conversations) {
        const { data: conversations } = offlineData.conversations;
        
        // 遍历所有对话并保存到数据库
        for (const conversation of conversations) {
          // 为非UUID格式的ID生成新的UUID
          const conversationId = isUUID(conversation.id) ? conversation.id : generateUUID();
          
          try {
            // 尝试更新对话
            await conversationService.updateConversation(conversationId, userId, {
              ...conversation,
              id: conversationId // 确保使用正确的ID
            });
          } catch (updateError) {
            console.error(`Failed to update conversation ${conversation.id}:`, updateError);
            // 如果更新失败，尝试创建新对话
            try {
              const { error: createError } = await supabase
                .from('conversations')
                .insert({
                  id: conversationId,
                  user_id: userId,
                  title: conversation.title,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  is_saved: conversation.isSaved ?? true
                })
                .select()
                .single();
              
              if (createError) {
                console.error(`Failed to create conversation ${conversation.id}:`, createError);
              }
            } catch (createError) {
              console.error(`Error handling conversation ${conversation.id}:`, createError);
            }
          }
        }
        
        // 清理已同步的数据
        delete offlineData.conversations;
        hasSyncedChanges = true;
      }

      // 如果有变更，更新localStorage并显示成功消息
      if (hasSyncedChanges) {
        localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(offlineData));
        toast.success('已同步离线数据');
      }
    } catch (error) {
      console.error('Failed to sync offline changes:', error);
      toast.error('同步离线数据失败');
    }
  }, []);

  // 从localStorage读取所有对话
  const getAllLocalConversations = useCallback((): LocalConversation[] => {
    try {
      // 尝试不同的localStorage键名模式
      const potentialKeys = [
        'chat_conversations',
        'conversations',
        'ai_conversations',
        'herta_conversations',
        'ai-chat-conversations'
      ];

      for (const key of potentialKeys) {
        const conversationsData = localStorage.getItem(key);
        if (conversationsData) {
          return JSON.parse(conversationsData);
        }
      }

      // 如果没有找到标准格式，尝试扫描所有键
      const allKeys = Object.keys(localStorage);
      const conversations: LocalConversation[] = [];

      for (const key of allKeys) {
        try {
          const item = localStorage.getItem(key);
          if (item) {
            const data = JSON.parse(item);
            // 检查是否是对话对象或对话数组
            if (Array.isArray(data)) {
              // 检查数组中的第一项是否具有对话的基本属性
              if (data.length > 0 && data[0].id && data[0].messages && Array.isArray(data[0].messages)) {
                return data as LocalConversation[];
              }
            } else if (typeof data === 'object' && data.id && data.messages && Array.isArray(data.messages)) {
              conversations.push(data as LocalConversation);
            }
          }
        } catch (e) {
          // 忽略解析错误
        }
      }

      return conversations;
    } catch (error) {
      console.error('Error reading conversations from localStorage:', error);
      return [];
    }
  }, []);

  // 检查并迁移localStorage中的历史数据
  const migrateLocalStorageData = useCallback(async (userId: string) => {
    setMigrationStatus({
      isMigrating: true,
      progress: 0,
      total: 0,
      lastError: null,
      completed: false
    });

    try {
      // 1. 从localStorage读取所有对话
      const localConversations = getAllLocalConversations();
      
      if (localConversations.length === 0) {
        console.log('No conversations found in localStorage to migrate');
        setMigrationStatus({
          isMigrating: false,
          progress: 0,
          total: 0,
          lastError: null,
          completed: true
        });
        return true;
      }

      setMigrationStatus(prev => ({ ...prev, total: localConversations.length }));
      
      // 2. 检查迁移标记，避免重复迁移
      const migrationKey = `migration_completed_${userId}`;
      const alreadyMigrated = localStorage.getItem(migrationKey) === 'true';
      
      if (alreadyMigrated) {
        console.log('Data already migrated for this user');
        setMigrationStatus({
          isMigrating: false,
          progress: localConversations.length,
          total: localConversations.length,
          lastError: null,
          completed: true
        });
        return true;
      }

      // 生成UUID的辅助函数
      const generateUUID = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      };

      // 检查字符串是否为有效的UUID格式
      const isUUID = (str: string) => {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        return uuidRegex.test(str);
      };

      // 3. 开始迁移每个对话
      for (let i = 0; i < localConversations.length; i++) {
        const conversation = localConversations[i];
        
        try {
          // 为非UUID格式的ID生成新的UUID
          const conversationId = isUUID(conversation.id) ? conversation.id : generateUUID();
          
          // 插入对话记录
          const { error: convError } = await supabase
            .from('conversations')
            .insert({
              id: conversationId,
              user_id: userId,
              title: conversation.title,
              created_at: new Date(conversation.createdAt).toISOString(),
              updated_at: new Date(conversation.updatedAt).toISOString()
            })
            .select()
            .single();

          if (convError) {
            console.error('Error inserting conversation:', convError);
            throw convError;
          }

          // 插入消息记录
          for (const message of conversation.messages) {
            // 确保消息有ID，并且是有效的UUID格式
            let messageId = message.id;
            if (!messageId || !isUUID(messageId)) {
              messageId = generateUUID();
            }
            
            const { error: msgError } = await supabase
              .from('messages')
              .insert({
                id: messageId,
                conversation_id: conversationId, // 使用新生成的对话UUID
                user_id: userId,
                role: message.role,
                content: message.content,
                created_at: new Date(message.createdAt).toISOString(),
                updated_at: message.updatedAt ? new Date(message.updatedAt).toISOString() : new Date(message.createdAt).toISOString()
              });

            if (msgError) {
              console.error('Error inserting message:', msgError);
              // 继续迁移其他消息，不中断整个对话的迁移
            }

            // 插入附件（如果有）
            if (message.attachments && message.attachments.length > 0) {
              for (const attachment of message.attachments) {
                const { error: attachError } = await supabase
                  .from('attachments')
                  .insert({
                    message_id: messageId,
                    conversation_id: conversationId, // 使用新生成的对话UUID
                    user_id: userId,
                    file_name: attachment.name || 'attachment',
                    file_type: attachment.type || 'unknown',
                    file_size: attachment.size || 0,
                    file_url: attachment.url || '',
                    created_at: new Date(message.createdAt).toISOString()
                  });

                if (attachError) {
                  console.error('Error inserting attachment:', attachError);
                }
              }
            }
          }

          // 更新进度
          setMigrationStatus(prev => ({ ...prev, progress: i + 1 }));
        } catch (convError) {
          console.error(`Error migrating conversation ${conversation.id}:`, convError);
          // 记录错误但继续迁移其他对话
          setMigrationStatus(prev => ({
            ...prev,
            lastError: convError instanceof Error ? convError.message : '迁移对话时出错',
            progress: i + 1 // 即使出错也标记为已处理
          }));
        }
      }

      // 4. 标记迁移完成
      localStorage.setItem(migrationKey, 'true');
      setMigrationStatus(prev => ({ ...prev, completed: true }));
      
      // 迁移成功后显示提示
      toast.success(`成功迁移 ${localConversations.length} 个历史对话`);
      
      // 5. 可选：提供用户选择是否清理localStorage
      // 在实际应用中，可以通过UI提示用户选择
      // localStorage.removeItem('ai-chat-conversations');
      
      return true;
    } catch (error) {
      console.error('Overall migration error:', error);
      setMigrationStatus(prev => ({
        ...prev,
        lastError: error instanceof Error ? error.message : '未知迁移错误',
        isMigrating: false
      }));
      toast.error('迁移历史记录失败');
      return false;
    } finally {
      setMigrationStatus(prev => ({ ...prev, isMigrating: false }));
    }
  }, [getAllLocalConversations]);

  // 记录离线变更
  const recordOfflineChange = useCallback((userId: string, change: any) => {
    try {
      const changesKey = `${userId}_offline_changes`;
      const changes = JSON.parse(localStorage.getItem(changesKey) || '[]');
      changes.push({
        ...change,
        timestamp: new Date().toISOString()
      });
      localStorage.setItem(changesKey, JSON.stringify(changes));
      return true;
    } catch (error) {
      console.error('Error recording offline change:', error);
      return false;
    }
  }, []);

  // 清理localStorage中的历史数据（用户确认后）
  const clearLocalStorageData = useCallback(() => {
    try {
      const potentialKeys = [
        'chat_conversations',
        'conversations',
        'ai_conversations',
        'herta_conversations',
        'ai-chat-conversations'
      ];

      for (const key of potentialKeys) {
        localStorage.removeItem(key);
      }

      return true;
    } catch (error) {
      console.error('Error clearing localStorage data:', error);
      return false;
    }
  }, []);

  return {
    isOnline,
    saveOfflineData,
    getOfflineData,
    syncOfflineChanges,
    migrateLocalStorageData,
    migrationStatus,
    recordOfflineChange,
    clearLocalStorageData
  };
};