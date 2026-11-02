# 编辑器与挑战：实际像素核查（2026-11-02）

本轮针对上一轮“矩形相同但视觉不同”的问题重新取证。**没有使用编辑器引擎相同、矩形相同或全量内容测试通过来代替视觉验收。**

## 可复查证据

- `output/editor-visual/index.html`：原站 / 本地并排图与原图、差分图链接。
- `output/editor-visual/*-source.png` / `*-local.png`：同一 Chromium、配对相同视口、DPR 1 的真实截图（多数为 1280 × 900，完成页另含 390 × 844）。无遮罩，无隐藏差异像素。
- `output/editor-visual/pixel-report.json`：完整裁剪区域的 RGB 平均绝对差及最大通道差超过 20 的像素占比。尺寸不一致时明确不计算差分，不缩放来制造通过。
- `tests/editor-visual-audit.mjs`、`tests/editor-state-visual-audit.mjs`：真实点击、代码编辑和运行复现；等待 Monaco 语言 tokenizer 就绪，避免把加载过程当作最终语法色。
- `tests/editor-visual-report.py`：生成对照图和差分，需 Pillow。像素数字是定位差异的辅助，不等同整站“完全一致”结论。

## 本轮实际修正

1. 文章 CM5 行号与代码整体向左偏 8px：原版 CodeMirror 使用 content-box，本地通用 border-box 规则侵入了行号。恢复原 box sizing、`#d0d0d0` 行号色、`#3b82f6` 运行按钮和原阴影。
2. TabbedCode 原版为带语言 SVG 的卡片页签，本地是无图标的细字下划线页签。已导入原文章 JS module 389 的 19 个语言 SVG，恢复 16px / 600、边框、内距、激活色、页签高度及底部动作行。文件清单和 SHA-256 在 `public/content/site-ui/languages/provenance.json`。
3. 全屏 portal 未继承 `-webkit-font-smoothing: antialiased`，字体明显较粗；原版普通按钮实际为 Arial，而本地继承 system-ui。均按实际 computed style 修正。
4. 关闭图标原版是 24px 容器内的 12px SVG，本地曾用放大的 ×；已换原路径和尺寸。运行图标换原 SVG / 空白字符。补 Web 全屏“尝试一下”标题、精确白色分隔线及 flex 列宽、语言标签色。
5. 标准输入弹层从本地 560px / 深遮罩 / 大标题改为原版 400 × 258、浅遮罩、100px 文本框和居中 167 × 48 按钮。真实 input() 运行保持可用。
6. 挑战的 inline code 字体、字号、颜色、底色、左右间距、提示 SVG、按钮字体、答案抽屉箭头和 400ms 开合动画按原版修正。
7. Solo 代码卡与运行结果的绿色 AI 答疑入口、60px 浮动 Ai 图标已恢复。编辑器、挑战和全站入口共用三页签学习助手；不是模拟原站登录或模型响应。
8. 原 Web 工作区有 Console 开关及 160px 控制台，本地之前缺失。现已接收当前沙箱 iframe 的真实 log / info / warn / error / 未捕获错误消息，保留原开合、清空重跑、颜色与图标。默认文章网页示例仍用原本运行路径。消息仅接受当前 iframe 和其专属通道，不能由无关 frame 填入日志。

## 真实视觉覆盖

| 原站页面 | 核查状态 |
|---|---|
| Solo 015/937 | 只读代码卡、全屏初始、头栏、真实 Python 输出、编辑为 `print(input())` 后输入弹层 |
| Article 004/117 | 第一段 CM5 代码与运行 / 重置动作行 |
| Article 010/406 | TabbedCode 第一与第二页签（实际点击切换） |
| Solo 022/1177 | HTML/CSS/JS 全屏初始、真实网页运行结果、Console 打开、实际 log/warn/error |
| Solo 023/catalog → challenge 500 | 初始题面与代码、答案抽屉、退出确认；运行尝试触发原站微信登录 |
| Solo 015/937 → AI 答疑 | 原站入口 / 三页签外壳；点击后的微信登录阻挡证据 |
| Article 005/260 | 原站仍要求解锁，保留访问截图，不计作导图视觉通过 |

## 实际验证及边界

- `tests/editor-help-audit.json`：四组真实操作通过。代码卡、全屏编辑器、文章入口、目录挑战共用侧栏；课节与挑战的 `progress.lessons[course:lesson].answers.__notes` 保留、刷新恢复、彼此隔离；零外部请求。
- `tests/source-editor-fidelity.json`：五组通过，包含精确版本/资源校验、原生撤销重做/查找、720px 长代码滚动、真实同源语言 worker。
- `tests/challenge-dialog-audit.json`：七组通过，含真实 Python 错误/正确提交、历史记录，以及通过后编辑/重置撤销当前成功但保留历史完成。
- `tests/article-reset-regression.json`：三组通过，真实 stdout 保留、运行中停止重置、判题状态清除。
- `tests/source-interaction-regression.mjs` 的 Solo 拖词/多选两个 fixture 现显式用 Solo 模式渲染；以前默认 article 的模式错误不能解释为产品交互通过。

