# 个人写作风格档案（Voice Profile）

个人风格档案保存在 `$CHAT_TO_ARTICLE_HOME`（默认 `~/.chat-to-article/`），与具体文章仓库分离：

```text
~/.chat-to-article/
  profile.json          # 当前最新风格档案
  history/
    r1.json             # 历史版本快照（供钉住旧版本的文章读取）
  lexicon/
    private.json        # 个人私有词表
  exemplars/
    e1.md               # 作者认可的本人范文片段
  candidates.jsonl      # 从各篇文章修订中收集的风格候选
```

## 一、`profile.json` 的结构

```json
{
  "revision": 1,
  "locale": "zh-CN",
  "audience": "",
  "person": "第一人称（我）",
  "structure": {
    "headingDepth": 2,
    "listPolicy": "能写成连贯句子就不拆成碎列表"
  },
  "terms": [
    {"prefer": "聊天记录", "avoid": "对话语料"}
  ],
  "exemplarRefs": ["exemplars/e1.md"],
  "rules": [
    {
      "id": "r1",
      "text": "段首先写具体问题，不写总括句",
      "strength": "enforce",
      "evidenceArticles": 1,
      "status": "active"
    }
  ]
}
```

- 每篇文章在创建时，将当时的 `profile.revision` 记入文章 `meta.json` 的 `styleRevision`。
- 起草和修订该文章时，读取对应版本的档案（若全局档案后来升了版，可从 `history/r<styleRevision>.json` 读取钉住的旧版）外加本篇的 `preferences.jsonl`。

---

## 二、从作者旧文学习风格

当用户提供几篇自己过去写的文章（如 `~/writing/*.md`）希望系统学习其文风时：
1. **由你（Agent）直接阅读旧文做深度文风归纳**（不要依赖机械字数统计）：
   - 观察其人称习惯、开头切入方式（是从具体故障/故事切入还是先给定义）、段落节奏、转折与连接词习惯、标题层级密度、是否爱用类比或代码对照；
   - 挑选 2–3 段最具代表性的原文作为候选范文片段（`exemplars`）。
2. **交由作者确认**：
   - 将归纳出的具体风格规则与范文片段展示给作者（有 `review_style_candidates` 工具时可直接调用）。
3. **升级档案版本**：
   - 作者确认后，将原 `profile.json` 备份到 `history/r<旧版本号>.json`，把 `revision` 加 1，写入新确认的 `rules` 和 `exemplars/`。

---

## 三、篇末沉淀风格候选

在一篇文章写完（或第一节审完）时，可整理本篇 `preferences.jsonl` 中尚未升级（`promoted: false`）的规则以及 `revisions.jsonl` 中反映出的措辞偏好，询问作者是否写入全局风格档案（可调用 `review_style_candidates`）。
- 若环境使用 `review_style_candidates`，用户在界面上勾选提交后，组件会自动完成 `profile.json` 的版本递增与 `history/` 快照保存。
- 未被勾选的条目可保留在 `candidates.jsonl` 中，不强行写入全局规则。

---

## 四、优先级顺序

当不同来源的风格要求发生冲突时，按以下从高到低的优先级执行：
1. 作者在当前对话或当前块批注里的**明确指令**；
2. 本篇刚沉淀的偏好（`articles/<slug>/preferences.jsonl`）；
3. 个人私有词表（`~/.chat-to-article/lexicon/private.json`，包含对共享禁词的 `allow` 放行）；
4. 本篇钉住的个人风格档案（`profile.json` / `history/r<N>.json`）；
5. 本篇选定的内置笔调（`writing-plan.json` 的 `voice`）；
6. 共享词表（`<skill>/lexicon/`）。
