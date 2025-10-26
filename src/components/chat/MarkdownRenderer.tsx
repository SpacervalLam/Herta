import { memo, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { Highlight, themes } from 'prism-react-renderer';
import { useTheme } from 'next-themes';
import 'katex/dist/katex.min.css';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Check, Copy, ExternalLink } from 'lucide-react';

/**
 * Markdown 渲染组件
 * - 支持 GFM / KaTeX
 * - 支持代码块复制 / 语言标签
 * - 支持图片点击
 */
interface MarkdownRendererProps {
  content: string;
  className?: string;
  onImageClick?: (src: string) => void;
}

/* -------------------- 代码块组件 -------------------- */
const CodeBlock = memo(({ className, children }: { className?: string; children: React.ReactNode }) => {
  const [copied, setCopied] = useState(false);
  const { theme } = useTheme();

  const code = useMemo(() => {
    if (typeof children === 'string') return children.trimEnd();
    if (children && typeof children === 'object' && 'props' in children) {
      const props = (children as any).props;
      return String(props.children || '').trimEnd();
    }
    return String(children).trimEnd();
  }, [children]);

  const language = useMemo(() => /language-(\w+)/.exec(className || '')?.[1] ?? 'text', [className]);
  const syntaxTheme = theme === 'dark' ? themes.vsDark : themes.vsLight;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      console.error('复制失败');
    }
  };

  return (
    <div className="relative group my-4 rounded-xl border border-border bg-muted/40 shadow-sm overflow-hidden">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground bg-muted/60">
        <span className="font-mono text-[11px]">{language}</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 mr-1" />
              已复制
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 mr-1" />
              复制
            </>
          )}
        </Button>
      </div>

      {/* 代码内容 */}
      <Highlight theme={syntaxTheme} code={code} language={language}>
        {({ style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={cn(
              'font-mono text-sm overflow-x-auto p-4 leading-relaxed',
              'scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent'
            )}
            style={{ ...style, background: 'transparent' }}
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
    </div>
  );
});
CodeBlock.displayName = 'CodeBlock';

/* -------------------- Markdown 主体 -------------------- */
const MarkdownRenderer = memo(({ content, className, onImageClick }: MarkdownRendererProps) => {
  const processedContent = useMemo(
    () =>
      content
        .replace(/\\\[([\s\S]*?)\\\]/g, (_, p1) => `$$${p1}$$`)
        .replace(/\\\(([\s\S]*?)\\\)/g, (_, p1) => `$${p1}$`),
    [content]
  );

  return (
    <div
      className={cn(
        'prose prose-neutral dark:prose-invert max-w-none text-[15px] leading-relaxed',
        'prose-pre:p-0 prose-code:before:content-none prose-code:after:content-none',
        'prose-img:rounded-xl prose-img:cursor-pointer prose-img:max-w-full prose-img:h-auto',
        'prose-blockquote:border-l-4 prose-blockquote:border-primary/50 prose-blockquote:pl-4',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false }]]}
        components={{
          code({ className, children, ...props }) {
            const isInline = !/language-(\w+)/.test(className || '');
            return isInline ? (
              <code className="bg-muted rounded px-1.5 py-0.5 text-sm font-mono" {...props}>
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
                alt={alt || '图片'}
                {...props}
                onClick={() => src && onImageClick?.(src)}
                className="rounded-xl cursor-pointer max-w-full h-auto my-3 transition-transform hover:scale-[1.02]"
              />
            );
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="group text-primary hover:underline inline-flex items-center gap-1 transition-colors"
              >
                {children}
                <ExternalLink
                  className="w-3.5 h-3.5 opacity-0 group-hover:opacity-70 translate-x-0.5 transition-all duration-200"
                />
              </a>
            );
          },
          blockquote({ children }) {
            return (
              <blockquote className="italic text-muted-foreground border-l-4 pl-4 my-3">
                {children}
              </blockquote>
            );
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-3">
                <table className="border border-border rounded-md min-w-full">{children}</table>
              </div>
            );
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
});
MarkdownRenderer.displayName = 'MarkdownRenderer';

export default MarkdownRenderer;
