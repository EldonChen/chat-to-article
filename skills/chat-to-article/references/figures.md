# 图

按要表达的东西选类型，把记录写进 `figures/manifest.json` 的 `figures` 数组。

| 内容 | kind | 文件 |
| --- | --- | --- |
| 流程、时序、状态、关系 | `mermaid` | `figures/<id>.mmd`，文件里只放 Mermaid 正文 |
| 需要亲手排版 | `drawio` | `figures/<id>.drawio` 和同名 `.svg` |
| 数据图表 | `svg-chart` | 由数据生成的 `.svg` |
| 封面或比喻 | `raster` | 图片文件，以及 `prompt` |
| 网上已有的图 | `remote` | 本地副本，`license` 写出处和许可 |

`status` 用 `planned`、`drafted`、`accepted`。被大纲或块引用的图，在导出前必须是 `accepted`，并且文件真实存在。

draw.io 只负责打开编辑器。打开之后保持 `planned`，等用户把 XML 和 SVG 放进 `figures/`，再改成 `drafted`。文件不在时，工作稿里只留图位，导出会失败。

`raster` 必须同时有 `confirmed: true`、非空 `prompt` 和图片文件。没有用户明确要求生成这张图时，不要创建这种记录，也不要调用生图。数据图不要用生图。

块用 `figureIds` 挂上图。重画一张图时，只改这张图的源文件，以及说明已经过时的那些块。

导出时，Mermaid 会内嵌进分享稿，源文件同时复制到 `export/figures/`。
