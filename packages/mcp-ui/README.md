# @liem-opc/chat-to-article-mcp-ui

「聊出文章来」（chat-to-article skill）的 MCP App。需要你确认写作计划、主张、大纲、正文块、插图或风格候选时，agent 不再把 JSON 或整块正文贴进对话，而是调用一个审阅工具。对话里会嵌入对应的审阅界面，你直接在界面上改、批注，然后点一个按钮。结果作为一条用户消息回到对话，agent 接着往下写。

界面通过 [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview) 扩展（`io.modelcontextprotocol/ui`）提供：每个审阅工具都关联一个 `ui://` 资源，由客户端放进沙箱 iframe 渲染。不开端口，也不打开浏览器。需要支持 MCP Apps 的客户端（Cursor、Claude Desktop、VS Code 等）和 Node.js 20 或更高版本。

```jsonc
// .cursor/mcp.json（或其他 MCP 客户端的配置）
{
  "mcpServers": {
    "chat-to-article-ui": {
      "command": "npx",
      "args": ["-y", "@liem-opc/chat-to-article-mcp-ui"]
    }
  }
}
```

## 审阅动作

| 工具 | 界面 | 按钮 | 写入 |
| --- | --- | --- | --- |
| `ask_questions` | 选择题卡片：推荐项、多选、自己写、「不确定」 | 提交回答 / 先跳过 | 不写文件 |
| `review_writing_plan` | 文体标签、读者、目的、七条偏好轴、备选行文方案；每项都能批注 | 确认计划 / 让 agent 再想想 / 先不写 | 确认后写 `writing-plan.json` |
| `review_claims` | 每条主张：采用 / 待定 / 有疑问 / 不要，可改字、批注、补一条；疑似密钥要勾选「已处理」；提示哪些块会因此过期 | 提交决定 / 让 agent 再查 | 调用时把新主张以 candidate 写入 `claims.jsonl`；提交时写入决定和 `materials.json` |
| `review_outline` | 章节排序、增删、主张和图的分配、块拆分；未覆盖的主张 | 确认大纲 / 让 agent 重排 | 确认后写 `outline.json` 和图位 |
| `review_block` | 所见即所得的修订模式：直接改字留痕（插入下划线、删除线），逐处或全部接受/拒绝；选中文字加批注；词表实时检查；前后块只读；与上一版的差异 | 接受这块 / 按批注修改 / 稍后再说 | 调用时以 draft 写入 `blocks/<id>.md`；提交时保存你的修改 |
| `review_figure` | Mermaid 实时预览、源文件、图注、替代文字 | 接受这张图 / 让 agent 改 / 稍后再说 | 调用时写图源；提交时更新 `figures/manifest.json` |
| `review_style_candidates` | 每条候选：写进风格 / 再观察 / 不是我的习惯，措辞可改 | 提交 / 稍后再说 | 不写文件，返回 `bump-style` 命令 |

门禁仍然由 skill 的 `cta.py` 负责（`set-gate`、`accept-block`、`compile --export`、`bump-style`）。提交结果里写明了下一步要运行的命令，agent 照着执行即可。起草门禁与 `check-draft` 相同：大纲未确认、块不在大纲里时，`review_block` 直接报错。

## 一次审阅怎么走

1. agent 调用审阅工具。工具准备好草稿和上下文后立即返回，对话里出现审阅界面。agent 请你审阅，然后结束这一轮。
2. 界面通过只给界面用的工具 `review_load` 载入内容（对 agent 不可见，`visibility: ["app"]`）。界面跟随客户端的明暗主题和字体，窄的对话栏里单列排布，宽度够时侧栏并排；支持全屏的客户端可以切到全屏审阅。
3. 你点按钮后，界面调用 `review_submit` 写入文章目录，再把「【审阅结果】……」作为一条用户消息发进对话，agent 按其中的说明继续。
4. 客户端不支持界面发消息时，界面会提示你在对话里回复「继续」，agent 用 `get_review_result` 读取结果。

界面重新渲染时会显示已提交的状态，不会重复提交。MCP 服务重启后，界面用原始工具参数重建会话，草稿仍在。客户端没有声明支持 MCP Apps 时，工具返回的说明会让 agent 改回在对话里审阅。`list_review_sessions` 列出本进程的所有审阅。

## 选项

```
npx -y @liem-opc/chat-to-article-mcp-ui [--help] [--version]
```

`CHAT_TO_ARTICLE_HOME` 指定声音目录（读取私有词表和风格），`CHAT_TO_ARTICLE_SKILL` 指定 skill 目录（读取共享词表、生成 `cta.py` 命令）。

## 开发

在仓库根目录：

```bash
pnpm install
pnpm dev:mcp        # 构建视图并启动本地 MCP Apps 宿主 http://127.0.0.1:4330/
pnpm --filter @liem-opc/chat-to-article-mcp-ui test
```

`dev/` 里的开发宿主不随包发布。它把真实的 MCP 服务连到进程内客户端，用 `AppBridge` 把视图放进沙箱 iframe，模拟一段对话：选一个示例动作，点「agent 调用工具」，界面发回的消息会作为用户消息出现在下面。地址参数 `?demo=review_block&width=560&theme=dark` 直接打开指定动作，`&nomessage` 模拟不支持界面发消息的客户端。改了 `web/` 之后重新运行 `pnpm --filter @liem-opc/chat-to-article-mcp-ui build:views` 再刷新页面。

视图是两个自包含的 HTML（`dist/views/review.html`、带 Mermaid 的 `figure.html`），由 `vite-plugin-singlefile` 打包，满足宿主默认的 CSP。技术栈：`@modelcontextprotocol/ext-apps`、`@modelcontextprotocol/server`、React 19、TipTap（ProseMirror）及自写的修订与批注扩展、Zustand、Tailwind CSS v4。发布见仓库根目录的 README。
