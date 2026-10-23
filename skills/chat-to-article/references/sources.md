# 材料

## 检索

用多次短查询找会话。每次一到两个词，不要把一串词放进同一次查询。列出标题和摘要，让用户勾选。

勾选结果写成：

```json
[
  {"id": "conv-1", "title": "标题", "transcript": "/绝对路径/会话.jsonl", "coverage": "/绝对路径/coverage.json"}
]
```

### 用户直接引用了聊天

如果用户明确引用某段聊天并要求使用，不要把“没有本地导出文件”误判成“只有摘要”。通过当前环境可用的会话读取工具获取正文。对于 `read_thread` 这类分页工具：

1. 每页读取工具允许的轮数；每次检查 `page.hasMore` 和 `page.nextCursor`。
2. 只要 `hasMore` 为 true 或存在 `nextCursor`，就继续读取下一页，直到终页明确没有下一页。不要停在最新一页或前 10 轮。
3. 收集完所有页后，按消息原始时间顺序恢复会话；如果页内或页间顺序标为 `newest_first`，先按时间排序，缺少时间戳时再反转聚合后的顺序。
4. 检查消息条目的 `truncated` / `isTruncated` 标记和工具输出截断提示。提高 `maxOutputCharsPerItem` 不能代替检查。任何正文被截断都不能声明全文；请用户导出或粘贴缺失部分。
5. 将抓到的每页轮数、最终分页状态、截断数和写入 JSONL 的文本消息数记入 `coverage.json`。按下方 schema 核对后，才将 transcript 标成全文。

用户提供的导出文件或粘贴文本也可使用，但要记录其来源类型和是否完整。拿到消息正文后，将已读的 user/assistant 文本保存为临时 JSONL，再将 JSONL 路径写入 `transcript`，覆盖清单路径写入 `coverage`。每行格式如下：

```jsonl
{"role":"user","message":{"content":[{"type":"text","text":"用户消息正文"}]}}
{"role":"assistant","message":{"content":[{"type":"text","text":"助手回复正文"}]}}
```

只收录来源会话里的 user/assistant 文本消息；不要把引用包装提示、工具调用或工具输出混入正文。若读取工具返回结构化数据，按消息内容字段保存，不能把整段工具响应当成文章材料。记录实际已读取的范围；若无法读取完整会话，就明确告知用户覆盖范围，该部分不能登记为全文材料。用户明确要求写文章时，该引用即为选择，不要再要求用户重复勾选。

只有无法读取到消息正文、且也没有可用导出文件时，`transcript` 才设为 `null`，表示「只有摘要」。

全文的 `hits.json` 条目必须同时包含 `transcript` 和 `coverage`。`coverage.json` 格式如下；`sourceTurns` 与 `capturedTurns` 必须相等，`terminalHasMore` 必须为 false，`truncatedItems` 必须为 0。脚本会核对 JSONL 中文本消息条数。`paged-read-thread` 还必须记录实际读取页数。只有核验通过的会话才可标为全文：

```json
{
  "sourceType": "paged-read-thread",
  "complete": true,
  "pagesRead": 3,
  "terminalHasMore": false,
  "sourceTurns": 24,
  "capturedTurns": 24,
  "capturedMessages": 43,
  "truncatedItems": 0
}
```

`sourceType` 也可为 `user-export` 或 `user-paste`。若清单不完整、计数不符或存在截断，`check-materials` 会报告「全文未核验」并阻止仅靠该材料开始写作。提取命令也必须传入覆盖清单：

```bash
python3 <skill>/scripts/cta.py extract --jsonl 会话.jsonl --coverage coverage.json --out 抽取.md --secrets-out secrets.json
```

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
python3 <skill>/scripts/cta.py extract --jsonl 会话.jsonl --coverage coverage.json --out 抽取.md --secrets-out secrets.json
```

只保留 `user` 和 `assistant` 的 `type: text`。`tool_use` 丢掉。密钥被标出，但不会从抽取稿里删掉，避免用户不知道少了一段材料。正文和分享包里不要出现密钥原文。

主张上的密钥用 `secret: true`。用户处理过后：

```bash
python3 <skill>/scripts/cta.py mark-claim --article articles/<slug> --id c-secret --status rejected --resolved
```

`check-sources` 会拒绝任何未勾选的会话 id。导出时再查一次。
