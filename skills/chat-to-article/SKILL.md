---
name: chat-to-article
description: >-
  把某个主题下的过往聊天整理成可回顾、可共享的文章，并按块修订。
  维护版本化的个人写作风格、共享与私有词表，以及 Mermaid、draw.io 和经确认的插图。
  在用户要把聊天整理成文章、从聊天写文章、按段改文章、回顾一个主题的对话，
  或修改文章中的某一段、某一张图时使用。
---

# 聊出文章来

显示名是「聊出文章来」。文章目录默认是当前工作区的 `articles/<slug>/`。声音目录是 `$CHAT_TO_ARTICLE_HOME`，未设置时为 `~/.chat-to-article/`。

确定性操作用与本文件同级的脚本。先把 `<skill>` 换成包含本 `SKILL.md` 的目录：

```bash
python3 <skill>/scripts/cta.py <子命令>
```

你负责检索、主张、大纲、起草和改写。脚本负责切分、门禁、扫描、编译、同步和钉住风格版本。不要手写 `export/`，不要改未点名的块文件。

样例：`python3 <skill>/scripts/cta.py demo`。结果写在本 skill 目录的 `examples/demo/article/export/`，安装之后这个相对位置不变。

## 先选路径

- 新主题成文 → 下面的清单
- 改已有的一块或一张图 → [revision.md](references/revision.md)
- 从旧文学习笔调、或确认风格候选 → [style.md](references/style.md)
- 禁用词、习惯说法、放行 → [lexicon.md](references/lexicon.md)
- 图的类型和文件 → [figures.md](references/figures.md)
- 会话怎么找、怎么抽 → [sources.md](references/sources.md)

用户说「整篇重写」时，先停。复述这将重写全部正文块，问「确认整篇重写吗？」。得到肯定后再逐块改。只说「改改」时，先问是改哪一块、改大纲，还是改主张。没有整篇重写的脚本。

没有用户明确要求时，不调用生图，不新增 `kind` 为 `raster` 的图。

## 写一篇

复制这份清单。前一项没通过，不要做下一项。

```
- [ ] 材料覆盖
- [ ] 主张确认
- [ ] 大纲确认
- [ ] 第一节审完
- [ ] 其余节
- [ ] 词表
- [ ] 风格候选
- [ ] 导出
```

### 材料覆盖

按 [sources.md](references/sources.md) 检索并写成 `hits.json`。用户勾选后运行：

```bash
python3 <skill>/scripts/cta.py check-materials --hits hits.json --selected id1,id2 --supplement 补充.md
```

退出码 2：停止。向用户要文件或粘贴。不要创建文章，不要写主张。摘要只用来提醒「还有这段」，不能写成主张。

### 主张和大纲

```bash
python3 <skill>/scripts/cta.py new-article --title "标题" --slug slug --topic "主题"
python3 <skill>/scripts/cta.py extract --jsonl 会话.jsonl --out 抽取.md --secrets-out secrets.json
```

未指定 `--dir` 时，文章在 `./articles/<slug>/`。把勾选结果写入 `materials.json`：`selected` 是勾选的 id，`fullText` 只放有全文的 id。主张写入 `claims.jsonl`，来源 `kind` 用 `conversation`、`file` 或 `paste`。只有摘要的会话不能出现在来源里。疑似密钥记在主张上：`secret: true`，原文不要抄进正文。用户处理后再 `mark-claim --resolved`。

每条主张要用户接受或拒绝。还有 `candidate` 或 `disputed` 时，不要确认：

```bash
python3 <skill>/scripts/cta.py check-sources --article articles/<slug>
python3 <skill>/scripts/cta.py set-gate --article articles/<slug> --claims
```

大纲写入 `outline.json`，图记录写入 `figures/manifest.json`。用户确认结构之后：

```bash
python3 <skill>/scripts/cta.py set-gate --article articles/<slug> --outline
```

大纲未确认时不要写块。

### 起草

写每一块之前运行 `show-block`。它只给出钉住的风格版本、生效规则、范文、这块的主张，以及前后块的只读正文。不要另读整篇 `article.md` 来改写。

```bash
python3 <skill>/scripts/cta.py check-draft --article articles/<slug> --section first
python3 <skill>/scripts/cta.py show-block --article articles/<slug> --block b001
```

正文只使用这块 `claimIds` 里已经接受的主张。段落落在风格档案的字数范围内。写完把文件存成 `blocks/<id>.md`，一次只给用户看这一块。

用户接受后：

```bash
python3 <skill>/scripts/cta.py accept-block --article articles/<slug> --block b001
```

默认先完成第一节。`check-draft --section rest` 失败时，不要写后面的节。用户明确说「按当前风格写完」之后，才运行 `allow-write-all`，然后再写其余节。其余节仍然一块一块给用户看。

### 改一块

只改被点名的块。用 `rewrite-block`，或只编辑那一个块文件。然后把脚本打印的差异给用户，不要重印全篇。细节见 [revision.md](references/revision.md)。

### 词表、风格、导出

`lint` 退出码 1 表示有禁用说法。只重写命中的那一句，同块其余句子保持原样。见 [lexicon.md](references/lexicon.md)。

一篇结束时，把这次措辞修改收成候选，问用户哪些写入声音目录。写入用 `bump-style`。这个命令不修改已有文章的 `styleRevision`。

```bash
python3 <skill>/scripts/cta.py lint --article articles/<slug>
python3 <skill>/scripts/cta.py compile --article articles/<slug> --export
```

导出失败时，把脚本输出告诉用户。`export/` 没有更新，不要把工作稿 `article.md` 当成分享包。分享包通过检查后，把 `export/` 的路径告诉用户。
