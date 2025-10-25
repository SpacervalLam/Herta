// 模型配置存储管理

import { ModelConfig } from '@/types/model';

const STORAGE_KEY = 'ai-chat-models';
const ACTIVE_MODEL_KEY = 'ai-chat-active-model';

// 获取所有模型配置
export const getModelConfigs = (): ModelConfig[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (error) {
    console.error('获取模型配置失败:', error);
    return [];
  }
};

// 保存所有模型配置
export const saveModelConfigs = (models: ModelConfig[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(models));
  } catch (error) {
    console.error('保存模型配置失败:', error);
  }
};

// 添加模型配置
export const addModelConfig = (model: Omit<ModelConfig, 'id' | 'createdAt' | 'updatedAt'>): ModelConfig => {
  const models = getModelConfigs();
  const now = Date.now();
  const newModel: ModelConfig = {
    ...model,
    id: `model-${now}-${Math.random().toString(36).substr(2, 9)}`,
    createdAt: now,
    updatedAt: now
  };
  models.push(newModel);
  saveModelConfigs(models);
  return newModel;
};

// 更新模型配置
export const updateModelConfig = (id: string, updates: Partial<ModelConfig>): void => {
  const models = getModelConfigs();
  const index = models.findIndex(m => m.id === id);
  if (index !== -1) {
    models[index] = {
      ...models[index],
      ...updates,
      updatedAt: Date.now()
    };
    saveModelConfigs(models);
  }
};

// 删除模型配置
export const deleteModelConfig = (id: string): void => {
  const models = getModelConfigs();
  const filtered = models.filter(m => m.id !== id);
  saveModelConfigs(filtered);
  
  // 如果删除的是当前激活的模型，清除激活状态
  const activeModelId = getActiveModelId();
  if (activeModelId === id) {
    clearActiveModel();
  }
};

// 获取单个模型配置
export const getModelConfig = (id: string): ModelConfig | undefined => {
  const models = getModelConfigs();
  return models.find(m => m.id === id);
};

// 检查模型是否已存在（根据模型名称和API URL）
export const isModelExists = (modelName: string, apiUrl: string): boolean => {
  const models = getModelConfigs();
  return models.some(m => m.modelName === modelName && m.apiUrl === apiUrl);
};

// 获取启用的模型配置
export const getEnabledModels = (): ModelConfig[] => {
  return getModelConfigs().filter(m => m.enabled);
};

// 设置当前激活的模型
export const setActiveModel = (modelId: string): void => {
  try {
    localStorage.setItem(ACTIVE_MODEL_KEY, modelId);
  } catch (error) {
    console.error('设置激活模型失败:', error);
  }
};

// 获取当前激活的模型ID
export const getActiveModelId = (): string | null => {
  try {
    return localStorage.getItem(ACTIVE_MODEL_KEY);
  } catch (error) {
    console.error('获取激活模型失败:', error);
    return null;
  }
};

// 获取当前激活的模型配置
export const getActiveModel = (): ModelConfig | null => {
  const modelId = getActiveModelId();
  if (!modelId) return null;
  return getModelConfig(modelId) || null;
};

// 清除激活的模型
export const clearActiveModel = (): void => {
  try {
    localStorage.removeItem(ACTIVE_MODEL_KEY);
  } catch (error) {
    console.error('清除激活模型失败:', error);
  }
};

// 导出模型配置
export const exportModelConfigs = (): string => {
  const models = getModelConfigs();
  // 移除敏感信息（API密钥）
  const safeModels = models.map(m => ({
    ...m,
    apiKey: '***'
  }));
  return JSON.stringify(safeModels, null, 2);
};

// 导入模型配置
export const importModelConfigs = (jsonString: string): boolean => {
  try {
    const models = JSON.parse(jsonString) as ModelConfig[];
    if (!Array.isArray(models)) {
      throw new Error('无效的模型配置格式');
    }
    saveModelConfigs(models);
    return true;
  } catch (error) {
    console.error('导入模型配置失败:', error);
    return false;
  }
};
