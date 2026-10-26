import { useQuery } from "@tanstack/react-query";
import type {
  ArticleSnapshot,
  ArticleSummary,
  LexiconSnapshot,
  VoiceSnapshot,
} from "@liem-opc/chat-to-article-core/types";
import { useUi } from "./store.ts";

export type ArticleListItem = ArticleSummary & { id: string };
export type ArticleDetail = ArticleSnapshot & { id: string };

export interface Context {
  version: string;
  root: string;
  home: string;
  skillDir: string | null;
  readOnly: boolean;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

function useLive() {
  const autoRefresh = useUi((s) => s.autoRefresh);
  return autoRefresh ? 4000 : (false as const);
}

export const useContext = () => useQuery({ queryKey: ["context"], queryFn: () => getJson<Context>("/api/context") });

export const useVoice = () =>
  useQuery({ queryKey: ["voice"], queryFn: () => getJson<VoiceSnapshot>("/api/voice"), refetchInterval: useLive() });

export const useLexicon = () =>
  useQuery({ queryKey: ["lexicon"], queryFn: () => getJson<LexiconSnapshot>("/api/lexicon"), refetchInterval: useLive() });

export const useArticles = () =>
  useQuery({
    queryKey: ["articles"],
    queryFn: () => getJson<ArticleListItem[]>("/api/articles"),
    refetchInterval: useLive(),
  });

export const useArticle = (id: string) =>
  useQuery({
    queryKey: ["article", id],
    queryFn: () => getJson<ArticleDetail>(`/api/articles/${id}`),
    refetchInterval: useLive(),
  });

export type MarkdownVariant = "export" | "clean" | "working";

export const markdownUrl = (id: string, variant: MarkdownVariant, download = false) =>
  `/api/articles/${id}/markdown?variant=${variant}${download ? "&download=1" : ""}`;

export const assetUrl = (id: string, path: string) => `/api/articles/${id}/asset?path=${encodeURIComponent(path)}`;

export const zipUrl = (ids: string[], prefer: "export" | "clean") =>
  `/api/export.zip?ids=${ids.map(encodeURIComponent).join(",")}&prefer=${prefer}`;

export async function fetchMarkdown(id: string, variant: MarkdownVariant): Promise<string> {
  const res = await fetch(markdownUrl(id, variant));
  if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "读取失败");
  return res.text();
}
