import clsx from "clsx";
import { useEffect, useId, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useUi } from "../store.ts";

let mermaidSeq = 0;

export function Mermaid({ source }: { source: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const theme = useUi((s) => s.theme);
  const key = useId();
  useEffect(() => {
    let cancelled = false;
    const dark =
      theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "neutral", securityLevel: "strict" });
        const { svg } = await mermaid.render(`mmd-${++mermaidSeq}`, source);
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
          setError(null);
        }
      })
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
    };
  }, [source, theme, key]);
  if (error) {
    return (
      <div className="not-prose rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs dark:border-amber-900 dark:bg-amber-950">
        <div className="mb-1 font-medium text-amber-700 dark:text-amber-300">Mermaid 渲染失败：{error}</div>
        <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-stone-600 dark:text-stone-300">{source}</pre>
      </div>
    );
  }
  return <div ref={ref} className="not-prose my-4 flex justify-center overflow-x-auto [&_svg]:max-w-full" />;
}

export function Markdown({ text, className, resolveAsset }: {
  text: string;
  className?: string;
  resolveAsset?: (src: string) => string;
}) {
  return (
    <div className={clsx("prose prose-stone max-w-none dark:prose-invert prose-headings:font-semibold", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className: cls, children, ...rest }) {
            const lang = /language-(\w+)/.exec(cls ?? "")?.[1];
            if (lang === "mermaid") return <Mermaid source={String(children).trim()} />;
            return (
              <code className={cls} {...rest}>
                {children}
              </code>
            );
          },
          pre({ children, ...rest }) {
            const child = Array.isArray(children) ? children[0] : children;
            const isMermaid =
              child && typeof child === "object" && "props" in child && /language-mermaid/.test(String((child.props as { className?: string }).className));
            return isMermaid ? <>{children}</> : <pre {...rest}>{children}</pre>;
          },
          img({ src, alt }) {
            const resolved = typeof src === "string" && resolveAsset && !/^https?:/.test(src) ? resolveAsset(src) : src;
            return <img src={resolved as string} alt={alt ?? ""} className="mx-auto rounded-lg" />;
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
