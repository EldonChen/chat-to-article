# 视觉表达、多模态生图与图文协同（Figures & Multimodal Co-evolution）

在优秀的科技科普与深度工程文章中，图片不是写完正文后塞进去的装饰品，而是**降低认知门槛、制造视觉冲击、替代冗长文字解释的核心认知脚手架**。科普体裁还有两条更硬的图规，优先级高于「有一张流程图就行」：

1. **首图必须是输入输出反差**。开篇使用 `hook` 或 `comparison`：同一类输入，一边是没有这项技术时的输出，一边是有它时的输出。只改这一个变量。读者不读图注，也能指出两边差在哪。生活场景分屏、干的 Mermaid 拓扑不能充当这张首图。
2. **机制图必须是一图流解剖**。一张图里同时看见：这一步开始时的状态、规则作用前后的关键量、被挡住的分支、被放行的分支，以及这张图不管的那一层。只画材料里已经算完的数。禁止只画一排同宽方框再靠正文解释。节点上写决定，不写「步骤 1」。
3. **图内文字是 UTF-8 明文**。中文直接写在 SVG `<text>` 或 Mermaid 标签里，写完后读一遍文件，确认没有变成乱码或控制符。位图仍遵守「少字」；SVG 和 Mermaid 负责把结论写清楚。
4. **同一条流程只出现一次**。需要 diff 的状态循环可以用 Mermaid；视觉冲击用 SVG。不要把同一条框链既贴 Mermaid 又贴一张同构示意图。ASCII 图不再进正文。
5. **相对路径和图解框一起交。** `figures/<id>.svg` 必须先落盘，并且能被 XML 解析。写链接之前读一次文件，确认它和 `article.md` 在同一篇目录下。然后写 `![这张图的结论](./figures/<id>.svg)`。紧挨着下一行放图解框：一个围栏代码块，或一张不超过三行的小表。框里只用正文已经写出的原词，标出左右或前后差在哪、哪一条被挡住、哪一条被放行。纯文本预览，以及会拦截相对路径或裸 `<svg>` 的阅读器，靠这个框仍然能看见结论。不要把裸 `<svg>` 贴进 `article.md` 当作唯一的图，也不要只留图片链接。缺文件就先补文件；只有摘要、没有 SVG，也不算交了图。禁止把带死链、或链接下面一片空白的稿子交出去。

图解框长这样（词必须换成这一篇已经出现的输出，不要另编）：

```text
左：没有这项技术时的输出 → 解析失败的那一处
右：有这项技术时的输出 → 能按字段读的那一处
差在：生成时有没有按当前文法拦截
```

首图的 `takeaway` 必须能从画面差异直接说出。机制图的 `takeaway` 必须指出「这一步挡住了什么，以及它故意不挡什么」。

当宿主环境支持多模态能力（文生图 `GenerateImage`、参考垫图 `reference_image_paths`、视觉理解 `Read`）与矢量绘图（`Mermaid`、富排版 `SVG`、`draw.io`）时，系统围绕四个核心环节管理文章的视觉表达：
**① 确认在哪里插什么图（视觉规划）→ ② 确定全篇视觉画风并生成图片（多模态制图与自检）→ ③ 结合图片动态调整文章内容（看图写文、以图减文）→ ④ 迭代图片本身并反向同步正文（双向闭环）**。

---

## 一、在哪里插入图片？六大视觉认知角色（`role`）

在大纲规划（`outline.json`）或单块起草遇到解释瓶颈时，只要命中以下 6 类认知场景，就应规划配图（记录在 `figures/manifest.json` 的 `role` 字段）：

