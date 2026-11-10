---
name: chat-to-article
description: >-
  把某个主题下的过往聊天整理成可回顾、可共享的文章，并按块修订。
  从用户的追问轨迹中还原写作动机与认知路径，维护版本化的个人写作风格、
  共享与私有词表，以及 Mermaid、draw.io 和经确认的插图。
  在用户要把聊天整理成文章、从聊天写文章、按段改文章、回顾一个主题的对话，
  或修改文章中的某一段、某一张图时使用。
---

# 聊出文章来（chat-to-article）

本 Skill 采用**声明式设计**：这里定义可用的上下文资源、目标产物的形态与核心约束，以及面向不同场景的推荐路径。你（Agent）根据用户的实际意图与材料成熟度自主规划步骤、直接读写产物文件或调用交互式 UI 组件，无需遵循僵化的程序化状态机。

---

## 核心理念：追问即认知，以写促学

用户在聊天里的**主动追问过程**，本身就是他理解一个概念的认知过程。不要把聊天记录仅仅当成扁平的静态语料池去硬凑摘要，而要从用户的连续提问中感知他的认知爬坡轨迹：

1. **困惑起点（`initialConfusion`）**：最初在什么具体场景、痛点或直觉冲突上卡住了？
2. **追问演进链（`inquiryJourney`）**：哪几轮追问（「为什么不直接…」「可是如果…」）打破了原有直觉、把思考推向深处？
3. **核心顿悟（`ahaMoment`）**：追问到最后真正想通的核心判断是什么？
4. **待补认知缺口（`knowledgeGaps`）**：聊天中哪些地方只是聊爽了但还缺严谨证据、边界条件或反例？

将这套**写作动机**融入成文过程：一方面借助写作的严密性帮助作者补齐聊天时跳过的缺口（加深作者自身的结构化认知）；另一方面顺着作者亲历的认知坡度组织章节（而非全知视角的教科书平铺），让处于相似困惑起点的读者自然读懂，形成正向飞轮。

动机是原料，不是章节顺序。面向大众的科普（影视飓风 / 毕导这一路）还要另写一份**叙事契约**，记在 `writing-plan.json`，并在大纲每一节落地。工程笔记可以更克制，但不得用「别铺垫」删掉下面这些已经写下的字段。

1. **开篇故事弧（`openingArc`）**：一个能指认的场景（谁、在做什么、哪一步失败了）→ 还没解开的悬念 → 通向第一节机制的桥梁。首段禁止下定义、禁止先抛术语。
2. **三层递进追问（`questionLadder`）**：现象里的反常 → 把条件推到极限后直觉解释为什么垮 → 垮掉的那一步对应什么机制。只有现象层「为什么」的大纲，还不能当科普提纲。
3. **段间桥（`bridgeFromPrev` / `hookToNext`）**：上一节最后把一个具体物件或未完成动作交出来，下一节第一句先接住它，再往下走。禁止用「接下来我们看看」这类空转折代替桥。
4. **术语三步降维**：先给读者脑子里已经有的直觉画面，再写成一个看得见的动作，最后才挂上术语标签。名字出现时，画面必须已经在场。

全文只留一条主线、只留一套贯穿比喻的要求见 [style.md](references/style.md) 与 [voices.md](references/voices.md)。

---

## 一、可用资源（Resources）

### 1. 对话与材料来源
- 本地会话记录（JSONL）、导出的对话文件（如 `exports/<share-id>.json`）、用户指定的笔记文件或直接粘贴的文本。
- 会话检索、分页完整性核对与文本抽取方式见 [sources.md](references/sources.md)。

### 2. 个人声音目录（Voice Home）
路径为 `$CHAT_TO_ARTICLE_HOME`，未设置时默认为 `~/.chat-to-article/`（与具体文章目录隔离，分享文章时不会泄露个人词表）：
- `profile.json` 与 `history/r<N>.json`：版本化的个人风格档案与历史快照（见 [style.md](references/style.md)）。
- `exemplars/`：作者认可的本人范文片段。
- `lexicon/private.json`：个人禁用词、偏好替换词与放行词条（见 [lexicon.md](references/lexicon.md)）。
- `candidates.jsonl`：从日常改稿中收集、待升级进全局档案的风格候选规则。

### 3. 内置词表与笔调参考
- `<skill>/lexicon/`：共享的中英文套话与观察句式词表（见 [lexicon.md](references/lexicon.md)）。
- `<skill>/styles/presets.json`：内置笔调样稿，供作者尚未建立个人档案或想尝试不同文风时选配（见 [voices.md](references/voices.md)）。

### 4. 可选的交互式 UI 组件（MCP Apps）
当本轮工具清单中存在 `review_writing_plan`、`review_claims`、`review_outline`、`review_variants`、`review_block`、`review_figure`、`review_style_candidates`、`ask_questions` 时，可按需调用它们在对话内嵌入富交互审阅卡片（见 [review-ui.md](references/review-ui.md)）。
- 这些组件用于提升交互体验（如一键推导行文方案、按认知角色分组勾选主张、类 Word 修订模式改字批注），**没有强制的前置调用顺序限制**。
- 当环境没有这些工具时，直接在对话中与用户自然沟通并读写文件即可。

