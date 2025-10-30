import { createClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

// 生成UUID函数
export const generateUUID = () => {
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
    console.log('开始获取用户对话列表', { userId });
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('获取用户对话列表失败', { userId, error });
      throw error;
    }
    console.log('获取用户对话列表成功', { userId, conversationCount: data?.length || 0 });
    return data;
  },

  // 获取单个对话
  getConversation: async (conversationId: string, userId: string) => {
    console.log('开始获取单个对话', { userId, conversationId });
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        console.log('对话不存在', { userId, conversationId });
        return null;
      }
      console.error('获取单个对话失败', { userId, conversationId, error });
      throw error;
    }
    console.log('获取单个对话成功', { userId, conversationId });
    return data;
  },

  // 创建新对话
  createConversation: async (userId: string, title: string) => {
    console.log('开始创建新对话', { userId, title });
    // 生成UUID作为对话ID
    const conversationId = generateUUID();
    
    const { data, error } = await supabase
      .from('conversations')
      .insert({
        id: conversationId,
        user_id: userId,
        title: title,
        created_at: new Date(),
        updated_at: new Date()
      })
      .select()
      .single();

    if (error) {
      console.error('创建对话失败', { userId, title, conversationId, error });
      throw error;
    }
    console.log('创建对话成功', { userId, conversationId, title });
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
    console.log('开始更新对话', { userId, conversationId, updates });
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
        console.log('更新对话失败: 对话不存在', { userId, conversationId });
        return null;
      }
      console.error('更新对话失败', { userId, conversationId, updates, error });
      throw error;
    }
    console.log('更新对话成功', { userId, conversationId, title: updates.title });
    return data;
  },

  // 删除对话
  deleteConversation: async (conversationId: string, userId: string) => {
    console.log('开始删除对话', { userId, conversationId });
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId)
      .eq('user_id', userId);

    if (error) {
      console.error('删除对话失败', { userId, conversationId, error });
      throw error;
    }
    console.log('删除对话成功', { userId, conversationId });
  },

  // 批量删除对话
  deleteConversations: async (conversationIds: string[], userId: string) => {
    console.log('开始批量删除对话', { userId, conversationCount: conversationIds.length, conversationIds });
    if (conversationIds.length === 0) {
      console.log('批量删除对话: 对话ID列表为空', { userId });
      return;
    }
    
    const { error } = await supabase
      .from('conversations')
      .delete()
      .in('id', conversationIds)
      .eq('user_id', userId);

    if (error) {
      console.error('批量删除对话失败', { userId, conversationCount: conversationIds.length, error });
      throw error;
    }
    console.log('批量删除对话成功', { userId, deletedCount: conversationIds.length });
  },
};

// 消息相关的数据库操作
export const messageService = {
  // 获取对话的所有消息
  getMessages: async (conversationId: string) => {
    console.log('开始获取对话消息', { conversationId });
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: true });

    if (error) {
      console.error('获取对话消息失败', { conversationId, error });
      throw error;
    }
    console.log('获取对话消息成功', { conversationId, messageCount: data?.length || 0 });
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
    console.log('开始创建新消息', { conversationId: message.conversationId, role: message.role, contentPreview: message.content.substring(0, 100) + (message.content.length > 100 ? '...' : '') });
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

    if (error) {
      console.error('创建消息失败', { conversationId: message.conversationId, messageId, error });
      throw error;
    }
    console.log('创建消息成功', { messageId, conversationId: message.conversationId, role: message.role });
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
    console.log('开始更新消息', { messageId, updates });
    const { data, error } = await supabase
      .from('messages')
      .update({
        content: updates.content,
        model_name: updates.modelName,
        model_id: updates.modelId,
      })
      .eq('id', messageId)
      .select();

    if (error) {
      console.error('更新消息失败', { messageId, updates, error });
      throw error;
    }
    
    // 检查是否找到并更新了消息
    if (!data || data.length === 0) {
      console.log('更新消息失败: 消息不存在', { messageId });
      return null;
    }
    
    console.log('更新消息成功', { messageId });
    return data[0];
  },

  // 删除消息
  deleteMessage: async (messageId: string) => {
    console.log('开始删除消息', { messageId });
    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId);

    if (error) {
      console.error('删除消息失败', { messageId, error });
      throw error;
    }
    console.log('删除消息成功', { messageId });
  },
};

