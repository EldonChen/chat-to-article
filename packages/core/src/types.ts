export type Phase = "planning" | "intake" | "claims" | "outline" | "drafting" | "review" | "export";

export interface ArticleMeta {
  title: string;
  slug: string;
  topic?: string;
  styleRevision: number;
  locale?: string;
  phase: Phase | string;
  writingPlanConfirmed?: boolean;
  claimsConfirmed?: boolean;
  outlineConfirmed?: boolean;
  writeAll?: boolean;
  includeProvenance?: boolean;
}

export interface WritingPlan {
  status: "draft" | "confirmed" | string;
  genre: string[];
  audience: string;
  purpose: string;
  styleAxes: Record<string, string>;
  approach: string;
  openQuestions: string[];
  voice?: { id: string; name?: string; note?: string };
}

export type ClaimStatus = "candidate" | "accepted" | "rejected" | "disputed";

export interface ClaimSource {
  kind: "conversation" | "file" | "paste" | string;
  id?: string;
  note?: string;
}

export interface Claim {
  id: string;
  text: string;
  status: ClaimStatus | string;
  sources?: ClaimSource[];
  secret?: boolean;
  resolved?: boolean;
}

export interface Section {
  id: string;
  title: string;
  claimIds: string[];
  figureIds: string[];
  blockIds: string[];
}

export interface Outline {
  sections: Section[];
}

export type FigureKind = "mermaid" | "drawio" | "svg-chart" | "raster" | "remote";

export interface Figure {
  id: string;
  kind: FigureKind | string;
  status: "planned" | "drafted" | "accepted" | string;
  caption?: string;
  alt?: string;
  source?: string;
  prompt?: string;
  license?: string;
  confirmed?: boolean;
  blockIds?: string[];
}

export type BlockStatus = "draft" | "accepted" | "stale";

export interface BlockMeta {
  id: string;
  status: BlockStatus | string;
  claimIds: string[];
  figureIds: string[];
  [key: string]: unknown;
}

export interface Block {
  id: string;
  exists: boolean;
  meta: BlockMeta | null;
  body: string;
  sectionId: string | null;
}

export interface RevisionRow {
  blockId: string;
  instruction: string;
  before: string;
  afterStatus: string;
  [key: string]: unknown;
}

export interface Materials {
  selected?: string[];
  fullText?: string[];
}

export interface FigureFile {
  id: string;
  path: string;
  exists: boolean;
  content?: string;
}

export interface ArticleSummary {
  dir: string;
  relDir: string;
  meta: ArticleMeta;
  updatedAt: string;
  blocks: { total: number; accepted: number; draft: number; stale: number; missing: number };
  claims: { total: number; accepted: number; candidate: number; rejected: number; disputed: number };
  figures: number;
  sections: number;
  hasExport: boolean;
  exportReady: boolean;
  exportErrorCount: number;
  banCount: number;
  watchCount: number;
}

export interface ArticleSnapshot extends ArticleSummary {
  plan: WritingPlan | null;
  claimList: Claim[];
  outline: Outline;
  blockList: Block[];
  orphanBlocks: string[];
  figureList: Figure[];
  figureSources: Record<string, string>;
  revisions: RevisionRow[];
  materials: Materials | null;
  exportErrors: string[];
  lint: LintFinding[];
  files: ArticleFiles;
}

export interface ArticleFiles {
  workingMarkdown: boolean;
  exportMarkdown: boolean;
  exportFigures: string[];
}

export interface StyleRule {
  id: string;
  text: string;
  strength: "enforce" | "prefer" | string;
  evidenceArticles?: number;
  status: "candidate" | "active" | string;
}

export interface Profile {
  revision: number;
  locale?: string;
  audience?: string;
  person?: string;
  paragraph?: { minChars?: number; maxChars?: number };
  structure?: { headingDepth?: number; listPolicy?: string };
  terms?: { prefer?: string; avoid?: string }[];
  exemplarRefs?: string[];
  rules?: StyleRule[];
  [key: string]: unknown;
}

export interface PrivateEntry {
  id: string;
  action: "ban" | "prefer" | "allow" | string;
  phrase?: string;
  replacement?: string;
  entryId?: string;
  patternId?: string;
}

export interface Candidate {
  id: string;
  text: string;
  status?: string;
  source?: string;
  exemplars?: string[];
  [key: string]: unknown;
}

export interface VoiceSnapshot {
  home: string;
  exists: boolean;
  profile: Profile | null;
  history: { revision: number; file: string; profile: Profile }[];
  privateLexicon: { entries: PrivateEntry[] } | null;
  exemplars: { ref: string; content: string; referenced: boolean }[];
  candidates: Candidate[];
  errors: string[];
}

export interface SharedPhrase {
  id: string;
  phrase: string;
  severity: "ban" | "watch" | string;
}

export interface SharedPattern {
  id: string;
  name: string;
  regex: string;
  severity: "ban" | "watch" | string;
}

export interface SharedLexiconFile {
  file: string;
  id: string;
  scope: string;
  phrases: SharedPhrase[];
  patterns: SharedPattern[];
}

export interface LexiconSnapshot {
  skillDir: string | null;
  candidates: string[];
  shared: SharedLexiconFile[];
  private: PrivateEntry[];
  effective: EffectiveEntry[];
}

export interface EffectiveEntry {
  id: string;
  kind: "phrase" | "pattern";
  text: string;
  origin: "shared" | "private";
  originFile: string;
  severity: string;
  baseSeverity: string;
  replacement?: string;
  overriddenBy?: string;
  allowed: boolean;
}

export interface LintFinding {
  blockId: string;
  start: number;
  end: number;
  entryId: string;
  severity: string;
  replacement: string;
  sentence: string;
}