### 5. 机械辅助脚本（`<skill>/scripts/cta.py`）
脚本仅承担**纯机械的文本脱水、正则匹配与文件拼拆**，不控制主流程：
```bash
# 1. 将冗长的原始会话 JSONL 脱水为纯文本，并标出疑似密钥
python3 <skill>/scripts/cta.py extract --jsonl 会话.jsonl --coverage coverage.json --out 抽取.md --secrets-out secrets.json

# 2. 用共享+私有词表扫描正文中的禁用套话（ban）与观察句式（watch）
python3 <skill>/scripts/cta.py lint --article articles/<slug> [--block b001]

# 3. 按大纲将 blocks/*.md 编译为带锚点的工作稿 article.md，或通过导出守卫生成干净的分享包 export/
python3 <skill>/scripts/cta.py compile --article articles/<slug> [--export]

# 4. 当用户在 article.md 中直接改了文字时，按 <!-- block:id --> 锚点把改动拆回对应的 blocks/<id>.md
python3 <skill>/scripts/cta.py sync-anchors --article articles/<slug>
```

---

## 二、产物形态与目标约束（Target State & Invariants）

一篇文章默认存放在 `articles/<slug>/`（或用户指定的目录）。你可以直接用文件工具读写这些文件，也可通过 MCP UI 组件在用户提交时自动落盘：

```text
articles/<slug>/
  meta.json              # 文章元数据与钉住的 styleRevision
  writing-plan.json      # 写作动机（motivation）、文体、读者、目的、偏好轴、行文方案
  materials.json         # 已选会话与拥有完整正文的会话列表
  claims.jsonl           # 主张账本（每行一条事实或判断，含认知角色、来源与缺口提示）
  outline.json           # 章节结构（含每节回应的读者疑问、认知角色、关联主张、图位与块 id）
  preferences.jsonl      # 本篇从作者反馈中即时学到的写法偏好
  revisions.jsonl        # 块修订历史记录
  blocks/
    b001.md              # 块文件（YAML frontmatter + 正文，正文的唯一权威来源）
  figures/
    manifest.json        # 图记录清单（mermaid / drawio / svg-chart / raster / remote）
    fig-flow.mmd         # 图源文件
  article.md             # 带 <!-- block:id --> 锚点的工作稿（由 compile 生成）
  export/                # 最终可分享给读者的干净产物包（由 compile --export 生成）
    article.md
    figures/
```

### 核心约束（Invariants）
1. **真实材料与认知缺口显式化**：写进正文的主张必须来自经过核对的全文材料或用户补充材料（只有摘要的会话仅作线索提醒，不能脑补细节）。聊天中尚未验证的推断或缺失边界，记在 `writing-plan.json` 的 `knowledgeGaps` 或主张的 `gapNote` 中，在成文时显式补齐或限定边界。
2. **事实、结构与正文按块解耦**：
   - `blocks/<id>.md` 是正文的权威存储。
   - **局部修改默认只动被点名的那一块**：起草或改写某块时，只读取该块的 `claimIds`、前一块与后一块的只读文本（用于衔接语气）以及当前生效的风格偏好，**不要把整篇 `article.md` 塞进上下文重写**。
   - 除非作者明确要求「整篇重写」并二次确认，否则已接受的其他块保持原样（见 [revision.md](references/revision.md)）。
3. **单篇风格稳定与即时偏好沉淀**：
   - 每篇文章在 `meta.json` 中记录 `styleRevision`，篇内保持同一风格基线；全局 `profile.json` 升版只影响新文章。
   - 作者在审阅某块时给出的改字、批注或选版评价，应即时归纳为可推广的具体写法记入 `preferences.jsonl`，让下一块立刻生效（见 [preferences.md](references/preferences.md)）。
4. **视觉表达、多模态生图与图文协同（Figures & Multimodal Co-evolution）**：
   - **视觉触发与设计简报**：在开场反常识钩子（`hook`）、生活类比/拟人条漫（`analogy`）、笨办法 vs 新方案对比（`comparison`）、多步核心机制（`mechanism`）、数据冲击证据（`evidence`）或全局认知地图（`architecture`）处规划配图，在 `figures/manifest.json` 中记录 `role`、`intent`（配图意图）、`takeaway`（一秒结论）与 `anchorSummary`（图文联动契约）。
   - **多模态生图与风格统一**：当用户在大纲（`review_outline`）、正文块（`review_block`）或图审阅（`review_figure`）中确认了 `raster` 配图，或在对话中要求生图时（`confirmed: true`），结合本篇锁定的 `visualStyle`（如 `tech-spotlight`、`whiteboard-sketch`、`editorial-comic`、`minimal-blueprint`）组装五要素 `prompt` 调用 `GenerateImage`；优先通过 `reference_image_paths` 传入首张已确认插图或个人范例样张以保持全篇画风一致，生图后立即用 `Read` 工具亲眼检视画面细节。
   - **看图写文、以图减文与双向迭代**：图负责展示空间结构、分屏反差与完整流转，正文只负责引出问题、引导视线看图眼细节与交代隐含边界，**绝不把图上的步骤用文字啰嗦复述一遍**；当图片迭代导致结构、比喻或结论改变时，将关联块标为 `stale` 并局部微调正文，保持图文同步（详见 [figures.md](references/figures.md)）。
