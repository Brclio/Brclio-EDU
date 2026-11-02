# 图片组件与预览复核（2026-11-02）

使用原站公开 bundle 中 Article `Nc` / Ant Image 与 Solo `H5t` 的原始组件和 CSS，与本地真实 `Content` 图片分支分别渲染对照。所有图像均从本地已导入资源加载。

## 全量图片尺寸

`node tests/image-inventory-visual-audit.mjs` 从 `scripts/course-visual-inventory.mjs` 的实际课程类型和嵌套组件递归清单取得 786 个 Image：57 个 Article、729 个 Solo。

两侧全部 786 个图像均加载成功；naturalWidth / naturalHeight、最终宽高和边框全部一致，最大宽高差为 0px。全部实际 Image 均具有非零 metadata.width，无缺少宽度元数据的真实条目。Article 内容宽 960px、Solo 内容宽 638px，视口 1280 × 900。

扫描修复了 97 个 Solo 小图片错误维持原始宽度的问题：原站 H5t 在首次渲染时，只要提供 width 就使用 100% 容器宽，而不是直接使用给定像素值。另修复 20 个 Article 图片被旧通用图片 CSS 的 width:auto 覆盖，造成约 0.03–0.1px 缩小的问题。规则限定到 Image 和 ArticlePreviewImage，不改变 CanvasAnimation、SVG 或其他图示类型。

结果：`output/image-inventory-review/audit.json`。这是组件层全量加载和尺寸扫描，不是 786 个图片在每种真实页面上下文及所有屏幕尺寸下的像素截图证明。

## Article 图片预览

`ArticlePreviewImage` 提供原图宽度、边框、hover 黑色遮罩、原 eye SVG 和 Preview 文字；点击后使用原站样式的图片预览。工具栏按原版仅有关闭、放大、缩小、顺时针旋转、逆时针旋转五项；原站该版本没有翻转按钮，不添加不同的工具。

实现源组件的整数倍率（最小 1）、90° 旋转、滚轮缩放、双击恢复倍率和位置并保留旋转角度、拖动边界回弹、背景点击 / 关闭 / Esc、重开归零。进入为原版 .3s zoom，遮罩和退出为 .2s；保留 .3s 图片变换过渡。补充键盘触发、焦点返回与模态焦点循环。

`node tests/image-preview-audit.mjs` 使用真实浏览器鼠标和键盘，共 18 项操作断言全部通过。7 对截图（缩略图默认、hover、完整预览初始、工具栏禁用态、2 倍、旋转、超尺寸拖动边界）全部尺寸一致，RGB 最大通道差超过 8 的像素均为 0。

证据：`output/image-preview-review/index.html`、`output/image-preview-review/audit.json` 及同目录原版/本地 PNG。原版是从公开 bundle 原封不动提取组件后使用相同资源和数据渲染，不是手写参考实现。测试生成参考 HTML 会触发 Vite 刷新，必须顺序运行两个审计脚本。

`npx tsc -b` 通过。未部署，未提交。

## Markdown 内图片的点击行为

另用 `tests/article-markdown-image-click-audit.mjs` 实际点击 Markdown 图片语法与原始 HTML `<img>`，原站发布 Markdown renderer 对两种图片都设置 `preview: false`（`data/source/article-visual/main.js` 的 `img` 分支），单击均不打开预览。本地保持相同行为；独立 `Image` 组件作为正向对照，原版和本地均可以打开、通过关闭按钮退出预览。六项检查通过，数据为 `tests/article-markdown-image-click-audit.json`。此前18项预览操作覆盖独立 Image 组件，不据此声称 Markdown 内图也应弹出预览。
