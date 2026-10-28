# 聊出文章来

把某一个主题下的过往聊天，整理成可以回顾、可以交给别人看的文章。

聊天里已经有判断、术语和来龙去脉。缺的是一篇结构稳定、语气像本人、图文能一起带走的文章，以及之后一段段改下去的办法。

本仓库是这个 skill 的项目。demo 已按产品规格和架构落地：skill 指令、共享词表，以及抽取、扫描、编译和修订门禁的脚本。对话里的起草和改写仍由 agent 完成。

写作流程现在先确认文章级写作计划（文体、读者、目的、偏好和行文方案），再进入材料、主张和大纲。提问与问卷设计规则见 `skills/chat-to-article/references/discovery-questions.md`。

## 名字

| 用途 | 取值 |
| --- | --- |
| 显示名 | 聊出文章来 |
| skill id（实现阶段写入 frontmatter） | `chat-to-article` |
| 仓库目录 | `chat-to-artical`（已有目录名，保持不动） |

skill id 只能使用小写字母、数字和连字符，所以不把中文名放进 `name` 字段。

## 这个阶段的文档

- [产品规格说明](docs/product-spec.md)：交付形态、使用方式、功能要求与第一版验收。
- [技术方案研究](docs/research.md)：聊天记录能取到什么、风格如何学、图怎么选、词表怎么管、为什么不能整篇重写。
- [架构设计](docs/architecture.md)：三层文稿、块修订协议、数据放在哪、工作流门禁、实现阶段的目录。

## 安装和更新

skill 在 `skills/chat-to-article/`，目录名和 frontmatter 的 `name` 都是 `chat-to-article`。用 [skills CLI](https://github.com/vercel-labs/skills) 安装和更新：

```bash
npx skills add EldonChen/chat-to-article --skill chat-to-article
npx skills update chat-to-article
```

这是私有仓库。执行命令的环境需要能读取该仓库：已登录的 GitHub CLI、Git 凭据，或 SSH。安装时 CLI 只复制 `skills/chat-to-article/` 里面的文件，所以脚本、词表、参考说明和样例都放在这个目录里。

## Demo

```bash
python3 skills/chat-to-article/scripts/cta.py demo
python3 skills/chat-to-article/scripts/test_demo.py
```

样例分享包在 `skills/chat-to-article/examples/demo/article/export/`。样例声音目录是同级的 `voice/`，不会写入 `~/.chat-to-article/`。

在本仓库里，skill 通过 `.cursor/skills/chat-to-article` 加载。

## skill 目录

```
skills/chat-to-article/
  SKILL.md
  references/
  lexicon/
  scripts/
```

用户自己的风格和私有词表不进这个仓库，默认放在 `~/.chat-to-article/`。文章工作区由用户指定，默认是当前项目里的 `articles/<slug>/`。

## Web 应用

`packages/` 下有两个独立发布到 npm 的 web 应用，和 skill 解耦：skill 不依赖它们，它们只读写 skill 定义的文件格式。

| 包 | 用途 | 启动 |
| --- | --- | --- |
| [`@liem-opc/chat-to-article-admin-ui`](packages/admin-ui) | 只读管理台：风格、词表、当前目录下的所有文章，导出 Markdown | `npx @liem-opc/chat-to-article-admin-ui` |
| [`@liem-opc/chat-to-article-mcp-ui`](packages/mcp-ui) | MCP App：在 agent 对话里嵌入审阅界面，审计划、主张、大纲、正文块（修订模式 + 批注）、图、风格候选 | MCP 配置里写 `npx -y @liem-opc/chat-to-article-mcp-ui` |

`packages/core` 是两者共用的读取、渲染和词表检查代码（与 `cta_lib.py` 输出一致，有测试对照），构建时打进各自的包里，不单独发布。

开发需要 Node.js 20+ 和 pnpm（版本见根目录 `package.json` 的 `packageManager`）：

```bash
pnpm install
pnpm typecheck && pnpm test && pnpm build
pnpm dev:admin     # 管理台
pnpm dev:mcp       # 本地 MCP Apps 宿主，在模拟对话里预览嵌入式审阅界面
```

### 发布

推到 `main` 且提交说明符合约定式提交时，GitHub Actions 会自己改版本号、打 tag，并把包放进 npm 待审队列。不需要手改 `package.json` 的 `version`。工作流成功只表示包已待审；在 npm 包页面的 Staged Packages 里点 Approve 并完成两步验证之后，这个版本才能被安装。

| 提交说明 | 版本 |
| --- | --- |
| `fix:`、`perf:` | 补丁版本，0.1.0 → 0.1.1 |
| `feat:` | 次版本，0.1.0 → 0.2.0 |
| `feat!:` 或正文里的 `BREAKING CHANGE:` | 主版本，0.2.0 → 1.0.0 |

其他类型（`chore:`、`docs:`、`refactor:`、`test:`）不发布。说明写在第一行，例如 `feat: 增加多版笔调审阅`。

哪个包发布看改了哪些文件，不看 scope：

| 改动路径 | 发布 |
| --- | --- |
| `packages/mcp-ui/**` | mcp-ui |
| `packages/admin-ui/**` | admin-ui |
| `packages/core/**`、`tsconfig.base.json` | 两个都发 |
| `skills/**`、`docs/**` | 不发 |

`packages/core` 不单独上 npm，构建时打进两个包里。

流程在 `.github/workflows/release.yml`：semantic-release 把新版本写进对应的 `package.json`，提交（信息里带 `[skip ci]`，不会再次触发自己），打 `mcp-ui-v*` 或 `admin-ui-v*` tag，然后启动原来的发布工作流。提交待审仍然由 `release-mcp-ui.yml` 和 `release-admin-ui.yml` 完成，因为 npm Trusted Publisher 授权的是这两个文件。用的是 Actions 自带的 `GITHUB_TOKEN`，这种令牌打的 tag 不会再触发工作流，所以不会提交两次。

第一次在 `main` 上运行时，如果某个包还没有 tag，会按 `package.json` 里的版本在当前提交打一个基线 tag，不上传 npm。之后的提交才开始计算版本。

手动补发仍可用：Actions 里运行对应的 Release 工作流，取消 dry run；或推送 tag `mcp-ui-v<版本>` / `admin-ui-v<版本>`。发布工作流会核对 tag 与版本一致、该版本还没上过 npm，然后跑类型检查、测试、构建和 CLI 冒烟测试，最后执行 `npm stage publish`。

发布走 npm Trusted Publishing，仓库里不保存 npm 令牌。可信发布保持只允许 `npm stage publish`。仓库必须公开，provenance 才会生成。包必须先在 npm 上存在，才能配置 Trusted Publisher，所以每个包的第一个版本仍要在本机发一次。`main` 需要允许 GitHub Actions 直接推送版本号提交；如果开了分支保护，要放行 `github-actions[bot]`。

## 运行假设

第一版面向 Cursor 里的 agent：用本地会话索引定位聊天，用全文记录抽取内容，结构图默认用 Mermaid，复杂图用 draw.io 编辑后导出回文章目录，插图只有在用户明确要求时才生成。工具缺失时，改为用户粘贴材料和手写图源，文章的数据模型不变。
