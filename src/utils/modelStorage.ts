// 模型配置存储管理

import { ModelConfig } from '@/types/model';
import { apiKeyService } from '@/services/supabaseService';

// 用于在内存中临时存储解密后的API Key（仅在需要时）
const tempApiKeys = new Map<string, string>();

// 转换数据库模型配置到前端模型配置格式
const convertDbToFrontendConfig = (dbConfig: any): ModelConfig => {
  return {
    id: dbConfig.id,
    name: dbConfig.name,
    modelType: dbConfig.model_type,
    apiUrl: dbConfig.api_url,
    apiKey: dbConfig.api_key,
    modelName: dbConfig.model_name,
    description: dbConfig.description,
    maxTokens: dbConfig.max_tokens,
    temperature: dbConfig.temperature,
    enabled: dbConfig.enabled,
    createdAt: dbConfig.created_at ? new Date(dbConfig.created_at).getTime() : Date.now(),
    updatedAt: dbConfig.updated_at ? new Date(dbConfig.updated_at).getTime() : Date.now(),
    supportsMultimodal: dbConfig.supports_multimodal,
    customRequestConfig: dbConfig.custom_request_config,
  };
};

// 获取所有模型配置（仅使用Supabase数据库）
export const getModelConfigs = async (userId: string): Promise<ModelConfig[]> => {
  try {
    const dbConfigs = await apiKeyService.getModelConfigs(userId);
    // 返回时隐藏API Key，只保留引用标识
    return dbConfigs.map(config => ({
      ...convertDbToFrontendConfig(config),
      apiKey: config.api_key ? 'has_key' : ''
    }));
  } catch (error) {
    console.error('获取模型配置失败:', error);
    return [];
  }
};

// 安全地获取完整模型配置（包含解密后的API Key）
export const getModelConfigWithApiKey = async (userId: string, modelId: string): Promise<ModelConfig | null> => {
  try {
    // 检查内存缓存
    const cachedKey = tempApiKeys.get(modelId);
    if (cachedKey) {
      const config = await getModelConfig(modelId, userId);
      if (config) {
        return { ...config, apiKey: cachedKey };
      }
    }
    
    // 从服务器获取完整配置
    const dbConfig = await apiKeyService.getModelConfig(modelId, userId);
    if (!dbConfig) return null;
    
    // 临时存储API Key到内存
    if (dbConfig.api_key) {
      tempApiKeys.set(modelId, dbConfig.api_key);
    }
    
    return convertDbToFrontendConfig(dbConfig);
  } catch (error) {
    console.error('获取模型配置（包含API Key）失败:', error);
    return null;
  }
};

// 保存所有模型配置（仅使用Supabase数据库）
export const saveModelConfigs = async (configs: ModelConfig[], userId: string): Promise<void> => {
  try {
    // 逐个保存到Supabase
    for (const config of configs) {
      await saveModelConfig(config, userId);
    }
  } catch (error) {
    console.error('保存模型配置失败:', error);
    throw error;
  }
};

// 添加或更新模型配置
export const saveModelConfig = async (config: ModelConfig, userId: string): Promise<void> => {
  try {
    config.updatedAt = Date.now();
    
    // 保存到Supabase
    await apiKeyService.saveModelConfig(config, userId);
    
    // 更新内存缓存中的API Key
    if (config.apiKey && config.apiKey !== 'has_key') {
      tempApiKeys.set(config.id, config.apiKey);
    }
  } catch (error) {
    console.error('保存模型配置失败:', error);
    throw error;
  }
};

// 添加模型配置
export const addModelConfig = async (model: Omit<ModelConfig, 'id' | 'createdAt' | 'updatedAt'>, userId: string): Promise<ModelConfig> => {
  const now = Date.now();
  const newModel: ModelConfig = {
    ...model,
    id: `model-${now}-${Math.random().toString(36).substring(2, 9)}`,
    createdAt: now,
    updatedAt: now
  };
  
  await saveModelConfig(newModel, userId);
  return newModel;
};

// 更新模型配置
export const updateModelConfig = async (id: string, updates: Partial<ModelConfig>, userId: string): Promise<void> => {
  const existingModel = await getModelConfig(id, userId);
  if (existingModel) {
    await saveModelConfig({
      ...existingModel,
      ...updates,
      updatedAt: Date.now()
    }, userId);
  }
};

// 获取单个模型配置（隐藏API Key）
export const getModelConfig = async (id: string, userId: string): Promise<ModelConfig | null> => {
  try {
    const dbConfig = await apiKeyService.getModelConfig(id, userId);
    if (!dbConfig) return null;
    
    // 返回时隐藏API Key
    const config = convertDbToFrontendConfig(dbConfig);
    return {
      ...config,
      apiKey: dbConfig.api_key ? 'has_key' : ''
    };
  } catch (error) {
    console.error('获取模型配置失败:', error);
    return null;
  }
};

