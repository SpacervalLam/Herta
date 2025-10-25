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

  useEffect(() => {
    if (conversations.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    }
  }, [conversations]);

  const currentConversation = conversations.find(c => c.id === currentConversationId);

  const createNewConversation = useCallback(() => {
    const newConversation: Conversation = {
      id: `conv-${Date.now()}`,
      title: '新对话',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isSaved: false // 标记为未保存，只有发送第一条消息后才保存到列表
    };
    // 不立即添加到conversations列表，只设置为当前对话
    setConversations(prev => [newConversation, ...prev]);
    setCurrentConversationId(newConversation.id);
    return newConversation;
  }, []);


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

  const updateConversationTitle = useCallback((id: string, title: string) => {
    setConversations(prev =>
      prev.map(c => c.id === id ? { ...c, title, updatedAt: Date.now() } : c)
    );
  }, []);

  const clearConversation = useCallback((id: string) => {
    setConversations(prev =>
      prev.map(c => c.id === id ? { ...c, messages: [], updatedAt: Date.now() } : c)
    );
  }, []);

  // AI自动生成对话标题
  const generateConversationTitle = useCallback(async (conversationId: string, firstMessage: string) => {
    const activeModel = getActiveModel();
    if (!activeModel) return;

    try {
      const titlePrompt = `用户用以下问题开启了一次对话，请根据用户的问题，生成一个简短的对话标题，反应用户对话的主题（不超过20个字，不要加引号，只返回标题本身，不要其他任何说明）：用户问题内容：\n\n${firstMessage}`;

      let generatedTitle = '';
      const controller = new AbortController();
      const timeoutMs = 8000;


      const timeoutHandle = setTimeout(() => {
        // 仅标记超时，不强制中断
      }, timeoutMs);

      await sendChatStream({
        endpoint: activeModel.apiUrl,
        apiKey: activeModel.apiKey,
        modelConfig: activeModel,
        messages: [{ id: 'temp', role: 'user', content: titlePrompt, timestamp: Date.now() }],
        onUpdate: (content: string) => {
          // 累积流式内容
          generatedTitle = content.trim();
        },
        onComplete: () => {
          clearTimeout(timeoutHandle);

          let finalTitle = generatedTitle.trim();

          // 🔹 1. 移除 ...<|FunctionCallEnd|> 思维链段落
          finalTitle = finalTitle.replace(/[\s\S]*?<\/think>/gi, '');

          // 🔹 2. 仅取首行并清理多余空格与引号
          finalTitle = finalTitle.split('\n')[0].replace(/^["'\s]+|["'\s]+$/g, '').trim();

          // 🔹 3. 若为空则使用用户消息回退
          if (!finalTitle) {
            finalTitle = firstMessage.trim().slice(0, 12) || 'New Conversation';
          }

          // 🔹 4. 长度约束：最多40字符（宽字符按2算）
          const charCount = Array.from(finalTitle).reduce((sum, ch) => sum + (ch.charCodeAt(0) > 255 ? 2 : 1), 0);
          if (charCount > 40) {
            let total = 0;
            finalTitle = Array.from(finalTitle)
              .filter(ch => {
                total += ch.charCodeAt(0) > 255 ? 2 : 1;
                return total <= 40;
              })
              .join('');
          }


          // 🔹 5. 更新到会话标题
          if (finalTitle) {
            updateConversationTitle(conversationId, finalTitle);
          }
        },
        onError: (err) => {
          clearTimeout(timeoutHandle);
          console.error('标题生成失败:', err);
        },
        signal: controller.signal
      });
    } catch (error) {
      console.error('标题生成错误:', error);
    }
  }, [updateConversationTitle]);



  const sendMessage = useCallback(async (content: string, attachments?: MediaAttachment[]) => {
    if ((!content.trim() && !attachments?.length) || isLoading) return;

    // 获取当前激活的模型配置
    const activeModel = getActiveModel();
    if (!activeModel) {
      toast.error('请先配置AI模型', {
        description: '点击顶部模型选择器旁的设置图标进行配置'
      });
      return;
    }

    // 检查模型是否支持多模态
    if (attachments?.length && (!activeModel.supportsMultimodal)) {
      toast.error('当前模型不支持多模态输入', {
        description: '请切换到支持图片等媒体的模型'
      });
      return;
    }

    let conversation = currentConversation;
    if (!conversation) {
      conversation = createNewConversation();
    }

    const isFirstMessage = conversation.messages.length === 0;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
      attachments: attachments // 添加附件
    };

    setConversations(prev =>
      prev.map(c =>
        c.id === conversation!.id
          ? { ...c, messages: [...c.messages, userMessage], updatedAt: Date.now() }
          : c
      )
    );

    // 首次消息的标题生成将在AI回复完成后进行

    // 创建assistant消息，记录当前使用的模型信息

    const assistantMessage: ChatMessage = {
      id: `msg-${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      modelName: activeModel.name, // 记录模型名称
      modelId: activeModel.id // 记录模型ID
    };

    setConversations(prev =>
      prev.map(c =>
        c.id === conversation!.id
          ? { ...c, messages: [...c.messages, assistantMessage] }
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
              c.id === conversation!.id
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

          // 如果是首次消息且对话未保存，标记为已保存
          if (isFirstMessage) {
            setConversations(prev =>
              prev.map(c =>
                c.id === conversation!.id ? { ...c, isSaved: true } : c
              )
            );


            // AI回复完成后生成对话标题
            generateConversationTitle(conversation.id, content.trim());
          }
        },
        onError: (error: Error) => {
          setIsLoading(false);
          abortControllerRef.current = null;
          toast.error('发送消息失败', {
            description: error.message || '请检查模型配置或稍后重试'
          });
          setConversations(prev =>
            prev.map(c =>
              c.id === conversation!.id
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
      console.error('Send message error:', error);
    }
  }, [currentConversation, isLoading, createNewConversation, generateConversationTitle]);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, []);

  const exportConversation = useCallback((id: string) => {
    const conversation = conversations.find(c => c.id === id);
    if (!conversation) return;

    const content = conversation.messages
      .map(m => `${m.role === 'user' ? '用户' : 'AI助手'}: ${m.content}`)
      .join('\n\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${conversation.title}-${new Date().toLocaleDateString()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
    editMessage
  };
};