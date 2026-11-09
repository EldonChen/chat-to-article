# 材料与来源约束

## 一、材料类型与来源标识

文章可以结合以下三类材料来源，并在 `claims.jsonl` 的 `sources` 数组中标明出处：

```json
{"kind": "conversation", "id": "conv-1", "note": "用户在第 2 轮关于状态恢复的追问"}
{"kind": "file", "id": "notes.md", "note": "用户指定的补充笔记"}
{"kind": "paste", "id": "paste-1", "note": "用户在对话中直接粘贴的片段"}
```

文章目录下的 `materials.json` 用于记录本篇勾选纳入的会话及其中拥有完整正文的会话：

```json
{
  "selected": ["conv-1", "conv-2"],
  "fullText": ["conv-1"]
}
```

### 核心约束
1. **区分「有全文」与「只有摘要」**：
   - 搜索接口返回的短摘要或未完整读取的会话，只能放在 `selected` 里提醒作者“当时聊过这个话题”，**不能放进 `fullText`，也不能作为 `claims.jsonl` 的来源依据**。
   - 如果通过分页接口读取会话，需一直读到最后一页并确认消息未被截断，才视为拥有完整正文。
2. **补充文件与粘贴文本**：
   - 用户主动提供的 Markdown、代码、文档或粘贴文本，与完整会话具有同等效力，可直接作为主张来源。

---

## 二、会话文本脱水与密钥扫描（可选脚本辅助）

当原始会话 `.jsonl` 文件较大、包含大量 `tool_use` 调用日志时，可用 `cta.py extract` 将 `user` 和 `assistant` 的纯文本抽出，并自动扫描疑似密钥（如 `sk-...`、`AKIA...`、私钥、`Bearer` Token）：

```bash
python3 <skill>/scripts/cta.py extract \
  --jsonl 会话.jsonl \
  [--coverage coverage.json] \
  --out 抽取.md \
  --secrets-out secrets.json
```

- 如果提供了 `--coverage coverage.json`，脚本会順便校验分页是否读完（`complete: true`、`terminalHasMore: false`、`truncatedItems: 0`）以及文本消息条数是否一致。
- 如果会话文件本身很短，或已经是导出的 JSON / Markdown，你也可以直接用 `Read` 工具读取，无需强制调用脚本。

---

## 三、从材料到主张（`claims.jsonl`）

阅读材料与用户的追问过程后，将准备写进文章的事实、判断与边界整理为 `claims.jsonl`（每行一个 JSON 对象），可调用 `review_claims` 让用户在界面上分组审阅、改写或补充：

```jsonl
{"id": "c1", "text": "改一块时不把整篇文章放进修改上下文。", "status": "accepted", "role": "insight", "inquiryTurn": 1, "sources": [{"kind": "conversation", "id": "conv-full", "note": "用户说明自己只想改一句"}]}
{"id": "c2", "text": "流程和结构图用 Mermaid 源文件保存，亲手排的图要导出 SVG。", "status": "accepted", "role": "evidence", "inquiryTurn": 2, "gapNote": "可补充 draw.io 缺 SVG 时的降级表现", "sources": [{"kind": "conversation", "id": "conv-full"}]}
{"id": "c-secret", "text": "材料里出现过密钥，正文不录原文。", "status": "rejected", "role": "boundary", "secret": true, "resolved": true, "sources": [{"kind": "conversation", "id": "conv-full"}]}
```

- `status`：`candidate`（待定）、`accepted`（采用）、`disputed`（有疑问/待查）、`rejected`（不采用）。**只有 `accepted` 的主张才能写进正文块。**
- `role`（可选）：`friction`（困惑/痛点）、`insight`（核心顿悟）、`evidence`（机制/证据）、`boundary`（适用边界）。
- `inquiryTurn`（可选）：该主张对应用户在对话中的第几轮追问。
- `gapNote`（可选）：聊天中尚未完全验证、需要在成文时补充说明的证据或边界条件。
- `secret` / `resolved`：原文疑似含敏感密钥时标 `secret: true`，正文中绝不抄录密钥原文；脱敏或排除后标 `resolved: true`。
