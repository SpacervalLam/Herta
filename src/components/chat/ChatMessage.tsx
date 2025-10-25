import { memo, useState, useEffect } from 'react';
import { Bot, Copy, RotateCw, GitBranch, Check, Edit2, X, Image as ImageIcon, Mic, Video } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { ChatMessage as ChatMessageType } from '@/types/chat';
import MarkdownRenderer from './MarkdownRenderer';
import { toast } from 'sonner';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface ChatMessageProps {
  message: ChatMessageType;
  modelName?: string;
  onRetry?: (messageId: string) => void;
  onBranch?: (messageId: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
}

// 简笔画小人头像SVG组件
const UserAvatarIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
    <circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M6 21C6 17.134 8.686 14 12 14C15.314 14 18 17.134 18 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ChatMessage = memo(({ message, modelName, onRetry, onBranch, onEdit }: ChatMessageProps) => {
  const isUser = message.role === 'user';
  // 优先使用消息自带的模型名称，这样切换模型后历史消息的模型名称不会改变
  const displayName = isUser ? '你' : (message.modelName || modelName || 'AI助手');
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content);
  const [showReasoning, setShowReasoning] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);

  // 处理思维链内容 - 优化流式处理
  const parseContent = (content: string) => {
    const startTag = '<think>';
    const endTag = '</think>';

    const hasStartTag = content.includes(startTag);
    const hasEndTag = content.includes(endTag);

    if (hasStartTag && hasEndTag) {
      // 完整的思维链 - 提取思维链和正文
      const startIndex = content.indexOf(startTag);
      const endIndex = content.indexOf(endTag);

      const reasoning = content.substring(startIndex + startTag.length, endIndex).trim();
      const beforeReasoning = content.substring(0, startIndex).trim();
      const afterReasoning = content.substring(endIndex + endTag.length).trim();

      const mainContent = (beforeReasoning + ' ' + afterReasoning).trim();
      const reasoningTime = Math.ceil(reasoning.length / 50);

      // 只有当思维链内容不为空时才显示思考框
      const hasValidReasoning = reasoning.length > 0;

      return {
        mainContent,
        reasoning,
        reasoningTime,
        hasReasoning: hasValidReasoning,
        isStreamingReasoning: false,
        isComplete: true
      };
    } else if (hasStartTag && !hasEndTag) {
      // 正在流式输出思维链
      const startIndex = content.indexOf(startTag);
      const reasoning = content.substring(startIndex + startTag.length).trim();
      const mainContent = content.substring(0, startIndex).trim();
      const reasoningTime = Math.ceil(reasoning.length / 50);

      // 只有当思维链内容不为空时才显示思考框
      const hasValidReasoning = reasoning.length > 0;

      return {
        mainContent,
        reasoning,
        reasoningTime,
        hasReasoning: hasValidReasoning,
        isStreamingReasoning: true,
        isComplete: false
      };
    }

    return {
      mainContent: content,
      reasoning: '',
      reasoningTime: 0,
      hasReasoning: false,
      isStreamingReasoning: false,
      isComplete: false
    };
  };

  const { mainContent, reasoning, reasoningTime, hasReasoning, isStreamingReasoning, isComplete } = parseContent(message.content);

  // 当思维链完成时，自动收纳
  useEffect(() => {
    if (hasReasoning && isComplete && !isStreamingReasoning) {
      setShowReasoning(false);
    }
  }, [hasReasoning, isComplete, isStreamingReasoning]);

  const handleCopy = async () => {
    try {
      // 使用多种方法尝试复制
      if (navigator.clipboard && navigator.clipboard.writeText) {
        const cleanedContent = message.content.replace(/[\s\S]*?<\/think>/g, '').trim();
        await navigator.clipboard.writeText(cleanedContent);
      } else {
        // 降级方案：使用传统的document.execCommand
        const textArea = document.createElement('textarea');
        textArea.value = message.content;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
          textArea.remove();
        } catch (err) {
          textArea.remove();
          throw err;
        }
      }
      setCopied(true);
      toast.success('已复制到剪贴板');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('复制失败:', error);
      toast.error('复制失败，请手动复制');
    }
  };

  const handleRetry = () => {
    if (onRetry) {
      onRetry(message.id);
      toast.info('正在重新生成回复...');
    }
  };

  const handleBranch = () => {
    if (onBranch) {
      onBranch(message.id);
      toast.success('已创建新分支对话');
    }
  };

  const handleStartEdit = () => {
    setIsEditing(true);
    setEditedContent(message.content);
  };

  const handleSaveEdit = () => {
    if (onEdit && editedContent.trim() && editedContent !== message.content) {
      onEdit(message.id, editedContent.trim());
      setIsEditing(false);
      toast.success('消息已修改，正在重新生成回复...');
    } else {
      setIsEditing(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedContent(message.content);
  };

  const handleImageClick = (src: string) => {
    setSelectedImage(src);
    setImageDialogOpen(true);
  };

  return (
    <div className={cn('group flex gap-4 p-4 relative', isUser ? 'bg-background' : 'bg-muted/50')}>
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className={cn(isUser ? 'bg-primary text-primary-foreground' : 'bg-secondary')}>
          {isUser ? <UserAvatarIcon /> : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 space-y-2 overflow-hidden">
        <div className="font-semibold text-sm">
          {displayName}
        </div>

        {isEditing ? (
          // 编辑模式
          <div className="space-y-2">
            <Textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              className="min-h-[100px] resize-none"
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSaveEdit}
                disabled={!editedContent.trim()}
              >
                <Check className="h-3 w-3 mr-1" />
                保存并重新生成
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCancelEdit}
              >
                <X className="h-3 w-3 mr-1" />
                取消
              </Button>
            </div>
          </div>
        ) : (
          // 显示模式
          <>
            {/* 思维链展开/收纳按钮 - 只在完整思维链时显示 */}
            {hasReasoning && isComplete && !isUser && (
              <div className="mb-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setShowReasoning(!showReasoning)}
                >
                  {showReasoning ? '收起' : '已思考'} {reasoningTime}s {showReasoning ? '⮟' : '>'}
                </Button>
              </div>
            )}

            {/* 流式思维链内容 - 实时显示，灰色字体 */}
            {hasReasoning && isStreamingReasoning && !isUser && (
              <div className="mb-3 p-3 bg-muted/20 rounded-lg border-l-2 border-muted-foreground/30 animate-in slide-in-from-top-2 duration-200">
                <div className="text-xs text-muted-foreground mb-2 font-medium flex items-center gap-2">
                  <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse"></div>
                  思考中...
                </div>
                <div className="prose prose-sm dark:prose-invert max-w-none break-words text-muted-foreground/70 [&_*]:!text-muted-foreground/70">
                  <MarkdownRenderer content={reasoning} onImageClick={handleImageClick} />
                </div>
              </div>
            )}

            {/* 完整思维链内容 - 可展开/收纳 */}
            {hasReasoning && isComplete && showReasoning && !isUser && (
              <div className="mb-3 p-3 bg-muted/30 rounded-lg border-l-2 border-muted-foreground/20">
                <div className="text-xs text-muted-foreground mb-2 font-medium">思考过程：</div>
                <div className="prose prose-sm dark:prose-invert max-w-none break-words text-muted-foreground/70 [&_*]:!text-muted-foreground/70">
                  <MarkdownRenderer content={reasoning} onImageClick={handleImageClick} />
                </div>
              </div>
            )}


            {/* 附件显示 */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="mb-3 space-y-2">
                {message.attachments.map((attachment, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                    {attachment.type === 'image' && (
                      <div className="flex items-center gap-2">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        <img 
                          src={attachment.url} 
                          alt="图片" 
                          className="max-w-[200px] max-h-[150px] object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => handleImageClick(attachment.url)}
                        />
                      </div>
                    )}
                    {attachment.type === 'audio' && (
                      <div className="flex items-center gap-2">
                        <Mic className="h-4 w-4 text-muted-foreground" />
                        <audio 
                          src={attachment.url} 
                          controls 
                          className="max-w-[200px]"
                        />
                      </div>
                    )}
                    {attachment.type === 'video' && (
                      <div className="flex items-center gap-2">
                        <Video className="h-4 w-4 text-muted-foreground" />
                        <video 
                          src={attachment.url} 
                          controls 
                          className="max-w-[200px] max-h-[150px] object-cover rounded"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 主要内容 */}
            <div className="prose prose-sm dark:prose-invert max-w-none break-words">
              <MarkdownRenderer content={mainContent} onImageClick={handleImageClick} />
            </div>

            {/* 消息操作按钮 */}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity pt-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={handleCopy}
              >
                {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                {copied ? '已复制' : '复制'}
              </Button>

              {isUser && onEdit && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={handleStartEdit}
                >
                  <Edit2 className="h-3 w-3 mr-1" />
                  编辑
                </Button>
              )}

              {!isUser && onRetry && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={handleRetry}
                >
                  <RotateCw className="h-3 w-3 mr-1" />
                  重新生成
                </Button>
              )}

              {!isUser && onBranch && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={handleBranch}
                >
                  <GitBranch className="h-3 w-3 mr-1" />
                  分支
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      {/* 图片查看对话框 */}
      <Dialog open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
        <DialogContent className="max-w-4xl w-[90vw] max-h-[90vh] p-0 bg-background">
          {selectedImage && (
            <div className="flex items-center justify-center h-full p-4">
              <img 
                src={selectedImage} 
                alt="预览" 
                className="max-w-full max-h-[80vh] object-contain"
                onClick={() => setImageDialogOpen(false)}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
});

export default ChatMessage;