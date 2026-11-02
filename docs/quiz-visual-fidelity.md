# 测验样式与操作核查

本轮同时审查 Solo 与 Article 两种阅读模式。测试记录见 `tests/quiz-visual-audit.json`、`tests/quiz-feedback-visual-audit.json`、`tests/quiz-pixel-report.json` 和 `tests/browser-audit-results.json`。开发中的热更新曾中断浏览器执行；被中断的记录不作为通过依据。独立快照的文件 SHA 与范围记于 `tests/quiz-visual-snapshot.json`，报告中的 `base` / `renderedSourceRoot` 用于区分实际测试版本。

## 原版取证范围

- Solo 原站实页：`https://edu.py2fun.com/learn#/course/015/page/937`，实际点击拖词并提交错误答案，截图 `output/quiz-visual/source-live-drag-wrong-desktop.png`。
- 六个 Solo 题型的完整状态：直接运行原公开 bundle 中 e6t / r6t / o6t / i6t / a6t / u6t。`scripts/prepare-solo-visual-reference.mjs` 仅替换末尾应用挂载并导出组件，保留原 React、组件实现与 CSS。状态夹具使用公开答案元数据，**不是原站登录用户的服务端判题**。
- Article：直接运行原公开 bundle 的 dc / rc / ac 测验实现及原 CSS、Swiper。其公开数据仅有单选和多选两类。原站课程 001/8 匿名实页受访问限制，因此 Article 的测验截图明确属于公开原组件隔离渲染，不宣称匿名实页已逐题访问。

## 状态覆盖

六类 Solo（单选、多选、单空输入、多空输入、拖词、排序）分别检查空白、选中/填写、错误、重试、正确五个状态；Article 单选、多选分别检查空白、选中、错误、正确四个状态。两个视口为 1280×900 与 390×844，共 76 个状态。输入、点击、拖拽、提交及重试均真实执行，错误/正确结果、Article 提交后锁定及每个选项的解析/图标均有断言。

原组件与本地使用相同浏览器、视口、语言及题目。随机选项顺序在截图前对齐；重试先验证答案清空，再仅同步随机顺序。截图前将双方窗口回到相同滚动原点，避免真实点击自动横向滚动造成裁片错位。完整尺寸图片保留在 `output/quiz-visual/`；像素报告同时记录严格 RGB 差异和最大通道差超过 16 的像素，没有对图片做重采样、遮罩或事后对齐。拼图仅用于人工审阅，不用于计算。

实际本地 App 路由额外验证答对/答错反馈条，桌面和手机共 4 状态，并断言组件内部的重复提交/状态行保持隐藏。原版反馈条位置和尺寸为 637×72，手机保留原版超出视口的布局。手机 AI 助手遮挡提交按钮中心的现象已由 reader-shell 核查确认原站相同，操作测试点击未遮挡的左侧区域，不使用 force。

## 已修正内容

- Solo 选项边框、选中/正确/错误颜色、底部阴影、18px 字体与选项间距；多选复选框及正确/错误标记。
- 排序项高度及右侧三条独立手柄；拖词词库的三列宽度、间距、阴影与等宽字。
- 填空控件的 36px 高度、80px 最小宽度、16px Arial 字体、焦点和答后颜色；多空题实际输入数与键盘/词库填入行为。
- 原公开 Solo 完整 Prism token 主题，以及 Article 答前 16px / 答后 18px 代码块的继承字号和 em 间距。补齐原版 JS 扩展、JSON 及 golang 别名，并恢复 HTML 标签、普通属性和事件属性内嵌代码的原色。
- Article 原逐题布局、选项选中外框、提交后逐项解析及完整 SVG 图标；原提交锁定行为与题目导航。手机保留原 intrinsic min-width；恢复 Swiper slide 的定位层叠，避免上一题长代码盖住当前题。答后列表按 18px 字号继承行高，选项字母使用原 div 结构，并输出单个 `B)` 字符串，消除拆成两个文本节点产生的字距差。
- 固定反馈条的颜色、图标、位置和文字，并修正答后内部按钮特异性导致的重复状态区域。

## 原站本身的边界

52 个 Article 测验组共 231 题，其中 46 组标题为空。空标题仍保留原卡片标题区域。原 dc 的 Swiper 明确 `allowTouchMove:false`，且导航只在 `total > 2` 时显示；但独立 radio 输入仍可 Tab 聚焦，浏览器会横向滚动到隐藏题目。因此课程 010/413 的第 179 题**可以通过键盘到达**。早先“不可达”的推断已在历史报告追加 correction，原独立视觉夹具记录保留，不伪称其是键盘路径证据。

