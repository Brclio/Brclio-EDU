# 字体和段落间距复核

2026-11-02，在同一个 Playwright Chromium 实例分别打开原站与本地，等待正文、字体和图片完成加载，再读取 DOM 尺寸、computed styles 及 CDP `CSS.getPlatformFontsForNode`。本报告只解释并验证指定的排版偏差，不代表全站像素一致。

## Solo 015/936

原站标题行盒高 28px，本地曾为 33px；CSS 都是 24px、700、`line-height:normal`。原站 HTML `lang=en`，本地曾为 `zh-CN`，触发不同的 macOS 中文后备字体：原站 `.PingFangUIDisplaySC-Bold`，本地 `PingFangSC-Semibold`。分别试改 font-family 和 font-synthesis 均不能消除 5px；把语言标记与原站对齐后，高度自然变为 28px。最终修改 `index.html` 的语言标记，不硬设标题高度或行高。

Note 的旧偏移 -14px 由三项相加：标题 +5px、旧 `p:first-child` 将原站 16px 上外边距清零、块级图片丢失原站行内图片的 3px 基线间隙。恢复 solo 段落首尾 16px 外边距及图片 `display:inline` 后，1440 和 1280 视口的标题、图片、Note 和进度条所有测量矩形均完全相同。Note 两边 y=619.46875、height=96。

## Article 004/117

原本第一代码框 y 偏移 +42.546875px，由以下两组构成：

- `lang` 导致中文粗体宽度不同，例如“栈顶”原站 30.6875px、本地 32.953125px，使介绍 push 的段落多换一行，增加 32px。源码文本和 inline code `push` 本身宽度相同。
- 三个三级标题各多 3.515625px，总计 10.546875px。本地字号 24px、上下外边距 28.8/12px，源站对应 23px、27.6/11.5px；此外通用 code 的固定 `line-height:32px` 把标题撑至 34px。只改字号和外边距仍余 5.4375px。让所有 h1–h6 中的 code 继承标题行高比例后，code 行高为 27.37px、标题高 32.1875px，与源站一致。

最终只用通用选择器修 `h3` 和标题内 code，没有特定课程 ID 或段落位置规则。1440、1280、390 三个视口的标题、目录、第一 Markdown、动画及第一代码框 x/y/width 全部相同；第一代码框 y 分别为 2587.578125、2587.578125、3364.71875。代码框高度仍有 -0.15625px 的编辑器小数布局差异，本次未修改代码组件。

## 保留的区别与证据

390px 视口中，原站 solo 仍使用 638px 宽度并溢出，本地保持已有 350px 响应式正文。这是已存在的布局差异，不能把手机版 solo 称为完全一致；本次没有改动该响应式决策。原站 title y=139.90625，本地 y=140；两边标题高度均为 28。

- `tests/fidelity-layout-audit.json`：修复后两页面、三视口的最终对照。
- `tests/fidelity-spacing-before.json`：修复前详细元素尺寸和实际字体。
- `tests/fidelity-font-audit.json`：依次调整字体声明、合成字体和语言标记的实际实验。
- `tests/fidelity-spacing-experiment.json`：段距和标题字号已修、标题 code 行高修复前的隔离语言实验。
- `tests/fidelity-spacing-audit.json`：最终实际字体完全一致及各标题 code 行高证据。

复现最终结果：启动本地 Vite 后运行 `node tests/fidelity-layout-audit.mjs` 和 `node tests/fidelity-spacing-audit.mjs`。截图位于 `output/fidelity/`。
