import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { sendChatStream } from '@/services/chatService';
import { getActiveModel } from '@/utils/modelStorage';
import type { Conversation, ChatMessage } from '@/types/chat';
import { MediaAttachment } from '@/types/chat';

const STORAGE_KEY = 'ai-chat-conversations';

export const useChat = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ✅ 初始化加载
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setConversations(parsed);
        if (parsed.length > 0) {
          setCurrentConversationId(parsed[0].id);
        }
      } catch (error) {
        console.error('Failed to parse stored conversations:', error);
      }
    }
  }, []);

  // ✅ 自动保存（过滤 Base64 附件）
  useEffect(() => {
    if (conversations.length === 0) return;

    try {
      // 深拷贝，防止污染原 state
      const safeCopy: Conversation[] = JSON.parse(JSON.stringify(conversations));

      // 清理附件中的 Base64 数据，但保留网络 URL
      safeCopy.forEach(conv => {
        conv.messages.forEach(msg => {
          if (msg.attachments) {
            msg.attachments = msg.attachments.map(att => {
              // 判断是否为 base64 数据（通常以 data: 开头）
              const isBase64 = att.url.startsWith('data:');
              return {
                ...att,
                // 只清空 base64 数据，保留网络图片 URL
                url: isBase64 ? '' : att.url
              };
            });
          }
        });
      });

      localStorage.setItem(STORAGE_KEY, JSON.stringify(safeCopy));
    } catch (err) {
      console.warn('⚠️ 存储对话失败（可能超出 localStorage 容量）:', err);
    }
  }, [conversations]);




  const currentConversation = conversations.find(c => c.id === currentConversationId);

  // ✅ 新建对话
  const createNewConversation = useCallback(() => {
    const newConversation: Conversation = {
      id: `conv-${Date.now()}`,
      title: '新对话',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isSaved: false,
    };
    setConversations(prev => [newConversation, ...prev]);
    setCurrentConversationId(newConversation.id);
    return newConversation;
  }, []);

  // ✅ 删除整个对话
  const deleteConversation = useCallback((id: string) => {
    setConversations(prev => {
      const filtered = prev.filter(c => c.id !== id);
      if (currentConversationId === id && filtered.length > 0) {
        setCurrentConversationId(filtered[0].id);
      } else if (filtered.length === 0) {
        setCurrentConversationId(null);
      }
      return filtered;
    });
  }, [currentConversationId]);

  // ✅ 更新标题
  const updateConversationTitle = useCallback((id: string, title: string) => {
    setConversations(prev =>
      prev.map(c => c.id === id ? { ...c, title, updatedAt: Date.now() } : c)
    );
  }, []);

  // ✅ 清空对话内容
  const clearConversation = useCallback((id: string) => {
    setConversations(prev =>
      prev.map(c => c.id === id ? { ...c, messages: [], updatedAt: Date.now() } : c)
    );
  }, []);

  // ✅ 删除单条消息（成对删除用户与AI）
  const deleteMessage = useCallback((messageId: string) => {
    if (!currentConversation) return;

    setConversations(prev =>
      prev.map(c => {
        if (c.id !== currentConversation.id) return c;

        const msgs = c.messages;
        const index = msgs.findIndex(m => m.id === messageId);
        if (index === -1) return c;

        const target = msgs[index];
        let newMessages = [...msgs];

        if (target.role === 'user') {
          if (msgs[index + 1] && msgs[index + 1].role === 'assistant') {
            newMessages.splice(index, 2);
          } else {
            newMessages.splice(index, 1);
          }
        } else if (target.role === 'assistant') {
          if (msgs[index - 1] && msgs[index - 1].role === 'user') {
            newMessages.splice(index - 1, 2);
          } else {
            newMessages.splice(index, 1);
          }
        }

        return { ...c, messages: newMessages, updatedAt: Date.now() };
      })
    );
  }, [currentConversation]);

  // ✅ 自动生成标题
  const generateConversationTitle = useCallback(async (conversationId: string, firstMessage: string) => {
    const activeModel = getActiveModel();
    if (!activeModel) return;

    try {
      const titlePrompt = `用户用以下问题开启了一次对话，请生成一个简短的对话标题（不超过20字）：\n\n${firstMessage}`;

      let generatedTitle = '';
      const controller = new AbortController();
      const timeoutMs = 8000;

      const timeoutHandle = setTimeout(() => { }, timeoutMs);

      await sendChatStream({
        endpoint: activeModel.apiUrl,
        apiKey: activeModel.apiKey,
        modelConfig: activeModel,
        messages: [{ id: 'temp', role: 'user', content: titlePrompt, timestamp: Date.now() }],
        onUpdate: (content: string) => (generatedTitle = content.trim()),
        onComplete: () => {
          clearTimeout(timeoutHandle);
          let title = generatedTitle.replace(/[\s\S]*?<\/think>/gi, '').split('\n')[0].trim();
          if (!title) title = firstMessage.slice(0, 12);
          updateConversationTitle(conversationId, title);
        },
        onError: (err) => {
          clearTimeout(timeoutHandle);
          console.error('标题生成失败:', err);
        },
        signal: controller.signal,
      });
    } catch (error) {
      console.error('标题生成错误:', error);
    }
  }, [updateConversationTitle]);

  // ✅ 发送消息
  const sendMessage = useCallback(async (content: string, attachments?: MediaAttachment[]) => {
    if ((!content.trim() && !attachments?.length) || isLoading) return;

    const activeModel = getActiveModel();
    if (!activeModel) {
      toast.error('请先配置AI模型');
      return;
    }

    if (attachments?.length && !activeModel.supportsMultimodal) {
      toast.error('当前模型不支持多模态输入');
      return;
    }

    let conversation = currentConversation || createNewConversation();
    const isFirstMessage = conversation.messages.length === 0;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
      attachments,
    };

    const assistantMessage: ChatMessage = {
      id: `msg-${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      modelName: activeModel.name,
      modelId: activeModel.id,
    };

    setConversations(prev =>
      prev.map(c =>
        c.id === conversation.id
          ? { ...c, messages: [...c.messages, userMessage, assistantMessage], updatedAt: Date.now() }
          : c
      )
    );

    setIsLoading(true);
    abortControllerRef.current = new AbortController();

    try {
      await sendChatStream({
        endpoint: activeModel.apiUrl,
        apiKey: activeModel.apiKey,
        modelConfig: activeModel,
        messages: [...conversation.messages, userMessage],
        onUpdate: (content: string) => {
          setConversations(prev =>
            prev.map(c =>
              c.id === conversation.id
                ? {
                  ...c,
                  messages: c.messages.map(m =>
                    m.id === assistantMessage.id ? { ...m, content } : m
                  ),
                }
                : c
            )
          );
        },
        onComplete: () => {
          setIsLoading(false);
          abortControllerRef.current = null;
          if (isFirstMessage) {
            setConversations(prev =>
              prev.map(c =>
                c.id === conversation.id ? { ...c, isSaved: true } : c
              )
            );
            generateConversationTitle(conversation.id, content.trim());
          }
        },
        onError: (error: Error) => {
          setIsLoading(false);
          abortControllerRef.current = null;
          toast.error('发送失败', { description: error.message });
        },
        signal: abortControllerRef.current.signal,
      });
    } catch (error) {
      console.error('Send message error:', error);
    }
  }, [currentConversation, isLoading, createNewConversation, generateConversationTitle]);

  // ✅ 停止生成
  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, []);

  // ✅ 导出
  const exportConversation = useCallback((id: string) => {
    const conversation = conversations.find(c => c.id === id);
    if (!conversation) return;
    const content = conversation.messages
      .map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`)
      .join('\n\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${conversation.title}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('对话已导出');
  }, [conversations]);

  // 重试生成回复
  const retryMessage = useCallback(async (messageId: string) => {
    if (!currentConversation || isLoading) return;

    // 找到要重试的消息
    const messageIndex = currentConversation.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1 || currentConversation.messages[messageIndex].role !== 'assistant') return;

    // 找到对应的用户消息
    const userMessageIndex = messageIndex - 1;
    if (userMessageIndex < 0 || currentConversation.messages[userMessageIndex].role !== 'user') return;

    const activeModel = getActiveModel();
    if (!activeModel) {
      toast.error('请先配置AI模型');
      return;
    }

    // 移除当前消息及之后的所有消息
    const messagesBefore = currentConversation.messages.slice(0, userMessageIndex + 1);

    setConversations(prev =>
      prev.map(c =>
        c.id === currentConversation.id
          ? { ...c, messages: messagesBefore, updatedAt: Date.now() }
          : c
      )
    );

    // 创建新的assistant消息
    const assistantMessage: ChatMessage = {
      id: `msg-${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      modelName: activeModel.name,
      modelId: activeModel.id
    };

    setConversations(prev =>
      prev.map(c =>
        c.id === currentConversation.id
          ? { ...c, messages: [...messagesBefore, assistantMessage] }
          : c
      )
    );

    setIsLoading(true);
    abortControllerRef.current = new AbortController();

    try {
      await sendChatStream({
        endpoint: activeModel.apiUrl,
        apiKey: activeModel.apiKey,
        modelConfig: activeModel,
        messages: messagesBefore,
        onUpdate: (content: string) => {
          setConversations(prev =>
            prev.map(c =>
              c.id === currentConversation.id
                ? {
                  ...c,
                  messages: c.messages.map(m =>
                    m.id === assistantMessage.id ? { ...m, content } : m
                  )
                }
                : c
            )
          );
        },
        onComplete: () => {
          setIsLoading(false);
          abortControllerRef.current = null;
        },
        onError: (error: Error) => {
          setIsLoading(false);
          abortControllerRef.current = null;
          toast.error('重新生成失败', {
            description: error.message || '请检查模型配置或稍后重试'
          });
          setConversations(prev =>
            prev.map(c =>
              c.id === currentConversation.id
                ? {
                  ...c,
                  messages: c.messages.filter(m => m.id !== assistantMessage.id)
                }
                : c
            )
          );
        },
        signal: abortControllerRef.current.signal
      });
    } catch (error) {
      console.error('Retry message error:', error);
    }
  }, [currentConversation, isLoading]);

  // 从指定消息创建分支对话
  const branchConversation = useCallback((messageId: string) => {
    if (!currentConversation) return;

    // 找到消息位置
    const messageIndex = currentConversation.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;

    // 复制该消息之前的所有消息（包括该消息）
    const messagesUpToBranch = currentConversation.messages.slice(0, messageIndex + 1);

    // 创建新对话
    const newConversation: Conversation = {
      id: `conv-${Date.now()}`,
      title: `${currentConversation.title} (分支)`,
      messages: messagesUpToBranch,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isSaved: true
    };

    // 添加到对话列表并切换
    setConversations(prev => [newConversation, ...prev]);
    setCurrentConversationId(newConversation.id);
  }, [currentConversation]);

  // 编辑消息并重新生成回复
  const editMessage = useCallback(async (messageId: string, newContent: string) => {
    if (!currentConversation || isLoading) return;

    // 找到要编辑的消息
    const messageIndex = currentConversation.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1 || currentConversation.messages[messageIndex].role !== 'user') return;

    // 移除该消息之后的所有消息
    const messagesBefore = currentConversation.messages.slice(0, messageIndex);
    const editedMessage = { ...currentConversation.messages[messageIndex], content: newContent };

    setConversations(prev =>
      prev.map(c =>
        c.id === currentConversation.id
          ? { ...c, messages: [...messagesBefore, editedMessage], updatedAt: Date.now() }
          : c
      )
    );

    // 创建新的assistant消息
    const assistantMessage: ChatMessage = {
      id: `msg-${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      timestamp: Date.now()
    };

    setConversations(prev =>
      prev.map(c =>
        c.id === currentConversation.id
          ? { ...c, messages: [...messagesBefore, editedMessage, assistantMessage] }
          : c
      )
    );

    setIsLoading(true);
    abortControllerRef.current = new AbortController();

    const activeModel = getActiveModel();
    if (!activeModel) {
      toast.error('请先配置AI模型');
      setIsLoading(false);
      return;
    }

    try {
      await sendChatStream({
        endpoint: activeModel.apiUrl,
        apiKey: activeModel.apiKey,
        modelConfig: activeModel,
        messages: [...messagesBefore, editedMessage],
        onUpdate: (content: string) => {
          setConversations(prev =>
            prev.map(c =>
              c.id === currentConversation.id
                ? {
                  ...c,
                  messages: c.messages.map(m =>
                    m.id === assistantMessage.id ? { ...m, content } : m
                  )
                }
                : c
            )
          );
        },
        onComplete: () => {
          setIsLoading(false);
          abortControllerRef.current = null;
        },
        onError: (error: Error) => {
          setIsLoading(false);
          abortControllerRef.current = null;
          toast.error('编辑后发送失败', {
            description: error.message || '请检查模型配置或稍后重试'
          });
          setConversations(prev =>
            prev.map(c =>
              c.id === currentConversation.id
                ? {
                  ...c,
                  messages: c.messages.filter(m => m.id !== assistantMessage.id)
                }
                : c
            )
          );
        },
        signal: abortControllerRef.current.signal
      });
    } catch (error) {
      console.error('Edit message error:', error);
    }
  }, [currentConversation, isLoading]);


  return {
    conversations,
    currentConversation,
    currentConversationId,
    isLoading,
    setCurrentConversationId,
    createNewConversation,
    deleteConversation,
    updateConversationTitle,
    clearConversation,
    sendMessage,
    stopGeneration,
    exportConversation,
    retryMessage,
    branchConversation,
    editMessage,
    deleteMessage
  };
};
