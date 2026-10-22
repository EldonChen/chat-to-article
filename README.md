# 聊出文章来

把某一个主题下的过往聊天，整理成可以回顾、可以交给别人看的文章。

聊天里已经有判断、术语和来龙去脉。缺的是一篇结构稳定、语气像本人、图文能一起带走的文章，以及之后一段段改下去的办法。

本仓库是这个 skill 的项目。demo 已按产品规格和架构落地：skill 指令、共享词表，以及抽取、扫描、编译和修订门禁的脚本。对话里的起草和改写仍由 agent 完成。

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

## 运行假设

第一版面向 Cursor 里的 agent：用本地会话索引定位聊天，用全文记录抽取内容，结构图默认用 Mermaid，复杂图用 draw.io 编辑后导出回文章目录，插图只有在用户明确要求时才生成。工具缺失时，改为用户粘贴材料和手写图源，文章的数据模型不变。
