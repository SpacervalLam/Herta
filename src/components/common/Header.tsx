import { memo, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Check, Copy } from 'lucide-react';

/**
 * 通用 Button 组件（简化版，用 Tailwind 实现）
 */
const Button = ({
  onClick,
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    onClick={onClick}
    className={`flex items-center px-2.5 py-1.5 text-sm rounded-lg border border-gray-300
      bg-white hover:bg-gray-100 active:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700
      dark:border-gray-700 transition-colors ${className}`}
    {...props}
  >
    {children}
  </button>
);

/**
 * 可复制代码块组件
 */
const CodeBlock = ({ className, children }: { className?: string; children: React.ReactNode }) => {
  const [copied, setCopied] = useState(false);

  const code = useMemo(() => {
    if (typeof children === 'string') return children.replace(/\n$/, '');
    if (children && typeof children === 'object' && 'props' in children) {
      const props = (children as any).props as { children?: React.ReactNode };
      return String(props.children || '').replace(/\n$/, '');
    }
    return String(children).replace(/\n$/, '');
  }, [children]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="relative group my-3 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm">
      <pre className="bg-gray-50 dark:bg-gray-900 text-sm leading-relaxed p-4 overflow-x-auto">
        <code className={className}>{children}</code>
      </pre>
      <Button
        onClick={handleCopy}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
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
  );
};

/**
 * Markdown + KaTeX 渲染主组件
 */
interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const MarkdownRenderer = memo(({ content, className = '' }: MarkdownRendererProps) => {
  const processedContent = useMemo(() => {
    let processed = content;
    processed = processed
      .replace(/\\\[([\s\S]*?)\\\]/g, (_, p1) => `$$${p1}$$`)
      .replace(/\\\(([\s\S]*?)\\\)/g, (_, p1) => `$${p1}$`);
    return processed;
  }, [content]);

  return (
    <div
      className={`prose prose-neutral dark:prose-invert max-w-none text-[15px] leading-relaxed
        prose-pre:p-0 prose-code:before:content-none prose-code:after:content-none
        prose-blockquote:border-l-4 prose-blockquote:border-indigo-500/60 prose-blockquote:pl-4
        prose-img:rounded-xl prose-table:border prose-table:border-gray-300 dark:prose-table:border-gray-700
        prose-th:border prose-td:border prose-th:border-gray-300 prose-td:border-gray-300
        dark:prose-th:border-gray-700 dark:prose-td:border-gray-700 ${className}`}
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
              <code
                className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono"
                {...props}
              >
                {children}
              </code>
            ) : (
              <CodeBlock className={className}>{children}</CodeBlock>
            );
          },
          h1({ children }) {
            return <h1 className="text-3xl font-bold my-4 border-b pb-2">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-2xl font-semibold my-3">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-xl font-semibold my-2">{children}</h3>;
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
          blockquote({ children }) {
            return (
              <blockquote className="italic text-gray-600 dark:text-gray-400 border-l-4 pl-4 my-3">
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
                className="text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                {children}
              </a>
            );
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-3">
                <table className="border-collapse border border-gray-300 dark:border-gray-700 min-w-full">
                  {children}
                </table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="bg-gray-100 dark:bg-gray-800">{children}</thead>;
          },
          th({ children }) {
            return (
              <th className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-left font-semibold">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="border border-gray-300 dark:border-gray-700 px-4 py-2">
                {children}
              </td>
            );
          },
          hr() {
            return <hr className="my-4 border-gray-300 dark:border-gray-700" />;
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
