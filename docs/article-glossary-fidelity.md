# Article 词条弹层复核（2026-11-02）

实际课程清单只有 `003/90` 的一个 Markdown 组件包含 `#key#` 词条标记，分别为“编译语言”和“解释语言”。原站 `Re.De` 对 Markdown 段落的字符串 children 使用 `split('#key#')`，匹配 `/\S+:.+/` 的片段再按英文冒号拆分，取第 0 项作为标题、第 1 项作为释义；其余 React 子节点原样保留。实现保持该规则和原数据空格，不把普通 `C#`、十六进制颜色或代码误当成词条。

`ArticleGlossary.tsx` / `article-glossary.css` 恢复原版下划线触发器、hover 100ms 延迟、240px 释义正文、标题分隔线、箭头、阴影、.2s 动画、上方优先并按可用空间向下翻转。鼠标可以进入弹层阅读；离开后关闭。原版触发器为 `span > u`，tabIndex 为 -1，不能通过 Tab 进入；本地额外提供 Tab / focus 打开和 Esc 关闭，不改变鼠标外观。

`node tests/article-glossary-audit.mjs` 使用原站公开 bundle 的原 Markdown / Ant Popover 组件与本地实际 Content 渲染同一数据，验证两个词条向下弹出和第一个词条向上弹出。3 对截图的定位和尺寸完全一致，RGB 最大通道差超过 8 的像素均为 0；6 个鼠标/键盘断言全部通过。裁片经人工查看，包含原 SVG/CSS 箭头、标题、释义换行和字形。

图库：`output/article-glossary-review/index.html`。结果：`output/article-glossary-review/audit.json`。测试包含原版不可 Tab 聚焦这一事实，不将新增键盘访问宣称为原版行为。