// 检查模型是否已存在（根据模型名称和API URL）
export const isModelExists = async (modelName: string, apiUrl: string, userId: string): Promise<boolean> => {
  try {
    const models = await getModelConfigs(userId);
    return models.some(m => m.modelName === modelName && m.apiUrl === apiUrl);
  } catch (error) {
    console.error('检查模型存在性失败:', error);
    return false;
  }
};

// 获取启用的模型配置
export const getEnabledModels = async (userId: string): Promise<ModelConfig[]> => {
  try {
    const models = await getModelConfigs(userId);
    return models.filter(m => m.enabled);
  } catch (error) {
    console.error('获取启用模型失败:', error);
    return [];
  }
};

// 删除模型配置
export const deleteModelConfig = async (id: string, userId: string): Promise<void> => {
  try {
    await apiKeyService.deleteModelConfig(id, userId);
    
    // 清除内存缓存中的API Key
    tempApiKeys.delete(id);
    
    // 检查是否是活动模型
    const activeModel = await getActiveModel(userId);
    if (activeModel && activeModel.id === id) {
      // 如果是活动模型，清除活动模型设置
      await setActiveModelId('', userId);
    }
  } catch (error) {
    console.error('删除模型配置失败:', error);
    throw error;
  }
};

// 获取当前激活的模型ID
export const getActiveModelId = async (userId: string): Promise<string | null> => {
  try {
    return await apiKeyService.getActiveModelId(userId);
  } catch (error) {
    console.error('获取激活模型ID失败:', error);
    return null;
  }
};

// 设置活动模型ID
export const setActiveModelId = async (id: string, userId: string): Promise<void> => {
  try {
    await apiKeyService.setActiveModel(id, userId);
    // 通知全局模型已变更
    window.dispatchEvent(new Event('settings-changed'));
  } catch (error) {
    console.error('设置活动模型失败:', error);
    throw error;
  }
};

// 设置当前激活的模型
export const setActiveModel = async (modelId: string, userId: string): Promise<void> => {
  if (!userId) {
    throw new Error('用户ID不能为空');
  }
  await setActiveModelId(modelId, userId);
};

// 获取活动模型配置（隐藏API Key）
export const getActiveModel = async (userId: string): Promise<ModelConfig | null> => {
  try {
    // 验证userId参数
    if (!userId || userId === 'undefined') {
      console.error('获取活动模型失败: 用户ID无效');
      return null;
    }
    
    const dbConfig = await apiKeyService.getActiveModel(userId);
    if (!dbConfig) return null;
    
    // 返回时隐藏API Key
    const config = convertDbToFrontendConfig(dbConfig);
    return {
      ...config,
      apiKey: dbConfig.api_key ? 'has_key' : ''
    };
  } catch (error) {
    console.error('获取活动模型失败:', error);
    return null;
  }
};

// 获取活动模型配置（包含API Key，仅在需要时使用）
export const getActiveModelWithApiKey = async (userId: string): Promise<ModelConfig | null> => {
  try {
    const activeModel = await apiKeyService.getActiveModel(userId);
    if (!activeModel) return null;
    
    // 临时存储API Key到内存
    if (activeModel.api_key) {
      tempApiKeys.set(activeModel.id, activeModel.api_key);
    }
    
    return convertDbToFrontendConfig(activeModel);
  } catch (error) {
    console.error('获取活动模型（包含API Key）失败:', error);
    return null;
  }
};

// 清除激活的模型
export const clearActiveModel = async (userId: string): Promise<void> => {
  await setActiveModelId('', userId);
};

// 导出模型配置（不包含实际API Key）
export const exportModelConfigs = async (userId: string): Promise<string> => {
  try {
    const configs = await getModelConfigs(userId);
    return JSON.stringify(configs, null, 2);
  } catch (error) {
    console.error('导出模型配置失败:', error);
    return '[]';
  }
};

// 应用退出或用户登出时清除内存中的API Key
export const clearTempApiKeys = (): void => {
  tempApiKeys.clear();
};

// 监听页面卸载事件，清除临时API Key
window.addEventListener('beforeunload', clearTempApiKeys);

// 导入模型配置
export const importModelConfigs = async (jsonString: string, userId: string): Promise<boolean> => {
  try {
    const importedModels: ModelConfig[] = JSON.parse(jsonString);
    
    // 验证导入的模型配置格式
    if (!Array.isArray(importedModels)) {
      throw new Error('无效的模型配置格式');
    }
    
    // 验证每个模型配置
    for (const model of importedModels) {
      if (!model.modelName || !model.apiUrl) {
        throw new Error('导入的模型配置缺少必要字段');
      }
      // 生成新的ID以避免冲突
      model.id = `model-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      model.createdAt = Date.now();
      model.updatedAt = Date.now();
      // 清除可能存在的API密钥（导入时不包含实际API密钥）
      model.apiKey = '';
    }
    
    // 合并现有模型配置
    const existingModels = await getModelConfigs(userId);
    const mergedModels = [...existingModels, ...importedModels];
    
    await saveModelConfigs(mergedModels, userId);
    
    return true;
  } catch (error) {
    console.error('导入模型配置失败:', error);
    return false;
  }
};
