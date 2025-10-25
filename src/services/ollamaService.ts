// Ollama模型检测和管理服务

import ky from 'ky';

export interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaModelInfo {
  license: string;
  modelfile: string;
  parameters: string;
  template: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

// 检测Ollama服务是否可用
export const checkOllamaService = async (baseUrl: string = 'http://localhost:11434'): Promise<boolean> => {
  try {
    const response = await ky.get(`${baseUrl}/api/tags`, { 
      timeout: 3000,
      retry: 0 // 不重试，快速失败
    });
    return response.ok;
  } catch (error) {
    // 静默处理错误，避免控制台噪音
    return false;
  }
};

// 获取Ollama服务状态信息
export const getOllamaServiceStatus = async (baseUrl: string = 'http://localhost:11434'): Promise<{
  isAvailable: boolean;
  version?: string;
  error?: string;
}> => {
  try {
    const response = await ky.get(`${baseUrl}/api/version`, { 
      timeout: 3000,
      retry: 0
    });
    
    if (response.ok) {
      const versionData = await response.json() as { version: string };
      return {
        isAvailable: true,
        version: versionData.version
      };
    }
    
    return { isAvailable: false, error: '服务响应异常' };
  } catch (error) {
    let errorMessage = 'Ollama服务未运行';
    
    if (error instanceof Error) {
      if (error.message.includes('fetch')) {
        errorMessage = '无法连接到Ollama服务，请确保Ollama已安装并运行';
      } else if (error.message.includes('timeout')) {
        errorMessage = '连接Ollama服务超时';
      }
    }
    
    return { 
      isAvailable: false, 
      error: errorMessage 
    };
  }
};

// 获取Ollama模型列表
export const getOllamaModels = async (baseUrl: string = 'http://localhost:11434'): Promise<OllamaModel[]> => {
  try {
    const response = await ky.get(`${baseUrl}/api/tags`, { timeout: 10000 });
    const data = await response.json() as { models: OllamaModel[] };
    return data.models || [];
  } catch (error) {
    console.error('获取Ollama模型列表失败:', error);
    throw new Error('无法连接到Ollama服务，请确保Ollama已安装并运行');
  }
};

// 获取模型详细信息
export const getOllamaModelInfo = async (modelName: string, baseUrl: string = 'http://localhost:11434'): Promise<OllamaModelInfo> => {
  try {
    const response = await ky.post(`${baseUrl}/api/show`, {
      json: { name: modelName },
      timeout: 10000
    });
    return await response.json() as OllamaModelInfo;
  } catch (error) {
    console.error('获取Ollama模型信息失败:', error);
    throw new Error(`无法获取模型 ${modelName} 的信息`);
  }
};

// 拉取模型（下载）
export const pullOllamaModel = async (modelName: string, baseUrl: string = 'http://localhost:11434'): Promise<void> => {
  try {
    const response = await ky.post(`${baseUrl}/api/pull`, {
      json: { name: modelName },
      timeout: 300000 // 5分钟超时，因为下载可能需要较长时间
    });
    
    if (!response.ok) {
      throw new Error(`拉取模型 ${modelName} 失败`);
    }
  } catch (error) {
    console.error('拉取Ollama模型失败:', error);
    throw new Error(`拉取模型 ${modelName} 失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
};

// 删除模型
export const deleteOllamaModel = async (modelName: string, baseUrl: string = 'http://localhost:11434'): Promise<void> => {
  try {
    const response = await ky.delete(`${baseUrl}/api/delete`, {
      json: { name: modelName },
      timeout: 30000
    });
    
    if (!response.ok) {
      throw new Error(`删除模型 ${modelName} 失败`);
    }
  } catch (error) {
    console.error('删除Ollama模型失败:', error);
    throw new Error(`删除模型 ${modelName} 失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
};

// 格式化模型大小
export const formatModelSize = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
};

// 格式化修改时间
export const formatModifiedTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return '今天';
  } else if (diffDays === 1) {
    return '昨天';
  } else if (diffDays < 7) {
    return `${diffDays}天前`;
  } else {
    return date.toLocaleDateString('zh-CN');
  }
};