| 视觉角色（`role`） | 触发时机（什么时候必须配图？） | 推荐视觉形式与选型 |
| --- | --- | --- |
| `hook`（**视觉钩子 / 输入输出反差**） | 开篇必须有一张。同一类输入，一边是没有这项技术时的输出，一边是有它时的输出。只改这一个变量 | 左右分屏的 `svg-chart`，两边都是真实输入输出，不是生活场景 |
| `analogy`（**半句直觉，不能独立成篇**） | 机制图已经把状态和数值画完之后，才允许一张不承担证明任务的辅助图。它不能代替逐步推演，也不能把技术实体画成柜员、印章、笔或油墨 | 默认不要为这一角色单独生图。若作者明确要求，用半句标注，不画拟人角色 |
| `comparison`（**方案反差 / 笨办法 vs 新设计**） | 推演“直觉笨办法为什么撞墙”与“新方案省掉了哪步无用功”时，用左右或上下并排反差代替干瘪文字 | 多模态左右分屏对比图（`raster`）、红绿反差对比卡（`svg-chart`）、双子图（`mermaid` `subgraph`） |
| `mechanism`（**核心机制 / 一图流解剖**） | 材料里拆过的一个机制步。图上同时有开始状态、规则作用前后的关键量、被挡住与被放行的分支，以及这一步不检查的那一层。只画一行就能算完的数。不留空的分数格，图注也不写缺了哪一项 | 带数值的解剖式 `svg-chart`。不要画柜员、印章、油墨。Mermaid 只保留需要 diff 的状态名，且不与这张解剖重复贴出 |
| `evidence`（**数据冲击 / 实验验证**） | 需要用数量级差异（如 `10s` vs `2ms`）、基准测试曲线或概率分布证明结论可信度时 | 带结论标注的数据图表（`svg-chart`，**严禁用 AI 位图生图编造数据图表**） |
| `architecture`（**全局地图 / 认知闭环**） | 收束多个概念或模块在同一个核心问题下的协作关系，帮读者带走完整认知模型时 | 全局架构图（`mermaid` / `drawio`）、一屏总结信息图卡片（`svg-chart` / `raster`） |

---

## 二、我们能提供哪些图片？五大来源与选型矩阵

根据“要表达的认知内容”选择最合适的图片载体（`kind`），而不是把所有图都画成千篇一律的流程图：

| `kind` | 适用载体与视觉形态 | 源文件与导出要求 |
| --- | --- | --- |
| `raster`（**多模态 AI 生图**） | **视觉隐喻插画、左右分屏对比图、2–4 格拟人分镜条漫、3D 轴测结构解剖图、手绘白板推演图、文章封面** | 保存于 `figures/<id>.png`（或 `.webp` / `.jpg`），并在 `manifest.json` 记录 `prompt`、`aspectRatio`、`referenceImages` 与 `confirmed: true`。导出时自动附带同名 `.prompt.txt` |
| `svg-chart`（**富排版 SVG / 数据图**） | **带结论气泡的数据冲击图、红绿方案对比卡、分步连环帧、代码/报文解剖标注图**（文字 100% 清晰、可按行精准改字） | `figures/<id>.svg`（纯矢量代码生成，支持内联样式与精确坐标标注） |
| `mermaid`（**逻辑与拓扑图**） | **流程图、调用时序图、状态机、模块依赖拓扑**（适合快速迭代逻辑关系） | `figures/<id>.mmd`（文件里只放 Mermaid 源码，导出时内嵌进 Markdown 并复制源文件） |
| `drawio`（**精排架构/泳道图**） | **跨泳道复杂交互、需要作者亲手拖拽对齐的工程架构图** | `figures/<id>.drawio` 和导出的同名 `.svg`（缺 `.svg` 时阻断分享包导出） |
| `remote`（**实证截图 / 外部权威图**） | **真实监控/报错截图、实拍照片、论文或官方文档原图** | `figures/` 下的本地副本 + 非空 `license`（注明出处与许可） |

---

## 三、全篇视觉风格如何确定？（三层视觉风格锁定机制）

为了防止同一篇文章里的配图画风割裂，系统采用与「文字笔调」同构的**三层视觉风格锁定机制**：

### 1. 内置视觉画风预设（`visualStyle`，与文字笔调默认联动）
在 `writing-plan.json` 的 `visualStyle` 字段中记录本篇视觉画风（内置于 `<skill>/styles/presets.json` 的 `visualStyles`）：

1. **`tech-spotlight`（现代科技解构风 —— 默认配 `tech-blogger` 科技博主科普）**
   - **视觉特征**：干净的浅灰或深石色背景，高对比度立体轴测或半扁平科技图解；使用翡翠绿（`#16A36A` 通过/高效）与珊瑚红/琥珀黄（`#E11D48` / `#F59E0B` 瓶颈/笨办法）作为聚焦信号色，弱化次要背景节点。
   - **生图 Prompt 风格前缀**：`Modern tech explainer illustration, clean studio background, high-contrast isometric or flat-vector cutaway, emerald green (#16A36A) for optimized path and coral red (#E11D48) for bottleneck, sharp focus, minimalist geometric labels`
