export type MediaType = 'image' | 'audio' | 'video';

export interface MediaAttachment {
  type: MediaType;
  url: string; // 可以是base64或远程URL
  fileName?: string;
  fileSize?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  modelName?: string; // 记录生成此消息时使用的模型名称（仅assistant消息有效）
  modelId?: string; // 记录生成此消息时使用的模型ID
  attachments?: MediaAttachment[]; // 新增附件字段
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[] | undefined;
  createdAt: number;
  updatedAt: number;
  // 删除了isSaved字段，因为不再需要延迟保存功能
}

export interface ChatSettings {
  theme: 'light' | 'dark' | 'system';
  fontSize: 'small' | 'medium' | 'large';
}