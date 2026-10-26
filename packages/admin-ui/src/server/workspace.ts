import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import {
  buildLexiconSnapshot,
  compileLexicon,
  findArticleDirs,
  findSkillDir,
  loadArticle,
  loadSharedLexicon,
  loadVoice,
  readText,
  referencedFigures,
  renderArticle,
  safeJoin,
  summarize,
  type ArticleSnapshot,
} from "@liem-opc/chat-to-article-core";

export interface WorkspaceOptions {
  root: string;
  home: string;
  skill?: string | null;
  depth: number;
}

export type MarkdownVariant = "export" | "clean" | "working";

export const encodeId = (relDir: string) => Buffer.from(relDir, "utf8").toString("base64url");
export const decodeId = (id: string) => Buffer.from(id, "base64url").toString("utf8");

/** 每次请求都从磁盘重新读：管理台只读，数据量小，换来的是文件一改刷新就能看到。 */
export class Workspace {
  constructor(readonly options: WorkspaceOptions) {}

  skill() {
    return findSkillDir(this.options.root, this.options.skill);
  }

  voice() {
    return loadVoice(this.options.home);
  }

  lexicon() {
    const { dir, searched } = this.skill();
    return buildLexiconSnapshot(dir, searched, this.voice().privateLexicon?.entries ?? []);
  }

  private rules() {
    const { dir } = this.skill();
    return compileLexicon(loadSharedLexicon(dir), this.voice().privateLexicon?.entries ?? []);
  }

  articleDirs() {
    return findArticleDirs(this.options.root, this.options.depth);
  }

  articles() {
    const rules = this.rules();
    return this.articleDirs()
      .map((dir) => {
        const snapshot = loadArticle(dir, this.options.root, rules);
        return { id: encodeId(snapshot.relDir), ...summarize(snapshot) };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  article(id: string): (ArticleSnapshot & { id: string }) | null {
    const rel = decodeId(id);
    const dir = safeJoin(this.options.root, rel);
    if (!dir || !this.articleDirs().includes(dir)) return null;
    return { id, ...loadArticle(dir, this.options.root, this.rules()) };
  }

  markdown(snapshot: ArticleSnapshot, variant: MarkdownVariant): { text: string; fileName: string } | null {
    const slug = snapshot.meta.slug || basename(snapshot.dir);
    if (variant === "export") {
      const text = readText(join(snapshot.dir, "export", "article.md"));
      return text == null ? null : { text, fileName: `${slug}.md` };
    }
    if (variant === "working") {
      return { text: renderArticle(snapshot, { anchors: true, provenance: false }), fileName: `${slug}.working.md` };
    }
    return {
      text: renderArticle(snapshot, { anchors: false, provenance: !!snapshot.meta.includeProvenance }),
      fileName: `${slug}.draft.md`,
    };
  }

  /** 打包一篇文章：有分享包时原样打包 export/，否则打包草稿正文与被引用的图源文件。 */
  bundle(snapshot: ArticleSnapshot, prefer: "export" | "clean"): Record<string, Uint8Array> {
    const slug = snapshot.meta.slug || basename(snapshot.dir);
    const files: Record<string, Uint8Array> = {};
    const exportDir = join(snapshot.dir, "export");
    if (prefer === "export" && snapshot.files.exportMarkdown) {
      const walk = (dir: string, prefix: string) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) walk(full, `${prefix}${name}/`);
          else files[`${slug}/${prefix}${name}`] = readFileSync(full);
        }
      };
      walk(exportDir, "");
      return files;
    }
    const md = this.markdown(snapshot, "clean");
    if (md) files[`${slug}/article.md`] = new TextEncoder().encode(md.text);
    for (const fig of referencedFigures(snapshot)) {
      if (!fig.source) continue;
      const sources = [fig.source];
      if (fig.kind === "drawio") sources.push(fig.source.replace(/\.[^./]+$/, ".svg"));
      for (const rel of sources) {
        const path = safeJoin(snapshot.dir, rel);
        try {
          if (path) files[`${slug}/figures/${basename(rel)}`] = readFileSync(path);
        } catch {
          // a missing figure is already reported by exportErrors
        }
      }
    }
    return files;
  }
}