// 附件相关的数据库操作
export const attachmentService = {
  // 获取消息的所有附件
  getAttachments: async (messageId: string) => {
    console.log('开始获取消息附件', { messageId });
    const { data, error } = await supabase
      .from('attachments')
      .select('*')
      .eq('message_id', messageId);

    if (error) {
      console.error('获取消息附件失败', { messageId, error });
      throw error;
    }
    console.log('获取消息附件成功', { messageId, attachmentCount: data?.length || 0 });
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
    console.log('开始创建新附件', { messageId: attachment.messageId, type: attachment.type, fileName: attachment.fileName, fileSize: attachment.fileSize });
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

    if (error) {
      console.error('创建附件失败', { messageId: attachment.messageId, attachmentId, error });
      throw error;
    }
    console.log('创建附件成功', { attachmentId, messageId: attachment.messageId, type: attachment.type });
    return data;
  },

  // 删除附件
  deleteAttachment: async (attachmentId: string) => {
    console.log('开始删除附件', { attachmentId });
    const { error } = await supabase
      .from('attachments')
      .delete()
      .eq('id', attachmentId);

    if (error) {
      console.error('删除附件失败', { attachmentId, error });
      throw error;
    }
    console.log('删除附件成功', { attachmentId });
  },
};

// API Key相关的数据库操作
export const apiKeyService = {
  // 获取用户的所有API Key配置
  getModelConfigs: async (userId: string) => {
    console.log('开始获取用户模型配置列表', { userId });
    const { data, error } = await supabase
      .from('model_configs')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.error('获取用户模型配置列表失败', { userId, error });
      throw error;
    }
    console.log('获取用户模型配置列表成功', { userId, configCount: data?.length || 0 });
    return data;
  },

  // 获取单个API Key配置
  getModelConfig: async (modelId: string, userId: string) => {
    console.log('开始获取单个模型配置', { userId, modelId });
    try {
      const { data, error } = await supabase
        .from('model_configs')
        .select('*')
        .eq('id', modelId)
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // 记录但不抛出错误，返回null表示配置不存在
          console.log('获取模型配置: 配置不存在', { modelId, userId });
          return null;
        }
        // 其他错误需要抛出
        throw new Error(`获取模型配置失败: ${error.message || '未知数据库错误'}`);
      }
      console.log('获取单个模型配置成功', { userId, modelId, modelName: data.name });
      return data;
    } catch (error) {
      console.error('数据库操作失败 - 获取模型配置:', {
        error: error,
        userId: userId,
        modelId: modelId
      });
      throw error;
    }
  },

  // 创建或更新API Key配置
  saveModelConfig: async (config: any, userId: string) => {
    console.log('开始保存模型配置', { userId, modelId: config.id, modelName: config.name, modelType: config.modelType });
    try {
      // 检查是否已存在
      const existingConfig = await apiKeyService.getModelConfig(config.id, userId);
      
      if (existingConfig) {
        // 更新现有配置
        console.log('开始更新现有模型配置', { userId, modelId: config.id });
        const { data, error } = await supabase
          .from('model_configs')
          .update({
            name: config.name,
            model_type: config.modelType,
            api_url: config.apiUrl,
            api_key: config.apiKey,
            model_name: config.modelName,
            description: config.description,
            max_tokens: config.maxTokens,
            temperature: config.temperature,
            enabled: config.enabled,
            updated_at: new Date(),
            supports_multimodal: config.supportsMultimodal,
            custom_request_config: config.customRequestConfig,
          })
          .eq('id', config.id)
          .eq('user_id', userId)
          .select()
          .single();

        if (error) {
          // 提供更具体的错误信息
          console.error('更新模型配置失败', { userId, modelId: config.id, error });
          if (error.code === 'PGRST116') {
            throw new Error('更新模型配置失败: 记录不存在');
          } else if (error.code === '23503') {
            throw new Error('更新模型配置失败: 用户记录不存在');
          } else if (error.code === '23505') {
            throw new Error('更新模型配置失败: 配置ID或名称重复');
          }
          throw new Error(`更新模型配置失败: ${error.message || '未知数据库错误'}`);
        }
        console.log('更新模型配置成功', { userId, modelId: config.id, modelName: config.name });
        return data;
      } else {
        // 创建新配置
        console.log('开始创建新模型配置', { userId, modelId: config.id });
        const { data, error } = await supabase
          .from('model_configs')
          .insert({
            id: config.id,
            user_id: userId,
            name: config.name,
            model_type: config.modelType,
            api_url: config.apiUrl,
            api_key: config.apiKey,
            model_name: config.modelName,
            description: config.description,
            max_tokens: config.maxTokens,
            temperature: config.temperature,
            enabled: config.enabled,
            created_at: new Date(config.createdAt || Date.now()),
            updated_at: new Date(),
            supports_multimodal: config.supportsMultimodal,
            custom_request_config: config.customRequestConfig,
          })
          .select()
          .single();

        if (error) {
          // 提供更具体的错误信息
          console.error('创建模型配置失败', { userId, modelId: config.id, error });
          if (error.code === '23503') {
            throw new Error('创建模型配置失败: 用户记录不存在');
          } else if (error.code === '23505') {
            throw new Error('创建模型配置失败: 配置ID或名称重复');
          }
          throw new Error(`创建模型配置失败: ${error.message || '未知数据库错误'}`);
        }
        console.log('创建模型配置成功', { userId, modelId: config.id, modelName: config.name });
        return data;
      }
    } catch (error) {
      // 记录详细错误信息
      console.error('数据库操作失败 - 保存模型配置:', {
        error: error,
        userId: userId,
        modelId: config?.id,
        operation: 'update' // 默认值
      });
      throw error;
    }
  },

  // 删除API Key配置
  deleteModelConfig: async (modelId: string, userId: string) => {
    console.log('开始删除模型配置', { userId, modelId });
    const { error } = await supabase
      .from('model_configs')
      .delete()
      .eq('id', modelId)
      .eq('user_id', userId);

    if (error) {
      console.error('删除模型配置失败', { userId, modelId, error });
      throw error;
    }
    console.log('删除模型配置成功', { userId, modelId });
  },

  // 设置活动模型
  setActiveModel: async (modelId: string, userId: string) => {
    console.log('开始设置活动模型', { userId, modelId });
    // 先更新所有模型为非活动状态
    console.log('开始将所有模型设置为非活动状态', { userId });
    await supabase
      .from('model_configs')
      .update({ is_active: false })
      .eq('user_id', userId);

    // 设置指定模型为活动状态
    console.log('开始设置指定模型为活动状态', { userId, modelId });
    const { data, error } = await supabase
      .from('model_configs')
      .update({ is_active: true })
      .eq('id', modelId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('设置活动模型失败', { userId, modelId, error });
      throw error;
    }
    console.log('设置活动模型成功', { userId, modelId, modelName: data.name });
    return data;
  },

  // 获取活动模型
  getActiveModel: async (userId: string) => {
    console.log('开始获取活动模型', { userId });
    const { data, error } = await supabase
      .from('model_configs')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        console.log('活动模型不存在', { userId });
        return null;
      }
      console.error('获取活动模型失败', { userId, error });
      throw error;
    }
    console.log('获取活动模型成功', { userId, modelId: data.id, modelName: data.name });
    return data;
  },

  // 获取活动模型ID
  getActiveModelId: async (userId: string) => {
    console.log('开始获取活动模型ID', { userId });
    const activeModel = await apiKeyService.getActiveModel(userId);
    const modelId = activeModel?.id || null;
    console.log('获取活动模型ID成功', { userId, modelId });
    return modelId;
  },

  // 历史数据迁移功能已移除 - 现在仅使用Supabase数据库存储API密钥
};

// 文件上传服务
export const storageService = {
  // 上传文件到Supabase Storage
  uploadFile: async (file: File, userId: string, folder?: string) => {
    console.log('开始上传文件', { userId, fileName: file.name, fileSize: file.size, fileType: file.type, folder });
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

    if (error) {
      console.error('上传文件失败', { userId, fileName: file.name, fullPath, error });
      throw error;
    }

    // 获取公共URL
    const { data: { publicUrl } } = supabase.storage
      .from('attachments')
      .getPublicUrl(fullPath);

    console.log('上传文件成功', { userId, fileName: file.name, fullPath, publicUrl });
    return {
      publicUrl,
      storageKey: fullPath,
    };
  },

  // 删除文件
  deleteFile: async (storageKey: string) => {
    console.log('开始删除文件', { storageKey });
    const { error } = await supabase.storage
      .from('attachments')
      .remove([storageKey]);

    if (error) {
      console.error('删除文件失败', { storageKey, error });
      throw error;
    }
    console.log('删除文件成功', { storageKey });
  },
};