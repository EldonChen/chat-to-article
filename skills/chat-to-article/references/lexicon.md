# 词表

共享词表在本 skill 的 `lexicon/`。私有词表在声音目录的 `lexicon/private.json`。

```bash
python3 <skill>/scripts/cta.py lint --article articles/<slug> --block b001
```

每条结果有 `blockId`、`start`、`end`、`entryId`、`severity`、`sentence`。`severity` 为 `ban` 时退出码是 1，导出会被拒绝。`watch` 只提示，不挡住导出。

处理 `ban` 时只重写 `sentence`。不要整块换一套说法，也不要做字符串替换了事。

## 私有词表

```bash
python3 <skill>/scripts/cta.py private --action ban --phrase "某种说法"
python3 <skill>/scripts/cta.py private --action prefer --phrase "对话语料" --replacement "聊天记录"
python3 <skill>/scripts/cta.py private --action allow --entry zh-zhuyi
python3 <skill>/scripts/cta.py private --action promote-pattern --pattern pat-bushi
```

`ban` 和 `prefer` 都会挡住导出。`prefer` 的结果里带 `replacement`。`allow` 放行一条共享词条。`promote-pattern` 把共享句式从观察升成禁用。句式默认是观察：`不是A而是B`、`不仅A更B`、`Not X, but Y`、`It's not X. It's Y.`

行业用语（赋能、抓手、闭环、底层逻辑、leverage、robust、seamless、landscape）在共享表里是观察，不是禁用。
