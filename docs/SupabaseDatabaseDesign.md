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
  is_saved BOOLEAN DEFAULT true,
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

## 数据迁移映射

### 从前端应用到数据库的映射关系

| 前端数据字段 | 数据库表 | 数据库字段 | 转换说明 |
|------------|---------|----------|--------|
| conversation.id | conversations | id | UUID字符串 |
| conversation.title | conversations | title | 字符串 |
| conversation.createdAt | conversations | created_at | 数字时间戳转换为TIMESTAMPTZ |
| conversation.updatedAt | conversations | updated_at | 数字时间戳转换为TIMESTAMPTZ |
| conversation.isSaved | conversations | is_saved | 布尔值 |
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

## 数据同步策略

### 离线模式支持

1. **本地存储**：未登录用户数据存储在localStorage
2. **离线缓存**：已登录用户离线时数据存储在IndexedDB
3. **冲突检测**：网络恢复时自动检测并解决数据冲突
4. **同步优先级**：
   - 默认使用较新版本的数据
   - 消息采用合并策略，保留所有唯一消息

### 冲突解决策略

1. **LOCAL_WINS**：使用本地版本覆盖服务器版本
2. **SERVER_WINS**：使用服务器版本覆盖本地版本
3. **USE_LATEST**：使用更新时间较新的版本
4. **MERGE_MESSAGES**：合并消息列表，保留所有唯一消息并按时间排序
