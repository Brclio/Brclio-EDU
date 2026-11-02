# 原站实际交互对照（2026-11-02）

本轮使用独立浏览器会话操作原站公开页面，并对照公开 JS 组件实现。未登录，也未绕过原站登录或课程锁。本站按需求允许匿名学习；以下结果不代表逐像素、AI 服务或原站隐藏判题的完全等价。

## 已确认并修复

| 组件 | 原站证据 | 本站调整 |
| --- | --- | --- |
| Solo 代码 | 015/937 实际点击“尝试一下”，全屏 60px 顶栏，左右各半的暗色编辑/输出区；关闭返回正文 | 原文只读展示，单独全屏练习窗；编辑与运行记录保留，支持关闭/Esc、重开、标准输入 |
| Solo 网页代码 | 022/1177 实际打开练习窗，HTML/CSS/JS/结果四列；初始结果空白，点击运行才创建 iframe | 三个独立编辑器与结果列；显式运行/重跑，编辑本身不重置当前预览，关闭清理预览 |
| 拖词填空 | 015/937 点击 print 后词库隐藏 print；换入 write 后 print 回词库。公开 `Upt` 实现按焦点空格填写并聚焦下一空 | 跟随焦点、隐藏已用词、替换后归还、聚焦下一空；题目原始文字/答案不变 |
| 多选 | 公开 `Xm` 按已选数量与答案数量决定提交禁用 | 数量不符不允许提交；错误集合仍不能通过 |
| 排序 | 公开 `Zk` 随机排列，并排除直接等于答案的初始顺序 | 初始化和重试随机，避免固定反序碰巧成为正确答案；验证损坏的已存顺序 |
| 动画 | 004/117 点击画面仍为 1/5，点击右箭头变 2/5；公开 `Hc` 仅上一帧/下一帧/重置，单帧不显示控制条 | 移除画面点击推进，保留全部帧与按钮，单帧隐藏控制条 |
| 作者提示 | 公开文章 `Ht` / hints 组件有提示按钮、左右翻页与关闭；数据 001/4、001/5、001/7 共七条提示 | 补齐原先未呈现的提示，按 `show_solution:false` 隐藏参考答案入口 |
| Article 代码 | 004/117 实测 Monokai 背景 #272822、16px monospace、25.144px 行高；无文件顶栏；运行/重置各 88×32 | 暗色语法、编辑器自然高度、直接底栏按钮；无需 stdin 的代码不显示输入栏 |
| Article 重置 | 004/117 实际运行输出后点击重置，旧控制台仍保留 | 重置保留上次 stdout、图像和文件输出，终止进行中的 Worker，并清理旧判题状态；Solo 重置保持原行为 |
| 教学 HTML 链接 | 数据归档说明与本地实际点击 | `/content/fixtures/` 的教学链接新标签打开，保留 `noopener noreferrer` 与原显示文字 |

原站第一段文章代码的编辑器/总高度为 159/214px；本站为 158.84375/213.84375px，差值是当前编辑器行高的像素舍入。按钮尺寸和左右位置匹配。本站使用 CodeMirror 6，原站文章使用 CodeMirror 5、Solo 使用 Monaco；没有宣称编辑器内部所有样式和快捷键已逐项等价。

截图证据保存在 `output/component-audit/`：`original-solo-code-expanded.png`、`original-drag-filled.png`、`original-web-workspace.png`、`original-animation-button-step2.png`、`original-article-code.png`。动画画面点击不推进的证据已纠正早先“点击画面前进”的判断。

公开实现分别为缓存的 `data/source/index-c6fcd669.js`（Solo）与 `output/component-audit/original-main.js`（文章）。静态实现佐证与真实浏览器操作明确区分；排序、数量门槛、作者提示的完整原站 UI 没有全部绕过登录去验证。

## 浏览器与回归结果

`tests/source-interaction-regression.mjs` 的六组实际组件流程全部通过：

- 只读原文、打开练习窗、修改代码、真实 Python 执行、标准输入弹层、关闭重开后编辑保留。
- 词库按焦点填入、已用词消失、替换归还、焦点自动前移。
- 多选数量禁用、错误答案停留、提交后锁输入、重试清空。
- 动画画面点击不前进、按钮前进与重置。
- 三条原提示逐页查看、最后一条禁用下一步、关闭且不修改代码。
- 网页三编辑器、运行前空白、显式运行、修改后重新运行更新结果。

`tests/browser-audit.mjs` 重跑全部 1,190 课节与 479 挑战：1,625 个正确答案全部通过，1,622 个可构造的错误答案全部拒绝。另三题的全部选项都正确，而原站要求选中数量一致，少选会禁用提交，不能据此伪造三个可提交错答。零渲染错误、零内容缺失占位；检查 1,142 个语言标签、636 个网页标签、964 帧和 4,580 个展开控件。五个原始空 Markdown 块保持记录。

两个教材 JS 错误单独保留：022/1178 使用未定义的 X；022/1226 演示给 const 重新赋值。全量 Content harness 会加载文章式网页预览；实际 Solo 网页仍需点击“运行”才执行。这两项未包装为运行成功。

`tests/app-solo-audit.mjs` 使用实际 App 路由，全部通过：12 条桌面/手机完整流程、28 门课程导航、204 个 QuestionRef 门槛，共 1,132 个断言。覆盖未答阻止继续、错答停留、重试、真实词库点击与排序拖动、正确答案解锁、完成记录和刷新保留。审计运行期间所跟踪源码 hash 未变。

本地模型/网页转换测试 9 项通过。完整证据为 `tests/source-interaction-regression.json`、`tests/browser-audit-results.json`、`tests/app-solo-audit.json`。

```sh
npm run dev -- --port 5173
node tests/source-interaction-regression.mjs
node tests/article-reset-regression.mjs
node --import tsx --test tests/content-quiz.test.ts tests/content-web.test.ts
node tests/browser-audit.mjs --base=http://127.0.0.1:5173 --parallel=4
node tests/app-solo-audit.mjs
```

## 明确保留的差异

原站正确提交可能弹出微信登录；本站保持匿名公开访问。AI 答疑等依赖原站账户与后端的功能未伪造为已接入。本站运行器有输出、时间和资源限制，并保留停止运行、学习记录和附加文件编辑能力。本轮未宣称这些行为完全一致。

文章重置的已知输出差异已消除。此后只重跑受影响的真实浏览器回归，结果保存在 `tests/article-reset-regression.json`；未重复执行全 1,190 课节审计。编辑器使用的 `@codemirror/language` 6.13.1 与 `@lezer/highlight` 1.2.5 已按既有 lock 版本声明为直接依赖，未升级任何依赖版本。
