---
name: chat-to-article
description: >-
  把某个主题下的过往聊天整理成可回顾、可共享的文章，并按块修订。
  首块出多版让作者挑笔调，随批注即时沉淀偏好；维护版本化的个人写作风格、
  共享与私有词表，以及 Mermaid、draw.io 和经确认的插图。
  在用户要把聊天整理成文章、从聊天写文章、按段改文章、回顾一个主题的对话，
  或修改文章中的某一段、某一张图时使用。
---

# 聊出文章来

显示名是「聊出文章来」。文章目录默认是当前工作区的 `articles/<slug>/`。声音目录是 `$CHAT_TO_ARTICLE_HOME`，未设置时为 `~/.chat-to-article/`。

确定性操作用与本文件同级的脚本。先把 `<skill>` 换成包含本 `SKILL.md` 的目录：

```bash
python3 <skill>/scripts/cta.py <子命令>
```

你负责检索、主张、大纲、起草和改写。脚本负责切分、门禁、扫描、编译、同步和钉住风格版本。不要手写 `export/`，不要改未点名的块文件。

样例：`python3 <skill>/scripts/cta.py demo`。结果写在本 skill 目录的 `examples/demo/article/export/`，安装之后这个相对位置不变。

## 先选路径

- 新主题成文 → 下面的清单
- 改已有的一块或一张图 → [revision.md](references/revision.md)
- 第一块出多版让作者挑笔调、避免机械腔、篇幅怎么定 → [voices.md](references/voices.md)
- 作者的批注、修改和选择怎么沉淀成偏好 → [preferences.md](references/preferences.md)
- 从旧文学习笔调、或确认风格候选 → [style.md](references/style.md)
- 禁用词、习惯说法、放行 → [lexicon.md](references/lexicon.md)
- 图的类型和文件 → [figures.md](references/figures.md)
- 会话怎么找、怎么抽 → [sources.md](references/sources.md)
- 开写前如何确定文体、读者、偏好和行文方案，以及如何问用户 → [writing-plan.md](references/writing-plan.md)、[discovery-questions.md](references/discovery-questions.md)
- 工具清单里有 `review_block`、`review_claims` 等审阅工具 → [review-ui.md](references/review-ui.md)：计划、主张、大纲、块、图和风格候选都在对话里嵌入的界面上审，不在对话里贴 JSON

用户说「整篇重写」时，先停。复述这将重写全部正文块，问「确认整篇重写吗？」。得到肯定后再逐块改。只说「改改」时，先问是改哪一块、改大纲，还是改主张。没有整篇重写的脚本。

没有用户明确要求时，不调用生图，不新增 `kind` 为 `raster` 的图。

## 写一篇

复制这份清单。前一项没通过，不要做下一项。

```
- [ ] 写作计划确认
- [ ] 材料覆盖
- [ ] 主张确认
- [ ] 大纲确认
- [ ] 第一块出多版，作者选定笔调
- [ ] 第一节审完，偏好问过是否写进风格档案
- [ ] 其余节
- [ ] 词表
- [ ] 风格候选
- [ ] 导出
```

### 写作计划

开始新主题时，先在对话中按 [writing-plan.md](references/writing-plan.md) 确认文章类型、目标读者、写作目的、偏好维度和行文方案。不要把“科技 / 人文 / 小说”当成互斥的风格标签：文体可以组合，也可以用用户自己的描述。偏好维度是可调整的草图，不是人格测验。

先检查用户是否已经在对话里给出这些答案；已明确的内容直接复述为计划，不重复盘问。仍有会改变文章方向的未知项时，按 [discovery-questions.md](references/discovery-questions.md) 一次问一个或少量选择题，给出推荐项、可自定义项和“暂不确定 / 由你建议”。

**提问是流程门禁，不是可选的表达风格。** 发出方向性问题前，检查本轮实际可调用的工具清单。若有结构化提问工具，立即调用它；Codex 环境中若暴露 `request_user_input_async`，就用它提供选择项和自由输入兜底。不能因为普通消息也能写成选择题，就跳过可用工具。提问后停止所有依赖该答案的操作，等待用户回复；收到回复后再更新计划、摘要并确认。用户没有确认计划前，不创建文章目录、不登记计划、不抽取主张、不提纲、不起草。

若当前工具清单没有结构化提问工具，才使用普通消息作为兼容路径，并明确给出推荐选项、字母/文本/自定义回答方式。不要仅凭文档提到某个工具就假定它存在，也不要把“我在普通消息里问了”记录成已调用提问工具。普通消息提问后同样必须停步等待，不能在同一轮代替用户确认。

```bash
# 用户确认计划后，才创建文章并写入 writing-plan.json：
python3 <skill>/scripts/cta.py new-article --title "标题" --slug slug --topic "主题"
# 然后设置写作计划门禁：
python3 <skill>/scripts/cta.py set-gate --article articles/<slug> --plan
```

把用户确认的方向写入文章目录 `writing-plan.json`。未指定 `--dir` 时，文章在 `./articles/<slug>/`。

