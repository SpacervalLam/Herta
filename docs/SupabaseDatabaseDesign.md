# Supabase数据库设计方案

## 表结构设计

### 1. 用户表 (users)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  name VARCHAR(100),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
```

### 2. 对话表 (conversations)

```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  sync_version INTEGER DEFAULT 1,
  last_accessed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_last_accessed ON conversations(last_accessed_at);
CREATE INDEX idx_conversations_updated_at ON conversations(updated_at DESC);
```

### 3. 消息表 (messages)

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  model_name VARCHAR(100),
  model_id VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
```

### 4. 附件表 (attachments)

```sql
CREATE TABLE attachments (
  id UUID PRIMARY KEY,
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('image', 'audio', 'video')),
  url TEXT NOT NULL,
  file_name VARCHAR(255),
  file_size INTEGER,
  storage_key TEXT, -- Supabase Storage中的文件路径
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_attachments_message_id ON attachments(message_id);
```

### 5. 模型配置表 (model_configs)

```sql
CREATE TABLE model_configs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  model_type VARCHAR(50) NOT NULL, -- openai, claude, gemini, baidu, local, custom
  api_url TEXT,
  api_key TEXT, -- 存储加密的API密钥
  model_name VARCHAR(255),
  description TEXT,
  max_tokens INTEGER,
  temperature FLOAT,
  enabled BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT false,
  supports_multimodal BOOLEAN DEFAULT false,
  custom_request_config JSONB, -- 存储自定义请求配置
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_model_configs_user_id ON model_configs(user_id);
CREATE INDEX idx_model_configs_active ON model_configs(user_id, is_active);

-- 确保每个用户只有一个活动模型
CREATE UNIQUE INDEX idx_model_configs_one_active_per_user
ON model_configs(user_id)
WHERE is_active = true;
```

## 数据迁移映射

### 从前端应用到数据库的映射关系

| 前端数据字段 | 数据库表 | 数据库字段 | 转换说明 |
|------------|---------|----------|--------|
| conversation.id | conversations | id | UUID字符串 |
| conversation.title | conversations | title | 字符串 |
| conversation.createdAt | conversations | created_at | 数字时间戳转换为TIMESTAMPTZ |
| conversation.updatedAt | conversations | updated_at | 数字时间戳转换为TIMESTAMPTZ |
| message.id | messages | id | UUID字符串 |
| message.role | messages | role | 字符串 |
| message.content | messages | content | 字符串 |
| message.timestamp | messages | timestamp | 数字时间戳转换为TIMESTAMPTZ |
| message.modelName | messages | model_name | 字符串 |
| message.modelId | messages | model_id | 字符串 |
| message.attachments[] | attachments | 多条记录 | 数组中的每个附件转为单独的记录 |
| attachment.type | attachments | type | 字符串 |
| attachment.url | attachments | url | 字符串 (可以是base64或远程URL) |
| attachment.fileName | attachments | file_name | 字符串 |
| attachment.fileSize | attachments | file_size | 数字 |
| modelConfig.id | model_configs | id | UUID字符串 |
| modelConfig.name | model_configs | name | 字符串 |
| modelConfig.modelType | model_configs | model_type | 字符串 |
| modelConfig.apiUrl | model_configs | api_url | 字符串 |
| modelConfig.apiKey | model_configs | api_key | 加密存储的API密钥 |
| modelConfig.modelName | model_configs | model_name | 字符串 |
| modelConfig.description | model_configs | description | 字符串 |
| modelConfig.maxTokens | model_configs | max_tokens | 数字 |
| modelConfig.temperature | model_configs | temperature | 浮点数 |
| modelConfig.enabled | model_configs | enabled | 布尔值 |
| modelConfig.supportsMultimodal | model_configs | supports_multimodal | 布尔值 |
| modelConfig.customRequestConfig | model_configs | custom_request_config | JSON对象 |
| modelConfig.createdAt | model_configs | created_at | 数字时间戳转换为TIMESTAMPTZ |
| modelConfig.updatedAt | model_configs | updated_at | 数字时间戳转换为TIMESTAMPTZ |


