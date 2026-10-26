# @liem-opc/chat-to-article-admin-ui

「聊出文章来」（chat-to-article skill）的只读管理台。在浏览器里查看声音目录里的写作风格和词表，浏览当前目录下用这个 skill 写的所有文章，并导出 Markdown。

```bash
npx @liem-opc/chat-to-article-admin-ui
```

在文章所在的项目目录里运行。它会在 `http://127.0.0.1:4310` 启动（端口被占用时顺延）并打开浏览器。需要 Node.js 20 或更高版本。

## 能看什么

| 页面 | 内容 |
| --- | --- |
| 总览 | 文章数量、各阶段分布、需要处理的问题（过期的块、禁用说法、导出失败），以及当前风格版本 |
| 文章 | 当前目录下所有文章：阶段、门禁、块进度、最近修改；可搜索、按阶段筛选和排序 |
| 文章详情 | 阅读视图（含 Mermaid 图）、写作计划、主张、大纲、图、检查结果、修订记录、Markdown 源文件 |
| 风格 | 声音目录里的风格档案、规则、范文、各版本之间的差异、待确认的风格候选 |
| 词表 | 共享词表与私有词表合并后的生效结果，标出私有条目改写或放行了哪些共享条目 |
| 导出 | 勾选多篇文章，打包下载 zip |

每篇文章可以下载三种 Markdown：

- **分享包**：`export/article.md`，`cta.py compile --export` 通过检查后的版本。
- **干净正文**：不带块锚点和来源注释，适合直接贴到别处。
- **工作稿**：带块锚点和来源，与 `article.md` 一致。

管理台只读：服务端只开放 GET 接口，不会修改任何文件。修改文章请在 agent 里用 skill，或配合 [@liem-opc/chat-to-article-mcp-ui](https://www.npmjs.com/package/@liem-opc/chat-to-article-mcp-ui) 审阅。

## 选项

```
--root <dir>    扫描文章的目录，默认当前目录
--home <dir>    声音目录，默认 $CHAT_TO_ARTICLE_HOME 或 ~/.chat-to-article
--skill <dir>   skill 目录（读取共享词表），默认自动查找
--depth <n>     向下查找文章目录的层数，默认 6
--port <n>      端口，默认 4310，被占用时顺延
--host <host>   监听地址，默认 127.0.0.1
--no-open       不自动打开浏览器
```

文章目录以 `meta.json`（含 `slug` 和 `styleRevision`）识别。共享词表从 skill 目录读取：依次查找 `--skill`、`$CHAT_TO_ARTICLE_SKILL`、从当前目录向上的 `.cursor/skills/chat-to-article`、`.agents/skills/chat-to-article` 等位置，以及用户主目录下的同名目录。找不到时词表页只显示私有词表。

## 开发

在仓库根目录：

```bash
pnpm install
pnpm dev:admin      # 服务端 4310 + Vite 开发服务器 5173
pnpm --filter @liem-opc/chat-to-article-admin-ui test
```

技术栈：Hono（服务端）、React 19、React Router、TanStack Query、Zustand、Tailwind CSS v4。发布见仓库根目录的 README。