2. **`whiteboard-sketch`（毕导式手绘白板风 —— 默认配 `explainer` 讲解）**
   - **视觉特征**：暖白纸张底色（`#FAF8F5`），黑色马克笔手绘线条配荧光黄/薄荷绿局部涂抹高亮，包含简笔图标、问号气泡与直观物理隐喻，具有推演亲和力。
   - **生图 Prompt 风格前缀**：`Hand-drawn whiteboard sketchnote illustration on warm off-white paper (#FAF8F5), clean black marker lines with yellow and mint highlighter accents, witty stick-figure or physics metaphor, educational and approachable`
3. **`editorial-comic`（差评式科技条漫/杂志插画风 —— 默认配 `opinion` / `narrative`）**
   - **视觉特征**：鲜明的科技媒体编辑部插画感，支持 2–4 格分镜条漫、系统组件拟人化表情动作与戏剧化冲突场景。
   - **生图 Prompt 风格前缀**：`Editorial tech magazine illustration / 2-to-4 panel comic strip, expressive anthropomorphized system characters, bold graphic composition, vibrant cobalt blue and warm orange palette, clear visual storytelling`
4. **`minimal-blueprint`（极简工程蓝图风 —— 默认配 `engineering` / `colleague`）**
   - **视觉特征**：克制的等距线框与石色/靛蓝单色系，无多余装饰背景，强调系统边界框、模块分层与数据流向。
   - **生图 Prompt 风格前缀**：`Minimalist engineering blueprint diagram, clean architectural wireframe on light slate grid, monochrome indigo and stone palette with single amber highlight, precise technical layout`

### 2. 利用 `reference_image_paths` 实现「跨图画风传承」与「草图转精图」
调用多模态生图工具（`GenerateImage`）时，充分利用 `reference_image_paths` 参数锁死画风与结构：
- **个人视觉范例垫图**：若个人声音目录（`~/.chat-to-article/exemplars/`）或 `writing-plan.json` 的 `visualStyle.referenceImage` 指定了参考样张，生图时将其传入 `reference_image_paths` 以克隆画风。
- **首图定调，后图跟进**：本篇文章**第 1 张被作者接受（`accepted`）的 `raster` 图片**，自动作为本篇后续新增 `raster` 图片的默认 `reference_image_paths` 参考图，确保全篇色调、笔触与质感一致。
- **结构草图垫图生图（Structure-Guided Generation）**：当某张图既要求严谨的拓扑结构，又需要手绘/3D 视觉冲击力时，可先生成一张极简框图或白板草图，再将该草图路径传入 `reference_image_paths` 调用 `GenerateImage`，让模型严格按草图空间布局渲染精美插图。

### 3. 五要素生图 Prompt 组装法则
生成 `raster` 图片时，`prompt` 必须具体、可执行（不少于 20 词），按以下五要素组装并保存在 `figures/manifest.json`：
1. **画风前缀（Style Prefix）**：取自本篇锁定的 `visualStyle`。
2. **主体与动作隐喻（Subject & Action Metaphor）**：把抽象名词转化为具体画面动作（如“左侧一个满头大汗的办事员面对排成长龙的 100 个请求包裹；右侧 8 个自动分拣通道并行流转”）。
3. **构图与画幅（Composition & Aspect Ratio）**：明确左右分屏（`split-screen`）、四格分镜（`4-panel comic`）或中心轴测解剖（`isometric cutaway`），并设置匹配的 `aspect_ratio`（横版对比/流程优先用 `16:9` 或 `4:3`，信息卡/条漫可用 `1:1` 或 `3:4`）。
4. **视觉焦点与色彩信号（Focus & Color Signal）**：明确哪里标绿、哪里标红、视线第一落点在哪。
5. **负向约束（Constraints）**：明确要求 `minimal text, no gibberish characters, no cluttered background`（尽量少在位图内部硬塞大段密集小字，详细文字解释留给图注 `caption` 与正文）。

---

## 四、图资产清单与「视觉设计简报」（`figures/manifest.json`）

在 `figures/manifest.json` 的 `figures` 数组中，每张图同时记录**文件状态**、**视觉设计简报**与**多模态生成参数**：

