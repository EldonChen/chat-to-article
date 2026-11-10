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

## 三、主张、配图或大纲变更时的传播规则

- **主张变更**：当某条已被块引用的主张文本被修改、或状态变为 `rejected` / `disputed` 时，只需把**引用了该主张的块**的 `status` 改为 `stale`，其余未引用该主张的块保持 `accepted` 不变。
- **配图迭代与多模态图文联动**：
  - **由文补图（看图写文、以图减文）**：审阅某块时若用户提出“这里太抽象，加张对比图/类比插图/流程图”，先在 `figures/manifest.json` 与该块的 `figureIds` 中挂上新图位并生成图源（若为经确认的 `raster` 图，调用 `GenerateImage` 并用 `Read` 检视成图细节），随后**精简该块正文**——删掉已被图直观表达的冗余过程描述，将画面中的具体视觉细节与颜色锚点自然织入正文。
  - **由图修文（反向传播）**：当迭代重画一张图（含通过 `reference_image_paths` 垫图微调 `raster` 图，或修改 Mermaid/SVG）导致图内节点名称、视觉隐喻、步骤顺序或核心结论（`takeaway` / `anchorSummary`）改变时，将该图关联的块（`blockIds`）标为 `stale`（在 `review_figure` 中勾选同步复核或填写联动修改意见时会自动标记），随后只针对这些关联块微调正文措辞，确保图文严丝合缝。
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
