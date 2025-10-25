export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  modelName?: string; // 记录生成此消息时使用的模型名称（仅assistant消息有效）
  modelId?: string; // 记录生成此消息时使用的模型ID
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  isSaved?: boolean; // 标记对话是否已保存到列表（用于延迟保存功能）
}

export interface ChatSettings {
  theme: 'light' | 'dark' | 'system';
  fontSize: 'small' | 'medium' | 'large';
}
