# 风格

每篇文章在 `new-article` 时把 `profile.json` 的 `revision` 写入 `meta.styleRevision`。之后的起草和 `show-block` 都读这个版本。档案升版只影响下一篇。

声音目录：

```text
~/.chat-to-article/
  profile.json
  history/r1.json
  lexicon/private.json
  exemplars/
  candidates.jsonl
```

`show-block` 只注入 `status` 为 `active` 的规则和范文。`candidate` 规则不会出现在起草上下文里。

## 从旧文学习

```bash
python3 <skill>/scripts/cta.py observe-style --input 旧文.md --input 另一篇.md
```

命令打印段长、标题深度、人称和建议范文，并往 `candidates.jsonl` 追加一条候选。它不增加 `revision`。把统计和范文给用户看。用户圈定并同意之后，才升级：

```bash
python3 <skill>/scripts/cta.py bump-style --rule "段首先写具体问题，不写总括句"
```

`bump-style` 把旧档案写入 `history/`，然后把版本加一。它不扫描文章目录，也不改任何 `meta.styleRevision`。

## 一篇结束时的候选

比较 `revisions.jsonl` 里的措辞变化和最终正文。只把用词、句式、段长这类差异写成候选，主张文本的变化不算风格。逐条问用户。用户同意的用 `bump-style` 写入。用户没同意的留在 `candidates.jsonl`。

还没有档案时，`new-article` 会建立 revision 0 的空档案。第一节的修改就是第一批候选。用户确认后才有可以钉住的写法。

## 冲突时听谁的

这一篇里的明确指令，然后是私有词表，然后是钉住的风格档案，然后是共享词表。用户的习惯用语如果撞上共享禁词，用私有词表放行，不要为了「干净」改掉他的说法。
