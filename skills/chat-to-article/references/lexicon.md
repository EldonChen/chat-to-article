# 词表：祛除套话与维护个人用语

词表分为两层：
1. **共享词表（`<skill>/lexicon/*.json`）**：默认拦截典型的 AI 写作套话（如「值得注意的是」「不难发现」「本文将深入」「delve」「tapestry」等）。「综上所述」「总而言之」只做观察：空套话可以改具体，但不要因此删掉结尾回顾。容易滥用的句式或行业黑话（如「不是……而是……」「不仅……更……」「赋能」「抓手」「闭环」）标为观察级（`watch`）。
2. **私有词表（`~/.chat-to-article/lexicon/private.json`）**：属于作者个人，支持禁用某个词（`ban`）、指定习惯替换词（`prefer`）、放行某条共享禁词（`allow`），或将观察级句式升为禁用。

## 一、扫描词表命中

使用 `cta.py lint` 扫描整篇文章或单个块：

```bash
python3 <skill>/scripts/cta.py lint --article articles/<slug> [--block b001]
```

输出为 JSON 数组，包含 `blockId`、`start`、`end`、`entryId`、`severity`（`ban` 或 `watch`）、`replacement` 和命中的完整句子 `sentence`：
- **`ban`（禁用）**：会阻断 `compile --export` 分享包生成。处理时**只自然重写命中的那一句 `sentence`**，不要把整段或整块推翻重写，也不要机械做字符串挖空。
- **`watch`（观察）**：仅作提醒，不阻断导出；若确系作者有意使用的行业术语或合理句式，保持原样即可。

## 二、维护私有词表（`~/.chat-to-article/lexicon/private.json`）

当作者提出类似「以后不要写 X」「我习惯说『聊天记录』而不是『对话语料』」「『闭环』这个词在我这里禁用 / 放行」时，直接编辑 `~/.chat-to-article/lexicon/private.json` 的 `entries` 数组：

```json
{
  "id": "private",
  "scope": "private",
  "entries": [
    {"id": "ban-1", "action": "ban", "phrase": "某种套话"},
    {"id": "prefer-1", "action": "prefer", "phrase": "对话语料", "replacement": "聊天记录"},
    {"id": "allow-zh-zhuyi", "action": "allow", "entryId": "zh-zhuyi"},
    {"id": "promote-pat-bushi", "action": "ban", "patternId": "pat-bushi"}
  ]
}
```

- `action: "ban"` + `phrase`：禁用特定短语。
- `action: "prefer"` + `phrase` + `replacement`：禁用 `phrase` 并提示改用 `replacement`。
- `action: "allow"` + `entryId`：放行共享词表中的某条规则（如作者本人确实习惯用该词）。
- `action: "ban"` + `patternId`：将共享 `patterns.json` 中的某条观察级句式（如 `pat-bushi`）升级为强制禁用。