```json
{
  "figures": [
    {
      "id": "fig-flow",
      "kind": "mermaid",
      "status": "accepted",
      "role": "mechanism",
      "intent": "直观展示从事实主张到分享包的四步单向编译链路，省去正文中对文件流转步骤的啰嗦复述。",
      "takeaway": "修改只发生在单块文件内，主张与大纲作为上游契约按引用精确传播。",
      "anchorSummary": "图中节点依次为「主张」→「大纲」→「正文块」→「分享包」；正文直接引用这四个名称，不重复抄写箭头顺序。",
      "caption": "修订从主张走到分享包，中间经过大纲和正文块。",
      "alt": "从主张到分享包的四步",
      "source": "figures/fig-flow.mmd",
      "prompt": "",
      "aspectRatio": "16:9",
      "referenceImages": [],
      "confirmed": true,
      "license": "",
      "blockIds": ["b002"]
    }
  ]
}
```

### 生图授权规则（`confirmed`）
- **未经用户确认，不擅自调用 `GenerateImage` 生成无关插图**；但确认方式无需繁琐的多次口头盘问：
  1. 用户在对话中直接要求“配张图 / 生张图 / 画个对比插图”；
  2. 用户在 `review_outline`（大纲审阅）中确认了包含 `kind: "raster"` 的图位规划；
  3. 用户在 `review_block`（正文块审阅）中新增了 `raster` 配图请求（`figureRequests`）；
  4. 用户在 `review_figure` 中审阅或修改了 `raster` 图的 `prompt` 并点击提交。
- 以上任一操作均视为用户已明确授权（自动写入 `confirmed: true`），Agent 可立即调用 `GenerateImage` 生成图片并落盘到 `figures/<id>.png`。

---

## 五、结合图片动态调整文章内容（「看图写文、以图减文」SOP）

当一张图生成或更新后，必须通过以下步骤动态调整关联正文块（`blockIds`）：

1. **Agent 多模态读图自检（Vision Self-Check）**：
   - 调用 `GenerateImage` 生成位图（或拿到外部截图）后，**立即调用 `Read` 工具读取该图片文件**，用多模态视觉能力亲眼检查：
     - 画面构图是否准确传达了 `takeaway`？有没有奇怪的伪影或乱码？
     - 画面里具体画了什么颜色、什么角色动作、左右两侧分别是什么细节？
2. **看图咬合细节（Vision-to-Text Weaving）**：
   - 将亲眼看到的画面细节自然织入正文引子与解释中（例如看到生成的图里左边是红色拥堵单车道、右边是绿色多车道分流，正文就直接写*“看下图左侧那条堵成深红色的单行道……”*），让读者感觉图和文是同一个人看着画面写的。
3. **以图减文，拒绝复读（No Redundant Narration）**：
   - **分工法则**：图负责展示**空间拓扑、完整步骤、并列分支与量级反差**；正文只负责**① 抛出问题并引导视线（“注意看图中间标红的环节”）→ ② 点破最反直觉的 1–2 个转折机制 → ③ 交代图上画不出来的隐含代价与适用边界**。
   - 若某块原本只有纯文字，后来新增了配图，**必须在配图落盘后对该块正文做「抽脂瘦身」**——删掉已被图片直观表达的步骤罗列。
4. **类比图之后立即拉回真实原理**：
   - 如果挂的是 `analogy`（生活类比/条漫）图，图后的第一句话必须完成**从类比载体到真实工程实现的映射**，并点明类比的边界。

---

## 六、迭代图片本身与反向联动修文（Bidirectional Iteration）

1. **垫图局部迭代（Image-to-Image Refinement）**：
   - 当作者在 `review_figure` 中对一张 `raster` 图提出局部修改意见（如“整体构图很好，但把右边的服务器改成发光的绿色缓存盒子”）时，将当前图片路径传入 `GenerateImage` 的 `reference_image_paths`，在保持原有构图与画风的基础上定向重绘。
2. **改图触发正文块联动复核（`stale` 传播）**：
   - 当一张图被重画、修改了节点名称/流程顺序/视觉比喻/核心结论，或作者在 `review_figure` 中勾选了「图结构或结论已变，需同步复核关联正文块」（`markBlocksStale: true`）或填写了正文联动意见（`textSyncNote`）时：
   - 系统自动将引用该图的已接受正文块（`blockIds`）标为 `stale`。
   - 随后你只需针对这些变成 `stale` 的块，读取最新图片与块正文，做局部「图文对齐」微调并调用 `review_block`，其余未关联的块保持 `accepted` 不动。
