import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { sendChatStream } from '@/services/chatService';
import { getActiveModel } from '@/utils/modelStorage';
import type { Conversation, ChatMessage } from '@/types/chat';
import { MediaAttachment } from '@/types/chat';
import { useAuth } from '@/contexts/AuthContext';
import { conversationService, messageService, attachmentService } from '@/services/supabaseService';

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
      const newConversation: Conversation = {
        id: `conv-${timestamp}`,
        title: '新对话',
        messages: undefined, // 设置为undefined以便懒加载消息
        createdAt: timestamp,
        updatedAt: timestamp
      };
      
      if (user) {
        // 已登录用户：保存到数据库
        try {
          const savedConversation = await conversationService.createConversation({
            userId: user.id,
            title: newConversation.title,
            createdAt: new Date(timestamp),
            updatedAt: new Date(timestamp),
            userEmail: user.email,
            userName: user.user_metadata?.name || user.email?.split('@')[0]
          });
          
          if (savedConversation) {
            newConversation.id = savedConversation.id;
          }
        } catch (dbError) {
          console.error('Failed to save conversation to database:', dbError);
          toast.error('创建对话时数据库错误');
        }
      }
      
      // 不立即添加到conversations列表，只设置为当前对话
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
      conversation = await createNewConversation();
    }

    const isFirstMessage = !conversation.messages || conversation.messages.length === 0;
    const timestamp = Date.now();
    const userMessageId = `msg-${timestamp}`;
    
    const userMessage: ChatMessage = {
      id: userMessageId,
      role: 'user',
      content: content.trim(),
      timestamp: timestamp,
      attachments: attachments // 添加附件
    };

    // 创建assistant消息，记录当前使用的模型信息
    const assistantMessageId = `msg-${timestamp + 1}`;
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: timestamp,
      modelName: activeModel.name, // 记录模型名称
      modelId: activeModel.id // 记录模型ID
    };

    // 添加用户消息和空的AI助手消息
    setConversations(prev =>
      prev.map(c =>
        c.id === conversation!.id
          ? { ...c, messages: [...(c.messages || []), userMessage, assistantMessage], updatedAt: timestamp }
          : c
      )
    );

    // 已登录用户：保存用户消息到数据库
    if (user) {
      try {
        const savedMessage = await messageService.createMessage({
          conversationId: conversation.id,
          role: 'user',
          content: content.trim(),
          timestamp: new Date(timestamp)
        });
        
        // 更新本地消息ID为数据库ID
        if (savedMessage) {
            setConversations(prev =>
              prev.map(c =>
                c.id === conversation.id
                  ? {
                      ...c,
                      messages: (c.messages || []).map(m =>
                        m.id === userMessageId
                          ? { ...m, id: savedMessage.id }
                          : m
                      )
                    }
                  : c
              )
            );
            
            // 保存附件
            if (attachments) {
              for (const attachment of attachments) {
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
          
        // 如果是首次消息，标记对话为已保存
        if (isFirstMessage) {
            await conversationService.updateConversation(conversation.id, user.id, {
              updatedAt: new Date(timestamp)
            });
          } else {
            // 更新对话的updatedAt
            await conversationService.updateConversation(conversation.id, user.id, {
              updatedAt: new Date(timestamp)
            });
          }
        } catch (dbError) {
          console.error('Failed to save user message to database:', dbError);
        }
      }

    // 首次消息的标题生成将在AI回复完成后进行

    setIsLoading(true);
    abortControllerRef.current = new AbortController();

    try {
      await sendChatStream({
        endpoint: activeModel.apiUrl,
        apiKey: activeModel.apiKey,
        modelConfig: activeModel,
        messages: [...(conversation.messages || []), userMessage],
        onUpdate: (content: string) => {
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

          if (isFirstMessage) {

            // AI回复完成后生成对话标题
            generateConversationTitle(conversation.id, content.trim());
          }
          
          // 已登录用户：保存AI回复到数据库并更新对话
          if (user) {
            // 使用setConversations的函数形式获取最新状态，并保存AI回复
            setConversations(prev => {
              const targetConversation = prev.find(c => c.id === conversation.id);
              const targetAssistantMessage = targetConversation?.messages?.find(
                m => m.id === assistantMessage.id
              );
              
              if (targetAssistantMessage) {
                // 异步保存到数据库，但不阻塞UI更新
                (async () => {
                  try {
                    // 保存AI回复消息
                    const savedMessage = await messageService.createMessage({
                      conversationId: conversation.id,
                      role: 'assistant',
                      content: targetAssistantMessage.content || '',
                      timestamp: new Date(assistantMessage.timestamp),
                      modelName: activeModel.name,
                      modelId: activeModel.id
                    });
                    
                    // 更新对话的更新时间戳
                    await conversationService.updateConversation(conversation.id, user.id, {
                      updatedAt: new Date(assistantMessage.timestamp)
                    });
                    
                    // 更新本地消息ID为数据库ID
                    if (savedMessage) {
                      setConversations(innerPrev =>
                        innerPrev.map(c =>
                          c.id === conversation.id
                            ? {
                                ...c,
                                messages: (c.messages || []).map(m =>
                                  m.id === assistantMessage.id
                                    ? { ...m, id: savedMessage.id }
                                    : m
                                )
                              }
                            : c
                        )
                      );
                    }
                  } catch (dbError) {
                    console.error('Failed to save AI message to database:', dbError);
                  }
                })();
              }
              
              // 返回当前状态，不做UI更新（因为我们只是要获取最新内容用于保存）
              return prev;
            });
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
                  messages: (c.messages || []).filter(m => m.id !== assistantMessage.id)
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

  // 重试生成回复
  const retryMessage = useCallback(async (messageId: string) => {
    if (!currentConversation || isLoading) return;

    // 找到要重试的消息
    const messageIndex = currentConversation.messages?.findIndex(m => m.id === messageId) ?? -1;
    if (messageIndex === -1 || !currentConversation.messages || currentConversation.messages[messageIndex].role !== 'assistant') return;

    // 找到对应的用户消息
    const userMessageIndex = messageIndex - 1;
    if (userMessageIndex < 0 || !currentConversation.messages || currentConversation.messages[userMessageIndex].role !== 'user') return;

    const activeModel = getActiveModel();
    if (!activeModel) {
      toast.error('请先配置AI模型');
      return;
    }

    // 移除当前消息及之后的所有消息
    const messagesBefore = currentConversation.messages?.slice(0, userMessageIndex + 1) || [];

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
          if (user) {
            try {
                // 直接使用本地变量保存消息
                await messageService.createMessage({
                  conversationId: currentConversation.id,
                  role: 'assistant',
                  content: assistantMessage.content,
                  timestamp: new Date(assistantMessage.timestamp),
                  modelName: activeModel.name,
                  modelId: activeModel.id
                });
                
                // 更新对话的更新时间戳
                await conversationService.updateConversation(currentConversation.id, user.id, {
                  updatedAt: new Date(assistantMessage.timestamp)
                });
              } catch (dbError) {
                console.error('Failed to save new AI message to database:', dbError);
              }
          }
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
                  messages: (c.messages || []).filter(m => m.id !== assistantMessage.id)
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
        const savedConversation = await conversationService.createConversation({
            userId: user.id,
            title: newConversation.title,
            createdAt: new Date(timestamp),
            updatedAt: new Date(timestamp),
            userEmail: user.email,
            userName: user.user_metadata?.name || user.email?.split('@')[0]
          });
        
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

    // 找到要编辑的消息
    const messageIndex = currentConversation.messages?.findIndex(m => m.id === messageId) ?? -1;
    if (messageIndex === -1 || !currentConversation.messages || currentConversation.messages[messageIndex].role !== 'user') return;

    // 移除该消息之后的所有消息
    const messagesBefore = currentConversation.messages?.slice(0, messageIndex) || [];
    const editedMessage = currentConversation.messages ? { ...currentConversation.messages[messageIndex], content: newContent } : { id: messageId, role: 'user' as const, content: newContent, timestamp: Date.now() };
    const timestamp = Date.now();

    setConversations(prev =>
      prev.map(c =>
        c.id === currentConversation.id
          ? { ...c, messages: [...messagesBefore, editedMessage], updatedAt: timestamp }
          : c
      )
    );

    // 已登录用户：更新数据库中的消息
    if (user) {
      try {
        const message = currentConversation?.messages?.find(m => m.id === messageId);
        if (message) {
          await messageService.updateMessage(messageId, {
            content: newContent,
            modelName: message.modelName,
            modelId: message.modelId
          });
          
          // 更新对话的updatedAt
          await conversationService.updateConversation(currentConversation.id, user.id, {
            updatedAt: new Date(timestamp)
          });
        }
        
        // 删除后续的AI消息
        const messageAfterIndex = messageIndex + 1;
        if (currentConversation.messages && 
            messageAfterIndex < currentConversation.messages.length && 
            currentConversation.messages[messageAfterIndex].role === 'assistant') {
          const aiMessageId = currentConversation.messages[messageAfterIndex].id;
          await messageService.deleteMessage(aiMessageId);
        }
      } catch (dbError) {
        console.error('Failed to update message in database:', dbError);
      }
    }

    // 创建新的assistant消息
    const assistantMessageId = `msg-${timestamp + 1}`;
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: timestamp
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
                  messages: (c.messages || []).map(m =>
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