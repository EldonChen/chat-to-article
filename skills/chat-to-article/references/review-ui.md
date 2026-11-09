# 嵌入式审阅界面（MCP Apps）

当用户安装了 `@liem-opc/chat-to-article-mcp-ui` 时，工具清单中会提供以下交互式 UI 组件。它们的作用是**在对话内提供可视化的审阅与编辑画布**，让用户不用在聊天框里手敲大段修改意见，也不用面对原始 JSON 文件。

| 工具 | 适用场景与交互能力 | 用户提交后自动落盘的内容 |
| --- | --- | --- |
| `ask_questions` | 需要向作者确认 1–6 个方向性选择题（带推荐项、自由补充和「暂不确定」） | 只读提问，将作者的回答结构化返回对话 |
| `review_writing_plan` | 审阅与微调写作动机（困惑起点、追问链、核心顿悟、认知缺口）、文体、读者、偏好轴与行文方案；支持「一键推导目的与行文方案」和胶囊快选 | 自动创建文章目录（若尚不存在）、写入 `writing-plan.json`（`status: "confirmed"`）并更新 `meta.json` |
| `review_claims` | 按认知链路角色（痛点/顿悟/证据/边界）分组审阅主张，支持改字、标疑问、标记待补缺口（`gapNote`）与密钥脱敏确认 | 自动写入 `claims.jsonl`、`materials.json` 并更新 `meta.json`；被改写或拒绝的主张会自动将关联块标为 `stale` |
| `review_outline` | 审阅章节顺序、每节回应的读者疑问（`readerQuestion`）、认知角色与主张分配；右侧实时展示「读者认知爬坡路线图」 | 自动写入 `outline.json`、`figures/manifest.json` 并更新 `meta.json` |
| `review_variants` | 并排展示同一块的 2–4 版不同笔调样稿，供作者挑选并留下好恶评价 | 选中版本自动写入 `blocks/<id>.md`，选定笔调自动写入 `writing-plan.json` 的 `voice` 字段 |
| `review_block` | 所见即所得的正文块审阅器（支持类 Word 修订模式改字留痕、划词批注、词表实时高亮与依据对照） | 用户点「接受这块」时自动将最终正文以 `accepted` 状态写入 `blocks/<id>.md` 并记录 `revisions.jsonl`；点「按批注修改」时保存用户手改部分并将修订明细与批注返回对话 |
| `review_figure` | 实时预览并编辑 Mermaid / SVG 图源码、图注与替代文本 | 接受后自动保存图源文件并将 `figures/manifest.json` 中对应图置为 `accepted` |
| `review_style_candidates` | 勾选并编辑准备写入全局个人声音档案的风格规则 | 提交后自动升级 `~/.chat-to-article/profile.json` 版本并保存 `history/` 快照 |

## 使用原则

1. **按需调用，无前置锁死**：
   - 这些工具没有硬编码的先后门禁限制。如果用户只想直接改某一段，可以直接调用 `review_block`；如果用户想先看大纲，可以直接调用 `review_outline`。
2. **调用后等待用户操作**：
   - 工具调用会立即在对话中嵌入界面并返回。用简短一句话请用户在界面上操作并点击提交按钮，然后**结束当前轮次**，等待回传的 `【审阅结果】` 消息。
   - 若用户表示已提交但对话中未收到消息，可调用 `get_review_result`（传入 `sessionId`）读取。
3. **提交即落盘，无需再跑冗余 CLI 命令**：
   - 用户在界面上确认计划、主张、大纲、选笔调、接受块或升级风格后，MCP 服务端已经完成了对应文件的写入和状态更新。你只需根据返回的用户批注或修订继续下一步（例如归纳 `preferences.jsonl` 或起草下一块），无需再回头运行任何状态门禁脚本。
