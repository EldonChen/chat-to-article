# 材料

## 检索

用多次短查询找会话。每次一到两个词，不要把一串词放进同一次查询。列出标题和摘要，让用户勾选。

勾选结果写成：

```json
[
  {"id": "conv-1", "title": "标题", "transcript": "/绝对路径/会话.jsonl"}
]
```

没有全文文件时，`transcript` 设为 `null`。这是「只有摘要」。

不要读取 `subagents/` 下的记录，除非用户点名那一次调查。

文章目录里的 `materials.json` 要同时写下勾选和全文：

```json
{"selected": ["conv-1", "conv-2"], "fullText": ["conv-1"]}
```

`selected` 是用户勾选的 id。`fullText` 只放有全文文件的 id。只有摘要的会话可以出现在 `selected` 里，用来提醒作者，但不能写进主张来源。

## 覆盖检查

```bash
python3 <skill>/scripts/cta.py check-materials --hits hits.json --selected conv-1,conv-2 --supplement notes.md
```

报告里的「有全文」「只有摘要」「未勾选」「补充文件」要原样给用户看。退出码 2 表示不能开始写文章。未勾选的会话不能出现在主张的 `sources` 里。

补充文件和粘贴是与全文会话同等的材料。来源写成：

```json
{"kind": "file", "id": "notes.md", "note": "用户指定的笔记"}
{"kind": "paste", "id": "paste-1", "note": "用户粘贴"}
```

## 抽取

```bash
python3 <skill>/scripts/cta.py extract --jsonl 会话.jsonl --out 抽取.md --secrets-out secrets.json
```

只保留 `user` 和 `assistant` 的 `type: text`。`tool_use` 丢掉。密钥被标出，但不会从抽取稿里删掉，避免用户不知道少了一段材料。正文和分享包里不要出现密钥原文。

主张上的密钥用 `secret: true`。用户处理过后：

```bash
python3 <skill>/scripts/cta.py mark-claim --article articles/<slug> --id c-secret --status rejected --resolved
```

`check-sources` 会拒绝任何未勾选的会话 id。导出时再查一次。