新增 `tests/article-quiz-keyboard-audit.json` 真实执行两题的 Tab、Space、Enter：桌面/手机、原版/本地、正确/错误共 8 场景、16 次提交均通过。本地移除了额外的 inert、aria-hidden 和 radio name 分组，并对齐透明 radio 命中区。`tests/browser-audit.mjs` 后续采用真实键盘路径，单页复核 `tests/browser-audit-keyboard-regression.json` 两题正负例均通过。

此检查不能证明原站未公开的登录/支付、钻石答案解锁、远端 AI 或私有判题服务等价，也不把有限题型截图扩大为所有课程页面逐像素相同的结论。

## 全量题组与资源加载条件

`tests/article-quiz-full-visual.mjs` 逐一渲染 52 个完整 Article 题组、231 道题，在桌面和手机分别检查空白及正确提交，共 924 个状态；每题均实际点击选项、提交，并验证所有选项提示与锁定状态。普通题通过原版箭头导航访问；第 179 题的独立视觉夹具明确标识，其真实键盘路径由单独报告验证。

每次比较等待字体与图片完成，拒绝失效字体或 0 宽图片，并记录 HTTP 资源错误；截图使用完整卡片高度，同时断言 PNG 尺寸覆盖元素高度。参考字体保存在 `output/reference-fonts`，实际副本 SHA 列于快照清单。早期缺参考字体及隐藏图片未加载的截图只用于排查，不作为最终像素一致证据。Article Markdown 图片改为原版的 eager 行为，避免隐藏题目中的图片尚未加载时将整个题组高度缩短。

语言专项见 `tests/quiz-language-audit.json`：11 组大小写、别名和 HTML 诊断夹具均逐可见字符验证颜色、字重、字形样式。空白文本本身严格比较；不产生字形的空白前景颜色差单独记录，不冒充可见差异。

全量功能报告 `tests/browser-audit-results.json` 在独立冻结版本中真实执行 1190 个课程页、479 个挑战入口，1625 个正确答案、1622 个错误答案全部通过；另访问 964 个动画帧、221 个代码标签页、28 个网页标签页、233 个折叠项，页面脚本与渲染错误为零。5 个空组件来自原数据，3 道所有选项均正确的多选题没有可构造的错误选项。该报告保留其实际 Content 哈希；之后的 ArticleAnimation 分支、图片加载及视觉修正由各自专项报告覆盖，不篡改历史哈希为最新源码。

最终本地重放 `tests/article-quiz-local-visual.mjs` 使用同一批未修改的原版截图，并对 924 个本地状态重新执行导航、点击与提交。报告记录原截图聚合 SHA、原采集时间、本地重放时间及每张本地截图时间，完成后再次校验原图未改变，不把复用参考图描述成重新抓取原站。

## 最终结果与保留残差

- 全量 Article：104 个视口题组、924 个状态操作与资源检查均通过；最终本地重放 924/924，原参考截图聚合 SHA 未变化。924 张图片尺寸全部相同，141 张严格 RGB 相同，825 张没有超过 16 通道差的像素。
- 默认浏览器环境仍保留 1 张明显字体残差：002-34 / 第 18 题 / 桌面空白，4272 像素（0.559045%）。实际平台字体为原版 Menlo、本地 Courier；原版单独按另一导航顺序也可显示 Courier。原公开 HTML、CSS 均未声明或加载 Roboto Mono，双方 computed CSS 都是 `"Roboto Mono", monospace`，不是遗漏下载字体。证据：`tests/quiz-font-source-resources.json`、`tests/quiz-font-fallback-probe.json`、`tests/article-quiz-font-repeat1.json`。
- 环境标准化的另一次 16 状态对照，在页面导航后通过 CDP 将双方 Zyyy/Latn/Hans/Hant 的默认 fixed 字体设为 Menlo，未更改产品 CSS。该题的 4272 像素差降为 0；整组最大剩 8 个边缘像素。记录 `tests/article-quiz-font-controlled.json`，不用于覆盖或改写默认环境的 924 状态结果。
- 其余 98 个默认环境残差状态，最大超过 16 通道差比例为 0.004240%。`tests/article-quiz-residual-audit.json` 重建完整题组并逐点核对，所有差异点均位于答题图标或题目导航控件范围内；保留原像素，不做遮罩。
- 六类题型 76 状态尺寸全部相同，43 严格 RGB 相同、74 无超过 16 的像素差；余两状态为 4 / 10 个 SVG 边缘像素。实际 App 正确/错误反馈条另 4 状态严格 RGB 相同。

因此这些证据支持已列范围的内容、布局和交互复现，**不宣称默认环境的每一像素绝对相同**。
