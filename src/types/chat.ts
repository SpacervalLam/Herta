// export interface ChatMessage {
//   id: string;
//   role: 'user' | 'assistant' | 'system';
//   content: string;
//   timestamp: number;
//   modelName?: string; // 记录生成此消息时使用的模型名称（仅assistant消息有效）
//   modelId?: string; // 记录生成此消息时使用的模型ID
// }

export interface MessageContentItem {
  type: 'text' | 'image_url'; // 可扩展为audio、video等
  text?: string; // type=text时必填
  image_url?: { url: string }; // type=image_url时必填
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: MessageContentItem[]; // 支持混合内容
  modelName?: string;
  timestamp: number;
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