仍有明确未完成的原版能力或未覆盖状态，不能宣称全站视觉/操作完全一致：

- AI 与人工助教需要原站账号和服务。本地面板明确显示未配置，无法产生模型/人工答复；不会伪造剩余次数或扫码登录。
- 本地笔记继续使用已有可保存文本编辑器；原站登录后的富文本笔记完整 UI 尚未取得同状态对照，不能算其富文本编辑器一致。
- 原站挑战运行需微信登录，运行后的成功/错误卡片与提交记录没有同状态可见截图。本地判题功能已实测，仍不能据此声称这些状态视觉相同。
- 原站唯一课程导图 005/260 受解锁限制，`mindmap-source-access.png` 是限制证据；本地仍保留可折叠/拖动/缩放的 Markmap，未宣称视觉已对齐。
- 本轮是上表状态的抽样视觉核查，不是 1190 个页面和 479 个挑战所有交互状态的逐屏像素核查。既有全量内容/操作报告与本轮截图证据各自保持范围。

## 新增：全库配置分型核查

用户要求重新核查全部配置后，补做 `tests/editor-flags-inventory.json` 全库扫描：2588 个 Code、141 个 TabbedCode（221 个子编辑器）、211 个 JsHtml、7 个 RunJS。代码编辑器共 2809 个；Code 的 103 种和 TabbedCode 子项的 46 种观测配置组合，共 149 种，均在原文章组件与本地真实渲染后比较按钮文本、只读配置和高亮。不是根据本地实现反推预期。结果见 `output/editor-visual/flags-report.json`；九组特殊状态截图包括多文件切换、提示两页、答案卡片。

这次补查发现并修正了此前未覆盖的问题：

- 422 个 `short_content` 应用于 Solo 只读预览卡；全屏仍使用完整 `content`。此前始终显示完整代码。
- 195 个 `high_lighted_lines`（含 30 个 TabbedCode 子项）恢复 CM5 原 `markText`，包括 1000ms 延迟、零基行号及原数据末尾空白转为第 0 行的行为。
- 文章文件列表恢复 180px 左侧菜单；50 个附加文件的 `hidden` 和 `read_only` 均为 false，没有未验证的真隐藏文件分支。保留实际内容和文件切换。
- 文章 `runnable` / `judge` 优先级与原站一致：pure 隐藏操作行，runnable 显示运行代码，judge 显示提交代码。109 个 `show_solution` 使用原“查看答案 / 隐藏答案”按钮和参考答案卡片；3 组 `judge_hints` 恢复原带页码、关闭和左右切换的提示卡片。
- 原站文章标题/下载旗标没有独立可见工具栏，本地额外工具栏已移除；caption 恢复原绝对定位及容器裁剪规则。3 个只读主编辑器保留原只读行为。
- 59 个不可运行 JsHtml 卡片统一按 `language` 选择对应 HTML 或 JS 代码，修正此前混合代码时取错字段。全部 211 个 `show_output` 都为 false；原站该字段未影响此组件初始渲染。
- JsHtml 原版卡片没有 AI 答疑按钮，现与普通 Code 区分；不再添加原版没有的按钮。7 个 Solo 长行/短预览/标题/JS/HTML/可运行/不可运行状态通过原组件直接对照，见 `output/editor-visual/solo-flags-report.json`。

原文章源码证据：`output/component-audit/original-main.js` 中 `Ht` 为 Code，`dt` 为提示、`ht` 为参考答案；完整原组件/CSS抽取在 `output/article-reference/`。Solo 原 `dge` / `G5t` 的独立导出副本在 `output/editor-visual/solo-reference.js`，仅替换入口启动代码，渲染函数和 CSS 未改。隔离组件对照与上方真实站点导航截图分开记录，不声称隔离测试覆盖了原站后端。

最新验证同时包括：真实网页示例执行 90 例、31 个交互断言通过（`tests/runtime-web-audit.json`；唯一原题大小写 ReferenceError 保留分类，0 非预期错误、0 失效图片、0 外部请求）；文章重置 3 组、共享笔记 4 组再次通过。文章重置的完成等待已改为运行按钮恢复，因为原站操作行没有额外“运行结束”文字。

最后收尾已解决此前自制 HTML dialog 差异：产品网页入口现在通过严格校验来源/通道的顶层桥接显示真实浏览器原生 alert/prompt/confirm，iframe 仍为 opaque origin，仅允许 scripts/forms。22 个原课程弹框、4 组返回值/执行顺序/隔离检查、5 组 App/编辑/提交/重复运行检查与最终 90 网页 /31 结果断言全部通过，报告绑定 5 个当前模块的实际 SHA。原源码保持不变，只有执行副本经 AST 转换；任意 JavaScript 的同步语义等价并未承诺，构造器/访问器等限制及真实测试范围详见 `docs/native-web-dialog-fidelity.md`。这项操作证据不冒充 Console 截图的逐像素覆盖。