5. **叙事契约优先于「开门见山」**：科普体裁下，`openingArc`、`questionLadder`、段间桥和术语三步降维是硬字段。个人档案里的「段首直接给问题、不写铺垫」只禁止空泛总括，不禁止场景、悬念和桥。局部修订仍只改被点名的块，但该块的 `bridgeFromPrev` 必须重写，并读相邻块的全文，而不是只看一两句尾巴。
6. **干净的分享包（`export/`）**：
   - 交付给读者的 `export/` 不含块锚点、不含会话 ID、不含未脱敏的密钥（`sk-...` 等），且所有被大纲引用的块和图均已就绪、无 `ban` 级禁用套话。

---

## 三、推荐路径（Recommended & Flexible Paths）

以下路径是**弱约束的推荐实践**，请根据用户的指令和手头材料灵活裁剪、跳步或组合：

### 路径 A：从追问对话整理新文章（以写促学完整路径）
适合用户给了一段或多段探索性聊天，希望梳理成一篇有深度、好读的文章：
1. **还原动机与叙事契约**：阅读对话中的用户提问序列，提炼 `motivation`（困惑起点 → 追问演进链 → 核心顿悟 → 待补认知缺口 → 读者共鸣价值），并写成读者能跟着走的 `openingArc`、`questionLadder` 与每节的桥（详见 [writing-plan.md](references/writing-plan.md)、[discovery-questions.md](references/discovery-questions.md)）。可调用 `review_writing_plan`；方向不明时才用 `ask_questions`，一次只问会改变故事弧的分岔。
2. **梳理认知链式主张**：从全文材料中抽取核心主张写入 `claims.jsonl`，按 `friction` / `insight` / `evidence` / `boundary` 归类。默认把主张摘要写进写作计划的快审稿，不单独调用 `review_claims`。只有密钥未处理、事实对不上，或作者点了诊断芯片时，才打开主张审阅。
3. **规划读者认知大纲**：将叙事契约展开为 `outline.json`，每节写 `readerQuestion`、`bridgeFromPrev`、`hookToNext`，开篇安排强反差图。默认不单独调用 `review_outline`，除非作者要改结构。
4. **成稿快审**：按块起草。科普默认笔调用 `tech-blogger` 的叙事契约，不要为了选文风先跑一轮 `review_variants`。用 `review_block` 给作者读开篇和点了芯片的块。图随块看；只有 raster 需要亲眼看画面，或作者说图没有冲击力时，才调用 `review_figure`。
5. **词表检查与导出**：运行 `cta.py lint` 修正命中的禁用套话。观察级的明喻起手式先对照唯一贯穿比喻，不属于那一套就改掉。风格候选默认不打断成稿，作者要求沉淀时再调用 `review_style_candidates`。最后 `cta.py compile --article ... --export`。

### 路径 B：材料与结构已成型，快速成稿
适合用户已经给出了清晰的提纲、成熟观点或结构化笔记，希望快速成文：
- 直接将用户给出的方向与论点整理写入 `writing-plan.json`、`claims.jsonl` 和 `outline.json`，跳过冗余盘问，直接进入按块起草与审阅。

### 路径 C：局部修订已有文章（改一段 / 改一句话 / 重画一张图）
适合文章已有初稿或成品，用户只想调整局部（详见 [revision.md](references/revision.md)）：
- 若用户在外部编辑器里直接改了带锚点的 `article.md`，先运行 `cta.py sync-anchors --article ...` 将改动收回对应块。
- 若用户点名改某一段或某句话，只读取目标块 `blocks/<id>.md`（及相邻块只读上下文），修改后写回或调用 `review_block` 让用户确认，最后重新 `compile`。
- 若用户修改或推翻了某条主张，更新 `claims.jsonl` 并将引用该主张的块标为 `stale`，仅针对受影响的块复核重写。

### 路径 D：学习与维护个人风格 / 词表
- 当用户提供过往旧文希望学习笔调时，直接阅读旧文归纳其人称、句式节奏、段落组织、开头习惯与代表性范文片段，经用户确认后更新 `~/.chat-to-article/profile.json`（详见 [style.md](references/style.md)）。
- 当用户指定禁用词或习惯用语时，直接更新 `~/.chat-to-article/lexicon/private.json`（详见 [lexicon.md](references/lexicon.md)）。
