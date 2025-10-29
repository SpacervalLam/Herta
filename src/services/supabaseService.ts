import { createClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

// 生成UUID函数
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// 从环境变量获取Supabase配置
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Supabase URL and anon key must be set in environment variables');
}

// 创建Supabase客户端实例
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// 用户认证状态钩子
export const useAuth = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 检查当前会话状态
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setLoading(false);
    };

    checkSession();

    // 监听认证状态变化
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  return {
    session,
    user: session?.user || null,
    loading,
    isAuthenticated: !!session,
  };
};

// 对话相关的数据库操作
export const conversationService = {
  // 获取用户的所有对话
  getConversations: async (userId: string) => {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  // 获取单个对话
  getConversation: async (conversationId: string, userId: string) => {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single();

    // 处理记录不存在的情况 (PGRST116)
    if (error) {
      if (error.code === 'PGRST116') {
        // 记录不存在，返回null而不是抛出错误
        return null;
      }
      throw error;
    }
    return data;
  },

  // 创建新对话
  // 确保用户记录存在于users表中
  ensureUserExists: async (userId: string, email?: string, name?: string) => {
    // 检查用户是否已存在
    const { data: existingUser, error: findError } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();

    if (findError && findError.code !== 'PGRST116') { // PGRST116表示记录不存在
      throw findError;
    }

    // 如果用户不存在，创建用户记录
    if (!existingUser) {
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          id: userId,
          email,
          name,
          created_at: new Date(),
          updated_at: new Date()
        });

      if (insertError) {
        throw insertError;
      }
    }
  },

  createConversation: async (conversation: {
    userId: string;
    title: string;
    createdAt: number | Date;
    updatedAt: number | Date;
    userEmail?: string;
    userName?: string;
  }) => {
    // 确保用户记录存在
    await conversationService.ensureUserExists(
      conversation.userId,
      conversation.userEmail,
      conversation.userName
    );
    
    // 生成UUID作为对话ID
    const conversationId = generateUUID();
    
    const { data, error } = await supabase
      .from('conversations')
      .insert({
        id: conversationId,
        user_id: conversation.userId,
        title: conversation.title,
        created_at: conversation.createdAt instanceof Date ? conversation.createdAt : new Date(conversation.createdAt),
        updated_at: conversation.updatedAt instanceof Date ? conversation.updatedAt : new Date(conversation.updatedAt),
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // 更新对话
  updateConversation: async (
    conversationId: string,
    userId: string,
    updates: Partial<{
      title: string;
      updatedAt: number | Date;
      syncVersion: number;
      lastAccessedAt: number | Date;
    }>
  ) => {
    const { data, error } = await supabase
      .from('conversations')
      .update({
        title: updates.title,
        updated_at: updates.updatedAt ? (updates.updatedAt instanceof Date ? updates.updatedAt : new Date(updates.updatedAt)) : undefined,
        sync_version: updates.syncVersion,
        last_accessed_at: updates.lastAccessedAt ? (updates.lastAccessedAt instanceof Date ? updates.lastAccessedAt : new Date(updates.lastAccessedAt)) : undefined,
      })
      .eq('id', conversationId)
      .eq('user_id', userId)
      .select()
      .single();

    // 处理记录不存在的情况 (PGRST116)
    if (error) {
      if (error.code === 'PGRST116') {
        // 记录不存在，返回null而不是抛出错误
        return null;
      }
      throw error;
    }
    return data;
  },

  // 删除对话
  deleteConversation: async (conversationId: string, userId: string) => {
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId)
      .eq('user_id', userId);

    if (error) throw error;
  },

  // 批量删除对话
  deleteConversations: async (conversationIds: string[], userId: string) => {
    if (conversationIds.length === 0) return;
    
    const { error } = await supabase
      .from('conversations')
      .delete()
      .in('id', conversationIds)
      .eq('user_id', userId);

    if (error) throw error;
  },
};

// 消息相关的数据库操作
export const messageService = {
  // 获取对话的所有消息
  getMessages: async (conversationId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: true });

    if (error) throw error;
    return data;
  },

  // 创建新消息
  createMessage: async (message: {
    conversationId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    modelName?: string;
    modelId?: string;
  }) => {
    // 生成UUID作为消息ID
    const messageId = generateUUID();
    
    const { data, error } = await supabase
      .from('messages')
      .insert({
        id: messageId,
        conversation_id: message.conversationId,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp,
        model_name: message.modelName,
        model_id: message.modelId,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // 更新消息
  updateMessage: async (
    messageId: string,
    updates: Partial<{
      content: string;
      modelName: string;
      modelId: string;
    }>
  ) => {
    const { data, error } = await supabase
      .from('messages')
      .update({
        content: updates.content,
        model_name: updates.modelName,
        model_id: updates.modelId,
      })
      .eq('id', messageId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // 删除消息
  deleteMessage: async (messageId: string) => {
    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId);

    if (error) throw error;
  },
};

// 附件相关的数据库操作
export const attachmentService = {
  // 获取消息的所有附件
  getAttachments: async (messageId: string) => {
    const { data, error } = await supabase
      .from('attachments')
      .select('*')
      .eq('message_id', messageId);

    if (error) throw error;
    return data;
  },

  // 创建新附件
  createAttachment: async (attachment: {
    messageId: string;
    type: 'image' | 'audio' | 'video';
    url: string;
    fileName?: string;
    fileSize?: number;
    storageKey?: string;
  }) => {
    // 生成UUID作为附件ID
    const attachmentId = generateUUID();
    
    const { data, error } = await supabase
      .from('attachments')
      .insert({
        id: attachmentId,
        message_id: attachment.messageId,
        type: attachment.type,
        url: attachment.url,
        file_name: attachment.fileName,
        file_size: attachment.fileSize,
        storage_key: attachment.storageKey,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // 删除附件
  deleteAttachment: async (attachmentId: string) => {
    const { error } = await supabase
      .from('attachments')
      .delete()
      .eq('id', attachmentId);

    if (error) throw error;
  },
};

// 文件上传服务
export const storageService = {
  // 上传文件到Supabase Storage
  uploadFile: async (file: File, userId: string, folder?: string) => {
    const timestamp = Date.now();
    const fileName = `${timestamp}-${file.name}`;
    const path = folder ? `${folder}/${fileName}` : fileName;
    const fullPath = `users/${userId}/${path}`;

    const { error } = await supabase.storage
      .from('attachments')
      .upload(fullPath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) throw error;

    // 获取公共URL
    const { data: { publicUrl } } = supabase.storage
      .from('attachments')
      .getPublicUrl(fullPath);

    return {
      publicUrl,
      storageKey: fullPath,
    };
  },

  // 删除文件
  deleteFile: async (storageKey: string) => {
    const { error } = await supabase.storage
      .from('attachments')
      .remove([storageKey]);

    if (error) throw error;
  },
};