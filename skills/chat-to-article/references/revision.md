# 修订

默认只改用户点名的那一块。`show-block` 里的前后块是只读的，不能写入。

## 改这一块

```bash
python3 <skill>/scripts/cta.py rewrite-block \
  --article articles/<slug> \
  --block b003 \
  --body-file b003.md \
  --instruction "开头直接讲问题"
python3 <skill>/scripts/cta.py lint --article articles/<slug> --block b003
```

把统一差异给用户。用户接受后再 `accept-block`。`rewrite-block` 只写这一个块文件和 `revisions.jsonl`。

词表命中时，只替换 `sentence` 字段那一句。`start` 和 `end` 是这块正文里的位置。

## 主张变了

```bash
python3 <skill>/scripts/cta.py mark-claim --article articles/<slug> --id c1 --text "改正后的主张"
```

只有引用这条主张的块会变成 `stale`。其他已接受的块不要打开、不要改。`stale` 的块在再次 `accept-block` 之前不能导出。

拒绝或标成有争议同样会使引用块待复核。把一条候选主张接受下来，不会把块打成待复核。

## 大纲

可以改 `outline.json` 的顺序和章节。已接受块的正文不要因为调序而重写。新节才新建块。从大纲拿掉的块，文件留着，只是不再编译进去。

## 用户直接改了 article.md

先 `compile` 生成带锚点的工作稿。锚点成对出现：`<!-- block:b001 -->` 和 `<!-- /block:b001 -->`。图在锚点外面。

```bash
python3 <skill>/scripts/cta.py sync-anchors --article articles/<slug>
```

锚点齐全时，改动收回到对应块，这块回到 `draft`，不自动接受。锚点对不上时退出码 2，不写任何块，并把各块原文列出来。请用户指定改的是哪一块。不要猜测。

## 整篇重写

没有对应脚本。用户要明确说出整篇重写，并再回答一次确认。在那之前，只按上面的单块命令做。
