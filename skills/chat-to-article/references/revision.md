# 按块起草与局部修订

为了避免“只想改一句话，结果整篇文章被重写”，文章正文以**块（Block）**为单位存储在 `articles/<slug>/blocks/<id>.md` 中。`article.md` 和 `export/article.md` 都是由块编译生成的视图。

## 一、块文件的形态（`blocks/<id>.md`）

每个块文件由简短的 YAML frontmatter 和 Markdown 正文组成：

```markdown
---
id: b001
status: accepted
claimIds: [c1]
figureIds: []
---

改文章时，我最怕只想换掉一句话，交出去再拿回来，整篇都被重排了一遍。
```

- `status`：`draft`（草稿/待审阅）、`accepted`（已接受）、`stale`（引用的主张发生了变更，待复核）。
- `claimIds`：这块正文所使用的主张 ID 列表（均应为 `accepted` 状态）。
- `figureIds`：挂在这一块后面的图 ID 列表。

---

## 二、局部修订的上下文约束

当用户要求修改某一段、某句话或某个块（如 `b003`）时：

1. **只读写被点名的块**：
   - 读取目标块 `blocks/b003.md`、它引用的主张、前一块（`b002`）和后一块（`b004`）的只读正文（仅用于衔接上下文语气），以及本篇生效的风格偏好（`preferences.jsonl` 和钉住的 `profile.json`）。
   - **不要读取或重写其他已接受的块文件。**
2. **呈现与确认**：
   - 若环境支持 `review_block` 工具，直接调用 `review_block` 将新草稿嵌入对话，用户可在界面上直接改字、留批注并点击「接受这块」（组件会自动把块状态更新为 `accepted` 并记录 `revisions.jsonl`）。
   - 若无 UI 工具，将修改后的正文写入 `blocks/<id>.md`，在对话中展示前后差异，待用户认可后将其 frontmatter 中的 `status` 设为 `accepted`，并在 `revisions.jsonl` 追加一条记录。
3. **沉淀偏好**：
   - 如果用户的修改意见中包含可推广到其他块的表达习惯（如用词、句式、人称、开头方式），按 [preferences.md](preferences.md) 记入 `preferences.jsonl`。

---

## 三、主张或大纲变更时的传播规则

- **主张变更**：当某条已被块引用的主张文本被修改、或状态变为 `rejected` / `disputed` 时，只需把**引用了该主张的块**的 `status` 改为 `stale`，其余未引用该主张的块保持 `accepted` 不变。
- **大纲调整**：在 `outline.json` 中调整章节顺序或移动块 ID 时，已接受块的正文无需重写；只有新增的块才需要起草。

---

## 四、用户直接编辑了 `article.md` 时的锚点同步

`cta.py compile` 生成的工作稿 `article.md` 带有成对的块锚点：

```markdown
<!-- block:b001 -->
块正文……
<!-- /block:b001 -->
```

如果用户在编辑器里直接修改了 `article.md`，运行：

```bash
python3 <skill>/scripts/cta.py sync-anchors --article articles/<slug>
```

- 当锚点完整匹配大纲中的块顺序时，脚本会自动将改动过的内容写回对应的 `blocks/<id>.md`，并将其状态置为 `draft`。
- 若锚点被删改导致无法对齐，脚本不会猜测归属，而是列出所有块由用户指定。

---

## 五、整篇重写保护

- 当用户只说「改改」「润色一下」时，先询问是改哪一块、改大纲还是改某条主张，不要默认重写全文。
- 当用户明确提出「整篇重写」时，先复述这将重写全部正文块并请用户二次确认，确认后再逐块更新。
