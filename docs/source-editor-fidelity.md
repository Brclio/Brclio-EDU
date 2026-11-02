# 原版编辑器本地化复核（2026-11-02）

此次以原站实际运行文件与编辑器实例为准，将统一的 CodeMirror 6 换成原版编辑器。品牌、免登录学习和本地运行器继续保留。

| 范围 | 原站现场证据 | 本地实现 |
| --- | --- | --- |
| 分步课程 | 实际 `vs/editor/editor.main.js` 文件头为 Monaco **0.34.0**；不能使用 loader 默认配置中另一个未实际加载的 0.43.0 | 精确锁定 `monaco-editor@0.34.0`；111 个 JS、Worker、CSS、字体资源全部同源 |
| 文章课程 | `004/117` 原站 `.CodeMirror.CodeMirror.constructor.version` 为 **5.65.3**，theme=monokai、mode=python、lineNumbers=true、styleSelectedText=true | 精确锁定 `codemirror@5.65.3` 并保留原配置；文章 Code 组件沿用原站固定 Python 高亮配置 |
| 只读例子 | Monaco 16px、关闭行号/折叠/minimap、只读、按行自然高度 | 使用原版 Monaco 配置，不能编辑正文；另开工作区编辑 |
| 工作区 | Monaco 原生输入、补全、查找、撤销、重做 | 同版原生编辑器；本地 Python/网页运行、输入、关闭重开保留编辑继续通过 |
| 长文章代码 | 原版 CodeMirror 自然高度不裁剪，外层 `max-height:720px; overflow:auto` | 对齐外层限制；004/117 第六块 737.078px 编辑器由 720px 视口滚动，含按钮总高775px |

原站实际主脚本：
`https://python2fun.oss-cn-beijing.aliyuncs.com/@quark-app/learn/vs/editor/editor.main.js`

现场下载与本地 npm 包内主脚本 SHA-256 相同：
`4d54c8adae6f8fba4d68d25fe0cc0c307afe30e7bb69ed37ede53a8653556085`。
其余本地111项文件的长度与SHA登记于 `public/runtime/monaco/manifest.json`。`scripts/import-editor-runtime.mjs` 从精确依赖包重建资源，不依赖 CDN。MIT许可随资源保留。

Solo 代码卡片也修正为原站同样的16px内边距、8px圆角深色整块；“尝试一下”48px按钮位于深色块内。原实现按钮处在黑块外、正文内边距多出26px，此次已修正。

## 新运行的验证

- `tests/source-editor-fidelity.mjs`：5组通过；核验111份资源校验和、原版配置、只读、真实粘贴/撤销/重做/查找、首段159px高度、长代码滚动、真实本地JS语言Worker语法诊断。HTML/CSS Worker和字体也真实加载；外部请求0、页面错误0。
- `tests/source-interaction-regression.mjs`：6组通过；包含真实 Python 执行、stdin、词库/多选、动画、提示、三编辑器网页重跑。
- `tests/article-reset-regression.mjs`：3组通过；真实输出保留、运行中终止、清除旧判题结果。
- `tests/browser-audit.mjs`：最新 `tests/browser-audit-results.json` 于 2026-11-02 09:54–10:00 UTC 在冻结服务 5175 重新挂载1190课节+479挑战，1625正例和1622可构造负例全部通过，零渲染错误/缺失占位；实际触发221次代码语言Tab、28次网页Tab、964次动画换帧、233次折叠操作。报告同时登记5个源空组件及1个原站流程不可达题目。所监控内容哈希在运行期间未变化；该测试覆盖真实 Content 渲染器，不声称逐课执行所有代码或逐像素相等。

这份全量功能报告对应 `/tmp/brclio-edu-functional-20261102` 冻结版本。冻结之后的动画外壳、图片 eager 加载和网页原生 dialog bridge 改动由动画交互、图片/正文视觉与 `tests/native-dialog-audit.mjs` 专项覆盖，不能将旧冻结版结果直接归为这些后续改动的验证。

五处源空 Markdown、两个原教材网页错误（未定义X、给const赋值）仍明确登记；没有把原教材异常包装成运行成功。

同版编辑器消除了此前编辑器引擎、快捷键和内部语法渲染的架构差异；专项实际验证范围如上，不代表已穷举所有浏览器与每个快捷键。输入焦点在 Monaco 查找框时 Escape 先关闭查找，不误关闭工作区；工作区关闭按钮仍可退出。学习记录、公开判题及运行器的环境范围仍按相应审计文档说明，不据此声称原站隐藏判题与AI服务等价。

```sh
node scripts/import-editor-runtime.mjs
node tests/source-editor-fidelity.mjs
node tests/source-interaction-regression.mjs
node tests/article-reset-regression.mjs
node tests/browser-audit.mjs --base=http://127.0.0.1:5173 --parallel=4
```
