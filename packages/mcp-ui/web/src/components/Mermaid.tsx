import { useEffect, useRef, useState } from "react";

let seq = 0;

export function Mermaid({ source, dark }: { source: string; dark?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      import("mermaid")
        .then(async ({ default: mermaid }) => {
          mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "neutral", securityLevel: "strict" });
          await mermaid.parse(source);
          const { svg } = await mermaid.render(`mmd-${++seq}`, source);
          if (!cancelled && ref.current) {
            ref.current.innerHTML = svg;
            setError(null);
          }
        })
        .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : String(err)));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [source, dark]);
  return (
    <div>
      <div ref={ref} className={error ? "opacity-30" : "flex justify-center overflow-x-auto [&_svg]:max-w-full"} />
      {error && <div className="mt-2 rounded-lg bg-rose-50 p-2 font-mono text-xs text-rose-700 dark:bg-rose-950 dark:text-rose-300">{error.split("\n").slice(0, 4).join("\n")}</div>}
    </div>
  );
}