每次继续已有文章，先读 `meta.json`、`writing-plan.json`、`claims.jsonl`、`outline.json` 和块状态，告诉用户当前阶段、已完成事项、阻塞项及下一步的可选路径。不要从“上次生成了第一节”推断用户已接受它；以文件状态为准。状态交互模板见 `discovery-questions.md`。

### 材料覆盖

按 [sources.md](references/sources.md) 检索并写成 `hits.json`。用户直接引用并要求使用的聊天视为已选择；逐页读取，直到读取接口明确报告没有下一页，并检查每条消息是否被截断。只有完成覆盖核对后，才把记录登记为全文。导出文件也要和消息数核对。不要因为没有本地导出文件就把已读正文标成摘要，也不要因为拿到部分正文就标成全文。无法完整读取时说明覆盖范围，允许用户提供导出或补充文本。用户从检索结果中选择时再按选择登记。然后运行：

```bash
python3 <skill>/scripts/cta.py check-materials --hits hits.json --selected id1,id2 --supplement 补充.md
```

退出码 2：停止。向用户要文件或粘贴。不要创建文章，不要写主张。摘要只用来提醒「还有这段」，不能写成主张。

### 主张和大纲

```bash
python3 <skill>/scripts/cta.py extract --jsonl 会话.jsonl --coverage coverage.json --out 抽取.md --secrets-out secrets.json
```

把勾选结果写入 `materials.json`：`selected` 是勾选的 id，`fullText` 只放有全文的 id。主张写入 `claims.jsonl`，来源 `kind` 用 `conversation`、`file` 或 `paste`。只有摘要的会话不能出现在来源里。疑似密钥记在主张上：`secret: true`，原文不要抄进正文。用户处理后再 `mark-claim --resolved`。

每条主张要用户接受或拒绝。还有 `candidate` 或 `disputed` 时，不要确认：

```bash
python3 <skill>/scripts/cta.py check-sources --article articles/<slug>
python3 <skill>/scripts/cta.py set-gate --article articles/<slug> --claims
```

大纲写入 `outline.json`，图记录写入 `figures/manifest.json`。块是一个意思完整的单元，不是一个段落：一节分几块、一块写几段，按主张和材料多少来定，不要在各节之间平均分配。用户确认结构之后：

```bash
python3 <skill>/scripts/cta.py set-gate --article articles/<slug> --outline
```

大纲未确认时不要写块。

### 起草

写每一块之前运行 `show-block`。它只给出钉住的风格版本、生效规则、范文、本篇选定的笔调、本篇已记下的偏好、这块的主张，以及前后块的只读正文。不要另读整篇 `article.md` 来改写。

```bash
python3 <skill>/scripts/cta.py check-draft --article articles/<slug> --section first
python3 <skill>/scripts/cta.py show-block --article articles/<slug> --block b001
```

`show-block` 提示本篇还没选定笔调时，这块不要只写一版：按 [voices.md](references/voices.md) 运行 `variant-brief`，出 3 版让用户挑。有偏好材料时，其中一版必须按用户的偏好写。用户选定后运行 `pick-variant`。

正文只使用这块 `claimIds` 里已经接受的主张。篇幅跟着内容走，不要为了字数增删内容，也不要把每段写成一样长；起草后按 [voices.md](references/voices.md) 的「机械腔从哪来」自查一遍。写完把文件存成 `blocks/<id>.md`，一次只给用户看这一块。

**每次用户给了反馈，都先沉淀偏好，再动笔。** 批注、亲手改的字、选版本时的评价、对话里的指令，都按 [preferences.md](references/preferences.md) 归纳成能推广的写法，用 `learn` 记下。这样下一块的 `show-block` 就会带上它，不用等整篇结束：

```bash
python3 <skill>/scripts/cta.py learn --article articles/<slug> --block b001 --source annotation \
  --text "讲经过时用我的原话" --evidence "改前 → 改后"
```

用户接受后：

```bash
python3 <skill>/scripts/cta.py accept-block --article articles/<slug> --block b001
```

第一节全部接受后，问用户是否把本篇记下的偏好写进风格档案（`accept-block` 会提示）。默认先完成第一节。`check-draft --section rest` 失败时，不要写后面的节。用户明确说「按当前风格写完」之后，才运行 `allow-write-all`，然后再写其余节。其余节仍然一块一块给用户看。

### 改一块

只改被点名的块。用 `rewrite-block`，或只编辑那一个块文件。然后把脚本打印的差异给用户，不要重印全篇。细节见 [revision.md](references/revision.md)。

### 词表、风格、导出

`lint` 退出码 1 表示有禁用说法。只重写命中的那一句，同块其余句子保持原样。见 [lexicon.md](references/lexicon.md)。

一篇结束时，把还没写进档案的本篇偏好和其余措辞修改收成候选，问用户哪些写入声音目录。写入用 `bump-style`，来自本篇偏好的带上 `--article` 和 `--pref`。这个命令不修改已有文章的 `styleRevision`。

```bash
python3 <skill>/scripts/cta.py lint --article articles/<slug>
python3 <skill>/scripts/cta.py compile --article articles/<slug> --export
```

导出失败时，把脚本输出告诉用户。`export/` 没有更新，不要把工作稿 `article.md` 当成分享包。分享包通过检查后，把 `export/` 的路径告诉用户。
