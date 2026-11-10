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

动机是原料，不是章节顺序。面向大众的科普（影视飓风 / 毕导这一路）要另写一份**推演契约**，记在 `writing-plan.json`。硬核科普的内核是把聊天里已经走过的推导，用聊天自己的技术实体、状态和数值再算一遍给读者看。不要另造一套生活故事，把技术名词换掉。

正文顺序固定为五拍，记在 `questionLadder` 与大纲的桥上。不能把后面的拍提前，也不能用比喻代替其中任何一拍：

1. **具象痛点场景，同时给出直白定义和输入输出反差（`openingArc`）**。从聊天里找出读者能指认的一次失败：当时手里是什么输入，实际吐出了什么。用最直白的话说明这个技术是什么、解决哪一个具体问题，并放出同一类输入的两组输出：没有它时是什么样，有它时是什么样。没有这组对比，不许先讲原理，也不许先讲比喻。
2. **直觉猜想**。写下读者这时最容易相信的那一句解释。这句必须来自聊天里真的出现过的猜测，不要替读者发明。
3. **极限反例推翻猜想**。从聊天里找一份仍然满足那句猜想、但已经完不成任务的结果。只举聊天里有的那一个，不要另编实验。
4. **底层机制逐步推演（`mechanismTrace`）**。聊天里花了很多篇幅拆过的运行原理，成稿里必须有至少一个具体小例子：这一步开始时的状态、规则如何作用、关键量在作用前后各是多少、结束时状态变成什么。聊天里的推导一步都不要跳。聊天里出现过的数优先用原数，并注明出处。聊天里没有、只为把这一步算完而设的数，必须标明是为说明而设的微型例子，不能写成某次真实记录。
5. **工程分层全景**。把聊天里区分过的层次排开。每一层写清它保证什么、不保证什么。不要把多层收成一句「所以它是安全的」。

**段间桥（`bridgeFromPrev` / `hookToNext`）**。上一节最后留下一个还没回答的技术问题，或这一步结束时的具体状态。下一节第一句先接住它。禁止用「接下来我们看看」代替桥。

**术语出现在推演之后**。读者先看见这一步的输入、状态和数值，再听见名字。名字后面马上回到同一步，不要另起一个生活场景来解释。

**比喻反客为主禁令。** 正文主语必须是聊天里的技术实体：系统、状态、输入、输出、规则作用前后的量。禁止发明脱离这些实体的延伸比喻来贯穿全文，或用它代替上面的逐步推演。柜台、申报表、柜员、盖章、落笔、换油墨这一类说法属于这种错误：它们一旦成了主语，读者就看不到技术本身。类比最多在该步算完之后用半句做直觉辅助，而且删掉这半句，推演仍然成立。一旦比喻替代了具体推演，这一维记 0 分。详见 [style.md](references/style.md)。

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
   - **视觉触发与设计简报**：在输入输出反差（`hook`）、猜想被反例推翻（`comparison`）、带状态和数值的一个机制步（`mechanism`）、数据冲击证据（`evidence`）或分层地图（`architecture`）处规划配图。生活类比图不能代替上面任何一张。在 `figures/manifest.json` 中记录 `role`、`intent`、`takeaway` 与 `anchorSummary`。
   - **多模态生图与风格统一**：当用户在大纲（`review_outline`）、正文块（`review_block`）或图审阅（`review_figure`）中确认了 `raster` 配图，或在对话中要求生图时（`confirmed: true`），结合本篇锁定的 `visualStyle`（如 `tech-spotlight`、`whiteboard-sketch`、`editorial-comic`、`minimal-blueprint`）组装五要素 `prompt` 调用 `GenerateImage`；优先通过 `reference_image_paths` 传入首张已确认插图或个人范例样张以保持全篇画风一致，生图后立即用 `Read` 工具亲眼检视画面细节。
   - **看图写文、以图减文与双向迭代**：图负责展示同一输入的两种输出、一个机制步的前后状态，以及每一层各自不管什么。正文引出这一步的输入和状态，不把图上的每一格再抄一遍。图改了结构或结论时，把关联块标为 `stale` 并只改那一块（详见 [figures.md](references/figures.md)）。
5. **推演契约优先于空泛禁令**：科普体裁下，`openingArc`、`questionLadder`、`mechanismTrace` 与段间桥是硬字段。个人档案里的「段首直接给问题、不写铺垫」只禁止空泛总括，不能删掉聊天里的输入输出、状态、数值和反例。局部修订仍只改被点名的块，但该块的 `bridgeFromPrev` 必须重写，并读相邻块的全文。
6. **干净的分享包（`export/`）**：
   - 交付给读者的 `export/` 不含块锚点、不含会话 ID、不含未脱敏的密钥（`sk-...` 等），且所有被大纲引用的块和图均已就绪、无 `ban` 级禁用套话。

---

## 三、推荐路径（Recommended & Flexible Paths）

以下路径是**弱约束的推荐实践**，请根据用户的指令和手头材料灵活裁剪、跳步或组合：

### 路径 A：从追问对话整理新文章（以写促学完整路径）
适合用户给了一段或多段探索性聊天，希望梳理成一篇有深度、好读的文章：
1. **还原动机与推演契约**：阅读对话中的用户提问序列，提炼 `motivation`，并写成 `openingArc`（直白定义加输入输出）、`mechanismTrace`（一个带数字的生成步）与 `questionLadder`（详见 [writing-plan.md](references/writing-plan.md)、[discovery-questions.md](references/discovery-questions.md)）。可调用 `review_writing_plan`；方向不明时才用 `ask_questions`，一次只问会改变推演顺序的分岔。
2. **梳理认知链式主张**：从全文材料中抽取核心主张写入 `claims.jsonl`，按 `friction` / `insight` / `evidence` / `boundary` 归类。默认把主张摘要写进写作计划的快审稿，不单独调用 `review_claims`。只有密钥未处理、事实对不上，或作者点了诊断芯片时，才打开主张审阅。
3. **规划读者认知大纲**：将推演契约展开为 `outline.json`，每节写 `readerQuestion`、`bridgeFromPrev`、`hookToNext`，开篇安排输入输出反差图。默认不单独调用 `review_outline`，除非作者要改结构。
4. **成稿快审**：按块起草。科普默认笔调用 `tech-blogger` 的推演契约，不要为了选文风先跑一轮 `review_variants`。用 `review_block` 给作者读开篇和点了芯片的块。图随块看；只有 raster 需要亲眼看画面，或作者说图没有冲击力时，才调用 `review_figure`。
5. **词表检查与导出**：运行 `cta.py lint` 修正命中的禁用套话。观察级的明喻起手式如果出现在机制算完之前，改写成这一步的输入、状态和数值；机制之后的半句可以留下。风格候选默认不打断成稿，作者要求沉淀时再调用 `review_style_candidates`。最后 `cta.py compile --article ... --export`。

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
