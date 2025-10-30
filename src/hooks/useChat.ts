import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { sendChatStream } from '@/services/chatService';
import { getActiveModelWithApiKey } from '@/utils/modelStorage';
import type { Conversation, ChatMessage } from '@/types/chat';
import type { ModelConfig } from '@/types/model';
import { MediaAttachment } from '@/types/chat';
import { useAuth } from '@/contexts/AuthContext';
import { conversationService, messageService, attachmentService, generateUUID } from '@/services/supabaseService';

const STORAGE_KEY = 'ai-chat-conversations'; // 未登录用户使用localStorage

export const useChat = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(() => {
    // 从URL或localStorage恢复当前对话ID
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('id') || null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const assistantContentRef = useRef('');
  
  const { user } = useAuth();

  // 从localStorage或Supabase加载对话
  useEffect(() => {
    const loadConversations = async () => {
      setIsLoadingConversations(true);
      try {
        if (user) {
          // 已登录用户：从Supabase加载对话
          const data = await conversationService.getConversations(user.id);
          if (data) {
            // 转换数据库格式到前端格式
            const conversations = data.map((conv: any) => ({
              id: conv.id,
              title: conv.title,
              messages: undefined, // 设置为undefined以便懒加载消息
              createdAt: new Date(conv.created_at).getTime(),
              updatedAt: new Date(conv.updated_at).getTime(),
            }));
            setConversations(conversations);
            // 只有当没有当前对话ID时才自动选择第一个
            if (conversations.length > 0 && !currentConversationId) {
              setCurrentConversationId(conversations[0].id);
            }
          }
        } else {
          // 未登录用户：从localStorage加载
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored) {
            try {
              const parsed = JSON.parse(stored);
              setConversations(parsed);
              if (parsed.length > 0 && !currentConversationId) {
                setCurrentConversationId(parsed[0].id);
              }
            } catch (error) {
              console.error('Failed to parse stored conversations:', error);
            }
          }
        }
      } catch (error) {
        console.error('Failed to load conversations:', error);
        toast.error('加载对话失败');
      } finally {
        setIsLoadingConversations(false);
      }
    };

    loadConversations();
  }, [user]);

  // 未登录用户保存到localStorage
  useEffect(() => {
    if (!user && conversations.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    }
  }, [conversations, user]);

  // 懒加载对话消息
  useEffect(() => {
    const loadConversationMessages = async () => {
      if (!user || !currentConversationId) return;
      
      // 查找当前对话
      const currentConv = conversations.find(c => c.id === currentConversationId);
      
      // 只有当对话不存在或者消息数组已经被初始化时才不加载
      // 当消息数组未定义或为null时才需要加载
      if (!currentConv || currentConv.messages !== undefined) {
        // 已经有消息数组（即使是空数组），不重新加载
        return;
      }
      
      try {
        const messages = await messageService.getMessages(currentConversationId);
        console.log('Loaded messages from database:', messages);
        
        if (messages && messages.length > 0) {
          // 转换数据库格式到前端格式
          const formattedMessages = await Promise.all(
            messages.map(async (msg: any) => {
              // 获取消息的附件
              const attachments = await attachmentService.getAttachments(msg.id);
              const formattedAttachments = attachments ? attachments.map((att: any) => ({
                type: att.type,
                url: att.url,
                fileName: att.file_name,
                fileSize: att.file_size
              })) : [];
              
              return {
                id: msg.id,
                role: msg.role,
                content: msg.content,
                timestamp: new Date(msg.timestamp).getTime(),
                modelName: msg.model_name,
                modelId: msg.model_id,
                attachments: formattedAttachments
              };
            })
          );
          
          // 添加去重逻辑，防止显示重复的AI消息
          // 基于消息内容、角色和时间戳进行去重
          const uniqueMessages = formattedMessages.filter((msg, index, self) =>
            index === self.findIndex((m) =>
              m.content === msg.content &&
              m.role === msg.role &&
              Math.abs(m.timestamp - msg.timestamp) < 1000 // 允许1秒内的时间差异
            )
          );
          
          setConversations(prev =>
            prev.map(conv =>
              conv.id === currentConversationId
                ? { ...conv, messages: uniqueMessages }
                : conv
            )
          );
        } else {
          console.log('No messages found for conversation:', currentConversationId);
          // 确保设置空数组，避免显示加载中的状态
          setConversations(prev =>
            prev.map(conv =>
              conv.id === currentConversationId
                ? { ...conv, messages: [] }
                : conv
            )
          );
        }
      } catch (error) {
        console.error('Failed to load conversation messages:', error);
        toast.error('加载消息失败，请刷新页面重试');
      }
    };

    loadConversationMessages();
  }, [currentConversationId, user, conversations]); // 添加conversations依赖，确保刷新页面时能正确加载当前对话消息

  const currentConversation = conversations.find(c => c.id === currentConversationId);

  // 当切换对话时更新URL参数
  useEffect(() => {
    if (currentConversationId) {
      const urlParams = new URLSearchParams(window.location.search);
      urlParams.set('id', currentConversationId);
      window.history.replaceState({}, '', `?${urlParams.toString()}`);
    }
  }, [currentConversationId]);

  const createNewConversation = useCallback(async () => {
    try {
      const timestamp = Date.now();
      let newConversation: Conversation;
      
      if (user) {
        // 已登录用户：先保存到数据库获取正确的UUID
        try {
          const savedConversation = await conversationService.createConversation(user.id, '新对话');
          
          if (savedConversation) {
            newConversation = {
              id: savedConversation.id,
              title: savedConversation.title,
              messages: undefined,
              createdAt: timestamp,
              updatedAt: timestamp
            };
          } else {
            // 如果数据库操作失败，使用本地生成的UUID
            const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
              const r = Math.random() * 16 | 0;
              const v = c === 'x' ? r : (r & 0x3 | 0x8);
              return v.toString(16);
            });
            newConversation = {
              id: uuid,
              title: '新对话',
              messages: undefined,
              createdAt: timestamp,
              updatedAt: timestamp
            };
          }
        } catch (dbError) {
          console.error('Failed to save conversation to database:', dbError);
          toast.error('创建对话时数据库错误');
          // 即使数据库错误，也要生成有效的UUID格式
          const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });
          newConversation = {
            id: uuid,
            title: '新对话',
            messages: undefined,
            createdAt: timestamp,
            updatedAt: timestamp
          };
        }
      } else {
        // 未登录用户：使用本地生成的UUID格式，而不是conv-timestamp格式
        const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
        newConversation = {
          id: uuid,
          title: '新对话',
          messages: undefined,
          createdAt: timestamp,
          updatedAt: timestamp
        };
      }
      
      // 添加到conversations列表并设置为当前对话
      setConversations(prev => [newConversation, ...prev]);
      setCurrentConversationId(newConversation.id);
      return newConversation;
    } catch (error) {
      console.error('Failed to create conversation:', error);
      toast.error('创建对话失败');
      throw error;
    }
  }, [user]);


  const deleteConversation = useCallback(async (id: string) => {
    try {
      if (user) {
        // 已登录用户：从数据库删除
        await conversationService.deleteConversation(id, user.id);
      }
      
      setConversations(prev => {
        const filtered = prev.filter(c => c.id !== id);
        if (currentConversationId === id && filtered.length > 0) {
          setCurrentConversationId(filtered[0].id);
        } else if (filtered.length === 0) {
          setCurrentConversationId(null);
        }
        return filtered;
      });
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      toast.error('删除对话失败');
    }
  }, [currentConversationId, user]);

  const updateConversationTitle = useCallback(async (id: string, title: string) => {
    const timestamp = Date.now();
    
    try {
      if (user) {
        // 已登录用户：更新数据库
        await conversationService.updateConversation(id, user.id, {
          title,
          updatedAt: new Date(timestamp)
        });
      }
      
      setConversations(prev =>
        prev.map(c => c.id === id ? { ...c, title, updatedAt: timestamp } : c)
      );
    } catch (error) {
      console.error('Failed to update conversation title:', error);
      toast.error('更新对话标题失败');
    }
  }, [user]);

  const clearConversation = useCallback((id: string) => {
    setConversations(prev =>
      prev.map(c => c.id === id ? { ...c, messages: [], updatedAt: Date.now() } : c)
    );
  }, []);

  // AI自动生成对话标题
  const generateConversationTitle = useCallback(async (conversationId: string, firstMessage: string) => {
    let activeModel = null;
    if (user?.id) {
      activeModel = await getActiveModelWithApiKey(user.id);
    }
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
        userId: user?.id,
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

    // 重置AI回复内容ref
    assistantContentRef.current = '';
    
    let activeModel: ModelConfig | null = null;
    let conversation: Conversation | null = null;
    let isFirstMessage: boolean = false;
    let timestamp: number = 0;
    let userMessageId: string = '';
    let userMessage: ChatMessage = { id: '', role: 'user', content: '', timestamp: 0 };
    let assistantMessageId: string = '';
    let assistantMessage: ChatMessage = { id: '', role: 'assistant', content: '', timestamp: 0 };

    try {
      // 获取当前激活的模型配置
      activeModel = user?.id ? await getActiveModelWithApiKey(user.id) : null;
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

      conversation = currentConversation || null;
      if (!conversation) {
        conversation = await createNewConversation();
      }

      isFirstMessage = !conversation.messages || conversation.messages.length === 0;
      timestamp = Date.now();
      userMessageId = generateUUID();
      
      userMessage = {
        id: userMessageId,
        role: 'user' as const,
        content: content.trim(),
        timestamp: timestamp,
        attachments: attachments
      };

      // 创建assistant消息，记录当前使用的模型信息
      assistantMessageId = generateUUID();
      assistantMessage = {
        id: assistantMessageId,
        role: 'assistant' as const,
        content: '',
        timestamp: timestamp,
        modelName: activeModel.name,
        modelId: activeModel.id
      };

      // 添加用户消息和空的AI助手消息
      setConversations(prev =>
        prev.map(c =>
          c.id === conversation!.id
            ? {
                ...c,
                messages: [...(c.messages || []), userMessage, assistantMessage],
                updatedAt: timestamp
              }
            : c
        )
      );

      // 已登录用户：保存用户消息到数据库
      if (user) {
        try {
          await messageService.createMessage({
            conversationId: conversation.id,
            role: 'user',
            content: userMessage.content,
            timestamp: new Date(userMessage.timestamp),
            modelName: activeModel.name,
            modelId: activeModel.id
          });
        } catch (dbError) {
          console.error('Failed to save user message to database:', dbError);
        }
      }

      setIsLoading(true);
      abortControllerRef.current = new AbortController();

      // 使用原有的sendChatStream函数
      await sendChatStream({
        endpoint: activeModel.apiUrl,
        apiKey: activeModel.apiKey,
        modelConfig: activeModel,
        messages: [...(conversation?.messages || []), userMessage],
        userId: user?.id,
        onUpdate: (content: string) => {
          // 保存最新的AI回复内容到ref
          assistantContentRef.current = content;
          setConversations(prev =>
            prev.map(c =>
              c.id === conversation!.id
                ? {
                    ...c,
                    messages: (c.messages || []).map(m =>
                      m.id === assistantMessage.id ? { ...m, content } : m
                    )
                  }
                : c
            )
          );
        },
        onComplete: async () => {
          setIsLoading(false);
          abortControllerRef.current = null;

          // 已登录用户：保存新的AI回复到数据库
          if (user && conversation && activeModel) {
            try {
              await messageService.createMessage({
                conversationId: conversation.id,
                role: 'assistant',
                content: assistantContentRef.current || '', // 使用ref中的最新内容，提供默认值
                timestamp: new Date(assistantMessage.timestamp),
                modelName: activeModel.name,
                modelId: activeModel.id
              });
              
              // 更新对话的更新时间戳
              await conversationService.updateConversation(conversation.id, user.id, {
                updatedAt: new Date(assistantMessage.timestamp)
              });
            } catch (dbError) {
              console.error('Failed to save AI message to database:', dbError);
            }
          }

          if (isFirstMessage) {
            // AI回复完成后生成对话标题
            if (conversation) {
              generateConversationTitle(conversation.id, content.trim());
            }
          }
        },
        onError: (error: Error) => {
          setIsLoading(false);
          abortControllerRef.current = null;
          toast.error('发送消息失败', {
            description: error.message || '请检查模型配置或稍后重试'
          });
        },
        signal: abortControllerRef.current.signal
      });

    } catch (error) {
      console.error('Send message error:', error);
      toast.error('获取模型配置或发送消息失败', {
        description: '请检查模型配置或稍后重试'
      });
    } finally {
      // 确保无论如何都重置loading状态
      if (!abortControllerRef.current) {
        setIsLoading(false);
      }
    }
  }, [currentConversation, isLoading, createNewConversation, generateConversationTitle]);


  const stopGeneration = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
      
      // 将已生成的内容保存到数据库
      if (user && currentConversation && assistantContentRef.current) {
        try {
          // 找到最新的助手消息
          const latestAssistantMessage = currentConversation.messages?.find(m => m.role === 'assistant') || null;
          if (latestAssistantMessage) {
            // 保存到数据库
            await messageService.createMessage({
              conversationId: currentConversation.id,
              role: 'assistant',
              content: assistantContentRef.current,
              timestamp: new Date(latestAssistantMessage.timestamp),
              modelName: latestAssistantMessage.modelName,
              modelId: latestAssistantMessage.modelId
            });
            
            // 更新对话的更新时间戳
            await conversationService.updateConversation(currentConversation.id, user.id, {
              updatedAt: new Date(latestAssistantMessage.timestamp)
            });
            
            console.log('成功保存停止生成后的AI回复到数据库');
          }
        } catch (dbError) {
          console.error('保存停止生成后的AI回复失败:', dbError);
          // 不抛出错误，避免影响用户体验
        }
      }
    }
  }, [user, currentConversation]);

  const exportConversation = useCallback((id: string) => {
    const conversation = conversations.find(c => c.id === id);
    if (!conversation) return;

    const content = (conversation.messages || [])
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

  // 保存最新生成的内容的ref
  const generatedContentRef = useRef('');
  
  // 重试生成回复
  const retryMessage = useCallback(async (messageId: string) => {
    if (!currentConversation || isLoading) return;

    // 找到要重试的消息
    const messageIndex = currentConversation.messages?.findIndex(m => m.id === messageId) ?? -1;
    if (messageIndex === -1 || !currentConversation.messages || currentConversation.messages[messageIndex].role !== 'assistant') return;

    // 找到对应的用户消息
    const userMessageIndex = messageIndex - 1;
    if (userMessageIndex < 0 || !currentConversation.messages || currentConversation.messages[userMessageIndex].role !== 'user') return;

    const activeModel = user?.id ? await getActiveModelWithApiKey(user.id) : null;
    if (!activeModel) {
      toast.error('请先配置AI模型');
      return;
    }

    // 不需要移除任何消息，只获取当前AI回复之前的消息作为上下文
    const contextMessages = currentConversation.messages?.slice(0, userMessageIndex + 1) || [];
    
    // 保存当前AI消息的ID和原始时间戳，用于更新
    const originalMessageId = currentConversation.messages[messageIndex].id;
    const originalTimestamp = currentConversation.messages[messageIndex].timestamp;
    
    // 重置ref内容
    generatedContentRef.current = '';
    
    // 更新为新的AI消息（保留原有ID）
    const updatedAssistantMessage: ChatMessage = {
      id: originalMessageId, // 保持原有ID不变
      role: 'assistant',
      content: '', // 初始为空
      timestamp: originalTimestamp, // 保持原有时间戳
      modelName: activeModel.name,
      modelId: activeModel.id
    };

    // 更新UI显示为加载状态
    setConversations(prev =>
      prev.map(c =>
        c.id === currentConversation.id
          ? {
              ...c,
              messages: (c.messages || []).map(m =>
                m.id === originalMessageId ? updatedAssistantMessage : m
              ),
              updatedAt: Date.now()
            }
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
        messages: contextMessages,
        userId: user?.id,
        onUpdate: (content: string) => {
          // 更新相同ID的消息内容
          setConversations(prev =>
            prev.map(c =>
              c.id === currentConversation.id
                ? {
                    ...c,
                    messages: (c.messages || []).map(m =>
                      m.id === originalMessageId ? { ...m, content } : m
                    )
                  }
                : c
            )
          );
          // 同时更新ref中的内容
          generatedContentRef.current = content;
        },
        onComplete: async () => {
          setIsLoading(false);
          abortControllerRef.current = null;
          
          // 已登录用户：更新数据库中的AI回复
          if (user) {
            try {
              // 使用ref中保存的最新内容
              const latestContent = generatedContentRef.current;
              
              console.log('Updating message in database:', {
                messageId: originalMessageId,
                contentLength: latestContent.length,
                conversationId: currentConversation.id
              });
              
              // 使用updateMessage更新现有消息
              const updateResult = await messageService.updateMessage(originalMessageId, {
                content: latestContent,
                modelName: activeModel.name,
                modelId: activeModel.id
              });
              
              if (updateResult) {
                console.log('Message updated successfully in database:', originalMessageId);
              } else {
                console.log('Message not found in database, skipping update:', originalMessageId);
              }
              
              // 更新对话的更新时间戳
              await conversationService.updateConversation(currentConversation.id, user.id, {
                updatedAt: new Date()
              });
            } catch (dbError) {
              console.error('Failed to update AI message in database:', dbError);
              toast.warning('消息已更新，但数据库同步失败');
            }
          }
        },
        onError: (error: Error) => {
          setIsLoading(false);
          abortControllerRef.current = null;
          toast.error('重新生成失败', {
            description: error.message || '请检查模型配置或稍后重试'
          });
        },
        signal: abortControllerRef.current.signal
      });
    } catch (error) {
      console.error('Retry message error:', error);
    }
  }, [currentConversation, isLoading]);

  // 从指定消息创建分支对话
  const branchConversation = useCallback(async (messageId?: string) => {
    if (!currentConversation || !currentConversation.messages || currentConversation.messages.length === 0) return;

    let messageIndex: number;
    if (messageId) {
      // 基于指定消息分支
      messageIndex = currentConversation.messages?.findIndex(m => m.id === messageId) ?? -1;
      if (messageIndex === -1) return;
    } else {
      // 默认找到上一条用户消息
      const lastUserMessageIndex = [...currentConversation.messages]
        .reverse()
        .findIndex(m => m.role === 'user');
      
      if (lastUserMessageIndex === -1) return;
      messageIndex = currentConversation.messages.length - 1 - lastUserMessageIndex;
    }

    // 复制该消息之前的所有消息（包括该消息）
    const messagesUpToBranch = currentConversation.messages.slice(0, messageIndex + 1);
    const timestamp = Date.now();
    
    const newConversation: Conversation = {
      id: `conv-${timestamp}`,
      title: `${currentConversation.title} (分支)`,
      messages: messagesUpToBranch,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    // 添加到对话列表并切换
    setConversations(prev => [newConversation, ...prev]);
    setCurrentConversationId(newConversation.id);
    
    // 已登录用户：保存分支对话到数据库
    if (user) {
      try {
        // 创建新对话记录
        const savedConversation = await conversationService.createConversation(user.id, newConversation.title);
        
        if (savedConversation) {
          // 更新本地对话ID为数据库ID
          setConversations(prev =>
            prev.map(c =>
              c.id === newConversation.id
                ? { ...c, id: savedConversation.id }
                : c
            )
          );
          setCurrentConversationId(savedConversation.id);
          
          // 复制所有消息到新对话
          for (const message of messagesUpToBranch) {
            // 创建新消息记录
            const savedMessage = await messageService.createMessage({
              conversationId: savedConversation.id,
              role: message.role,
              content: message.content,
              timestamp: new Date(message.timestamp),
              modelName: message.modelName,
              modelId: message.modelId
            });
            
            // 如果有附件，复制附件
            if (message.attachments && savedMessage) {
              for (const attachment of message.attachments) {
                await attachmentService.createAttachment({
                  messageId: savedMessage.id,
                  type: attachment.type,
                  url: attachment.url,
                  fileName: attachment.fileName,
                  fileSize: attachment.fileSize
                });
              }
            }
          }
        }
      } catch (dbError) {
        console.error('Failed to save branch conversation to database:', dbError);
        toast.warning('分支对话已创建，但数据库同步失败');
      }
    }
  }, [currentConversation, user]);

  // 编辑消息并重新生成回复
  const editMessage = useCallback(async (messageId: string, newContent: string) => {
    if (!currentConversation || isLoading) return;

    // 找到要编辑的用户消息
    const messageIndex = currentConversation.messages?.findIndex(m => m.id === messageId) ?? -1;
    if (messageIndex === -1 || !currentConversation.messages || currentConversation.messages[messageIndex].role !== 'user') return;

    // 查找对应的AI消息（如果存在）
    let correspondingAssistantMessageId = null;
    if (messageIndex + 1 < currentConversation.messages.length && 
        currentConversation.messages[messageIndex + 1].role === 'assistant') {
      // 保留现有的AI消息ID，这样就不会创建新的消息记录
      correspondingAssistantMessageId = currentConversation.messages[messageIndex + 1].id;
    } else {
      // 如果没有对应的AI消息，生成一个新的
      correspondingAssistantMessageId = generateUUID();
    }

    // 保留用户消息之前的所有消息，加上编辑后的用户消息和空内容的AI消息
    const messagesBefore = currentConversation.messages?.slice(0, messageIndex) || [];
    const editedMessage = { ...currentConversation.messages[messageIndex], content: newContent };
    const assistantMessage = { 
      id: correspondingAssistantMessageId, 
      role: 'assistant' as const, 
      content: '', 
      timestamp: Date.now() 
    };
    const timestamp = Date.now();

    // 更新前端状态
    setConversations(prev =>
      prev.map(c =>
        c.id === currentConversation.id
          ? { ...c, messages: [...messagesBefore, editedMessage, assistantMessage], updatedAt: timestamp }
          : c
      )
    );

    // 已登录用户：更新数据库中的消息
    if (user) {
      try {
        // 1. 更新用户消息内容
        await messageService.updateMessage(messageId, {
          content: newContent,
          modelName: editedMessage.modelName,
          modelId: editedMessage.modelId
        });
        console.log('成功更新用户消息', { messageId });
        
        // 2. 更新对话的updatedAt
        await conversationService.updateConversation(currentConversation.id, user.id, {
          updatedAt: new Date(timestamp)
        });
        
        // 3. 删除用户消息和AI消息对之后的所有消息
        // 注意：我们只保留到AI消息为止，删除之后的所有消息
        if (currentConversation.messages) {
          // 计算要保留的消息数量：当前用户消息 + 可能存在的AI消息
          let messagesAfterIndex = messageIndex + 1; // 至少保留当前用户消息
          
          // 如果下一条消息是AI消息，我们也要保留它，只删除其后的消息
          if (messageIndex + 1 < currentConversation.messages.length && 
              currentConversation.messages[messageIndex + 1].role === 'assistant') {
            messagesAfterIndex = messageIndex + 2; // 保留用户消息和AI消息
          }
          
          if (messagesAfterIndex < currentConversation.messages.length) {
            const messagesToDelete = currentConversation.messages.slice(messagesAfterIndex);
            console.log(`开始删除${messagesToDelete.length}条后续消息`);
            
            for (const message of messagesToDelete) {
              try {
                console.log('删除后续消息', { messageId: message.id, role: message.role });
                await messageService.deleteMessage(message.id);
                console.log('删除消息成功', { messageId: message.id });
              } catch (deleteError) {
                console.error('删除消息失败', { messageId: message.id, error: deleteError });
                // 即使某条消息删除失败，继续删除其他消息
                continue;
              }
            }
          }
        }
      } catch (dbError) {
        console.error('数据库操作失败:', dbError);
      }
    }

    // 重置ref内容，用于跟踪最新生成的AI回复
    generatedContentRef.current = '';

    setIsLoading(true);
    abortControllerRef.current = new AbortController();

    const activeModel = user?.id ? await getActiveModelWithApiKey(user.id) : null;
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
        userId: user?.id,
        onUpdate: (content: string) => {
          setConversations(prev =>
            prev.map(c =>
              c.id === currentConversation.id
                ? {
                  ...c,
                  messages: (c.messages || []).map(m =>
                    m.id === assistantMessage.id ? { ...m, content } : m
                  )
                }
                : c
            )
          );
          // 更新ref中的内容，确保在onComplete时能获取到最新值
          generatedContentRef.current = content;
        },
        onComplete: async () => {
          setIsLoading(false);
          abortControllerRef.current = null;
          
          // 已登录用户：更新数据库中的AI回复
          if (user) {
            try {
              // 使用ref中保存的最新内容
              const latestContent = generatedContentRef.current;
              
              console.log('更新AI消息到数据库:', {
                messageId: correspondingAssistantMessageId,
                contentLength: latestContent.length,
                conversationId: currentConversation.id
              });
              
              // 检查该AI消息是否已存在于数据库中
              try {
                // 尝试更新现有消息
                await messageService.updateMessage(correspondingAssistantMessageId, {
                  content: latestContent,
                  modelName: activeModel.name,
                  modelId: activeModel.id
                });
                console.log('成功更新AI消息到数据库:', correspondingAssistantMessageId);
              } catch (updateError) {
                // 如果更新失败（可能是消息不存在），则创建新消息
                console.log('AI消息不存在于数据库，创建新消息:', correspondingAssistantMessageId);
                await messageService.createMessage({
                  conversationId: currentConversation.id,
                  content: latestContent,
                  role: 'assistant',
                  timestamp: new Date(timestamp),
                  modelName: activeModel.name,
                  modelId: activeModel.id
                });
                console.log('成功创建AI消息到数据库:', correspondingAssistantMessageId);
              }
            } catch (dbError) {
              console.error('AI消息数据库同步失败:', dbError);
              toast.warning('AI回复已生成，但数据库同步失败');
            }
          }
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
                  messages: (c.messages || []).filter(m => m.id !== assistantMessage.id)
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

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!currentConversation) return;

    const msgs = currentConversation.messages || [];
    const index = msgs.findIndex(m => m.id === messageId);
    if (index === -1) return;

    const target = msgs[index];
    const timestamp = Date.now();
    
    // 确定要删除的消息ID列表
    const messageIdsToDelete: string[] = [];
    let newMessages = [...msgs];

    if (target.role === 'user') {
      // 如果删除的是用户消息，且下一条是 assistant，则一起删除
      if (msgs[index + 1]?.role === 'assistant') {
        messageIdsToDelete.push(messageId, msgs[index + 1].id);
        newMessages.splice(index, 2);
      } else {
        messageIdsToDelete.push(messageId);
        newMessages.splice(index, 1);
      }
    } else if (target.role === 'assistant') {
      // 如果删除的是 AI 消息，且前一条是 user，则一起删除
      if (msgs[index - 1]?.role === 'user') {
        messageIdsToDelete.push(msgs[index - 1].id, messageId);
        newMessages.splice(index - 1, 2);
      } else {
        messageIdsToDelete.push(messageId);
        newMessages.splice(index, 1);
      }
    }

    // 更新UI
    setConversations(prev =>
      prev.map(c => {
        if (c.id !== currentConversation.id) return c;
        return {
          ...c,
          messages: newMessages,
          updatedAt: timestamp,
        };
      })
    );

    // 已登录用户：从数据库删除消息
    if (user) {
      try {
        // 更新对话的updatedAt
        await conversationService.updateConversation(currentConversation.id, user.id, {
          updatedAt: new Date(timestamp)
        });
        
        // 删除消息
        for (const id of messageIdsToDelete) {
          await messageService.deleteMessage(id);
        }
      } catch (dbError) {
        console.error('Failed to delete messages from database:', dbError);
        toast.warning('消息已在本地删除，但数据库同步失败');
      }
    }
  }, [currentConversation, user]);


  return {
    conversations,
    currentConversation,
    currentConversationId,
    isLoading,
    isLoadingConversations,
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