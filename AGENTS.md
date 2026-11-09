# AGENTS.md

## 项目结构

本仓库是「聊出文章来」（`chat-to-article`）的源码仓库，包含声明式 Agent Skill 与配套的 Web / MCP Apps 包：

- `skills/chat-to-article/`：Skill 本体（`.cursor/skills/chat-to-article` 软链指向此处）。
  - `SKILL.md` 与 `references/*.md`：声明式描述可用资源、产物形态与目标约束、以及弱约束的推荐路径。
  - `scripts/cta.py` 与 `scripts/cta_lib.py`：仅保留 4 个纯机械辅助子命令（`extract`、`lint`、`compile`、`sync-anchors`）及 `demo`。**不要在脚本里编写程序化流程门禁或启发式语义分析，主流程与认知理解由 Agent 承担。**
- `packages/core/`（`@liem-opc/chat-to-article-core`）：共享的 TypeScript 类型、块文件解析、词表编译与文章读取逻辑（构建时内联打包进另外两个包，不单独发布）。
- `packages/mcp-ui/`（`@liem-opc/chat-to-article-mcp-ui`）：MCP Apps 审阅服务与内嵌视图（`review_writing_plan`、`review_claims`、`review_outline`、`review_variants`、`review_block`、`review_figure`、`review_style_candidates`、`ask_questions`）。
- `packages/admin-ui/`（`@liem-opc/chat-to-article-admin-ui`）：只读管理台 Web 应用，用于浏览工作区文章、追问动机与认知链路、个人声音目录和词表，并导出 Markdown。

## Cursor Cloud specific instructions

云端环境通过 [`.cursor/environment.json`](.cursor/environment.json) 自动完成依赖安装、单文件视图构建与样例数据初始化。

### 常用命令

```bash
# 类型检查、构建与全量单测（TypeScript + Python）
pnpm typecheck
pnpm build
pnpm test
python3 skills/chat-to-article/scripts/test_demo.py

# 重新生成 skills/chat-to-article/examples/demo 下的样例文章与分享包
python3 skills/chat-to-article/scripts/cta.py demo

# 清理本机与工作区的 chat-to-article 用户数据（保留 exports/ 与内置 demo）
pnpm clean:data
```

### 开发服务与端口

Cloud 环境启动时默认在 `tmux` 终端运行以下两个开发服务（如修改了 `packages/mcp-ui/web/` 下的视图源码，运行 `pnpm --filter @liem-opc/chat-to-article-mcp-ui build:views` 后刷新即可）：

- **Admin UI 开发服务（`pnpm dev:admin`）**
  - 前端页面：`http://127.0.0.1:5173/`（代理 `/api` 到 `:4310`）
  - 后端 API：`http://127.0.0.1:4310/`
  - 若需直接查看 `examples/demo` 样例文章，可运行：`pnpm --filter @liem-opc/chat-to-article-admin-ui exec tsx src/server/cli.ts --no-open --root skills/chat-to-article/examples/demo --home skills/chat-to-article/examples/demo/voice --port 4310`
- **MCP Apps 沙箱开发宿主（`pnpm dev:mcp`）**
  - 访问地址：`http://127.0.0.1:4330/`
  - 支持通过 URL 参数直接打开指定审阅组件进行交互与自动化验证，例如：
    - `http://127.0.0.1:4330/?demo=review_writing_plan`
    - `http://127.0.0.1:4330/?demo=review_claims`
    - `http://127.0.0.1:4330/?demo=review_outline`
    - `http://127.0.0.1:4330/?demo=review_block`
