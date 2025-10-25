import { memo, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { Highlight, themes } from 'prism-react-renderer';
import 'katex/dist/katex.min.css';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Check, Copy } from 'lucide-react';
import { useTheme } from 'next-themes';

/**
 * Markdown 渲染组件
 * - 支持 GFM（表格、列表、任务列表）
 * - 支持 KaTeX 数学公式
 * - 支持代码块复制
 * - 支持图片渲染和点击查看大图
 */
interface MarkdownRendererProps {
  content: string;
  className?: string;
  onImageClick?: (src: string) => void;
}

/* ---------------------------------- 代码块组件 ---------------------------------- */
const CodeBlock = ({ className, children }: { className?: string; children: React.ReactNode }) => {
  const [copied, setCopied] = useState(false);
  const { theme } = useTheme();


  const code = useMemo(() => {
    if (typeof children === 'string') return children.replace(/\n$/, '');
    if (children && typeof children === 'object' && 'props' in children) {
      const props = (children as any).props as { children?: React.ReactNode };
      return String(props.children || '').replace(/\n$/, '');
    }
    return String(children).replace(/\n$/, '');
  }, [children]);

  const language = useMemo(() => {
    const match = /language-(\w+)/.exec(className || '');
    return match ? match[1] : 'text';
  }, [className]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 选择主题
  const syntaxTheme = theme === 'dark' ? themes.vsDark : themes.vsLight;

  return (
    <div className="relative group my-3">
      <div className="relative">
        <Highlight
          theme={syntaxTheme}
          code={code}
          language={language}
        >
          {({ className, style, tokens, getLineProps, getTokenProps }) => (
            <pre 
              className={cn(className, "syntax-highlighter")} 
              style={{
                ...style,
                margin: 0,
                borderRadius: '12px',
                fontSize: '14px',
                lineHeight: '1.5',
                padding: '16px',
                background: 'transparent',
              }}
            >
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })}>
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </div>
              ))}
            </pre>
          )}
        </Highlight>
        <Button
          size="sm"
          variant="ghost"
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm"
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 mr-1" />
              已复制
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 mr-1" />
              复制
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

/* ---------------------------------- Markdown 主体 ---------------------------------- */
const MarkdownRenderer = memo(({ content, className, onImageClick }: MarkdownRendererProps) => {
  const processedContent = useMemo(() => {
    // 转换 LaTeX 块级与行内语法
    let processed = content;
    processed = processed
      .replace(/\\\[([\s\S]*?)\\\]/g, (_, p1) => `$$${p1}$$`) // \[ ... \] -> $$ ... $$
      .replace(/\\\(([\s\S]*?)\\\)/g, (_, p1) => `$${p1}$`);   // \( ... \) -> $ ... $
    return processed;
  }, [content]);

  return (
    <div
      className={cn(
        'prose prose-neutral dark:prose-invert max-w-none text-[15px] leading-relaxed',
        'prose-pre:p-0 prose-code:before:content-none prose-code:after:content-none',
        'prose-blockquote:border-l-4 prose-blockquote:border-primary/50 prose-blockquote:pl-4',
        'prose-img:rounded-xl prose-img:cursor-pointer prose-img:max-w-full prose-img:h-auto',
        'prose-table:border prose-table:border-border prose-table:rounded-lg',
        'prose-th:border prose-th:border-border prose-td:border prose-td:border-border',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[
          [rehypeKatex, { strict: false, throwOnError: false }]
        ]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && !className;
            return isInline ? (
              <code className="bg-muted rounded px-1.5 py-0.5 text-sm" {...props}>
                {children}
              </code>
            ) : (
              <CodeBlock className={className}>{children}</CodeBlock>
            );
          },
          img({ src, alt, ...props }) {
            return (
              <img
                src={src}
                alt={alt || "图片"}
                {...props}
                onClick={() => src && onImageClick && onImageClick(src)}
                className="rounded-xl cursor-pointer max-w-full h-auto my-4 transition-transform hover:scale-[1.02]"
              />
            );
          },
          p({ children }) {
            return <p className="my-2">{children}</p>;
          },
          ul({ children }) {
            return <ul className="list-disc list-inside my-2 space-y-1">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal list-inside my-2 space-y-1">{children}</ol>;
          },
          li({ children }) {
            return <li className="ml-2">{children}</li>;
          },
          h1({ children }) {
            return <h1 className="text-2xl font-bold my-3">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-xl font-bold my-3">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-lg font-bold my-2">{children}</h3>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="italic text-muted-foreground border-l-4 pl-4 my-3">
                {children}
              </blockquote>
            );
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {children}
              </a>
            );
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-3">
                <table className="border-collapse border border-border min-w-full">
                  {children}
                </table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="bg-muted">{children}</thead>;
          },
          th({ children }) {
            return <th className="border border-border px-4 py-2 text-left font-semibold">{children}</th>;
          },
          td({ children }) {
            return <td className="border border-border px-4 py-2">{children}</td>;
          },
          hr() {
            return <hr className="my-4 border-border" />;
          }
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
});

MarkdownRenderer.displayName = 'MarkdownRenderer';
export default MarkdownRenderer;