目前图库含 35 对同环境、同裁剪尺寸截图。两组 Web Console（空面板、真实 log/warn/error）完整区域 RGB 差为 0；运行窗头部、输入弹层、退出确认、Help 头部均没有最大通道差超过 20 的像素。其他状态仍记录非零残差，例如 TabbedCode 两页约 0.16% / 0.17% 的像素超过该阈值。原短代码卡约 0.63% 的残差随后定位为标签行高与按钮字体，已修正为完整 RGB 差 0。Help 正文因明确的本地服务说明与原站账号服务不同，不计作视觉一致。没有用阈值把这些差异宣称成“完全相同”。

本轮运行收尾使用静态构建 `http://127.0.0.1:4173`，避免开发服务器在写入截图 HTML 时刷新页面；没有发布新版本。历史命名的 `tests/production-runtime-audit.json` 本轮实际 base 为该本地构建：7 种语言、Python 多进程、5 帧 SVG/重播、数学和导图节点共 11 组通过。Swift 首次遇到上游 502，有限重试后真实输出 `6`，原始失败保存在 `previousAttempts`，不是删除失败或替换假响应。`tests/production-judge-audit.json` 的 C++ 正确 4/4、错误 0/4、Java 正确 4/4 均通过。运行与提交按钮、CM5编辑和动画 SVG 的审计脚本已适配原版结构。

新增长行实例 `024/1325`（`6bf2dad0-24aa-38f6-87e3-3825d60e4418`）揭示横向滚动条会让本地卡片多 12px：原 `dge` 预览高度是行数 × 24，而非 Monaco `getContentHeight()`。已改为原行数规则，同一原组件/本地真实截图高度均为 504px；没有靠裁图掩盖多出的滚动条高度。`solo-flags-report.json` 当前 7 例全部通过。

完成页追加后图库共 35 对。`docs/solo-completion-fidelity.md` 单独记录真实原站 / 本地 1280×900、390×844 完成页全屏 RGB 差为 0，以及最后一步、刷新、回目录、实际备份导出导入和 Worker 进度校验。`tests/app-interaction-audit.json` 的六组流程已按原 TOC anchor、手机隐藏侧栏和 500ms 动画重新真实执行通过。2026-11-02T10:08 后重拍的九个编辑器特殊状态在最新 SourceMarkdown 下仍保存原始残差，没有将非零值改写成完全一致。

最后一轮进一步把 Solo 复制、AI答疑、语言徽章的文字行高从 22px 改回原 normal（胶囊外框仍 22px），并以足够的选择器优先级恢复“尝试一下”的 Arial 与原生按钮内距。7 个原组件卡片状态、真实 015/937 代码卡和真实 Python 运行输出均达到完整 RGB 差 0。检查还发现 HTML 内嵌 CSS 语法模式由原站延迟加载，单等 1 秒仍可能拍到未完成着色；Solo harness 现在等待两边实际 token 文本/样式相等，并等待滚动条结束瞬态，不篡改 token 或截图像素。

最终主截图重拍的 `output/editor-visual/report.json` 真实记录为 4 对完成后，原站文章 `.CodeMirror` 等待超时；没有将其改写为本轮 11 对全部成功。图库的 35 对 PNG 包含此前已完成的对应状态，不能据此称全部在最新源码上重拍。Web 标题行高已按实际原 computed style 修正为 24px；这项最后改动尚未在完整主截图重拍流程取证，原有非零残差继续保留。

## 最后 Web 标题的独立补验（11:01 UTC）

为避免把原站文章 CM5 加载失败扩展为 Web 头部无法验证，新增 `tests/web-header-final-audit.mjs` / `.json`，只读取既有原站 `web-workspace-source.png` 的头部，不改原素材或旧主报告。原素材文件时间为 **2026-11-02 10:22:59.040 UTC**（文件 mtime，PNG 未嵌入采集时间），SHA-256 为 `b0fa707718c3f69abe6fce954f5863ab4b1f25335acf722b3c2516f24a2478d9`。本地于 **11:01:14–11:01:26 UTC** 在相同 1280×900 / DPR 1 真实打开 022/1177 运行窗，记录当前源码哈希和 computed style。

当前标题元素位于 x=49、y=17，高 24px；包含完整标题及四周空白的 110×34 裁片 **所有 RGB 像素相同**。完整 1280×60 头部仍有 **26 个非零像素**，全部位于关闭 X 的 x=26–37、y=24–34，最大通道差 20（其中 2 像素超过 8），标题和运行按钮不在差异区。保留这项既有 SVG 抗锯齿残差，不宣称整个头部 RGB 绝对相同；本次未修改任何业务源码。

独立对照图：`output/editor-web-header-final/header-compare.png`、`title-compare.png` 及各自 source/local/diff；说明索引在该目录 `index.html`。旧主流程的 4 对完成后超时报告、既有 35 对原图及历史未完成重拍记录均保持，不以这次局部补验替换成一次全流程成功。
