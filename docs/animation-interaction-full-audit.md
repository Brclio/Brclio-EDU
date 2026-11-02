# 全量动画真实交互核查

`tests/animation-interaction-full-audit.json` 为 2026-11-02 最新本地开发服务 `http://127.0.0.1:5173` 的执行结果。覆盖导入课程中的全部 163 个 CanvasAnimation、964 帧，三路独立浏览器上下文真实点击。

每帧必须同时满足当前 `.is-current` SVG 与动画计数稳定后才能进入下一帧；没有在原版 500ms `afterChange` 更新前连续点击来跳过真实状态。逐帧比较浏览器标准化后的原归档 SVG 和实际 inline SVG，并分别记录 SHA-256。结果为 964/964 相等，0 操作错误，0 外部请求。

多帧动画额外核查上一帧、末帧下一步禁用、重播到第一帧、第一帧上一步禁用；点击画面不推进。单帧组件核查操作栏不可见且两方向处于边界状态。静态截图差分和原站即时/延迟切换的专项是另一个证据层；本报告不声称对原网站全部 964 个动态状态逐一截图比对。

执行期间真实文件快照显示：

- `Content.tsx`（含 CanvasAnimation 模式分派）、`ArticleAnimation.tsx`、`CourseSvg.tsx`、`SourceIcon.tsx`、`article.css`、`article-fidelity.css`、`content.css`、`styles.css` 均未改变。
- `content-workspace.css`、`quiz.css`、`solo-fidelity.css` 有其他组件的同期调整。报告保留全部 `sourceFilesBefore`、`sourceFilesAfter`、`changedFiles`，并保留 `sourceUnchanged: false`；没有将全源码变动改写成无变动。
- 旧执行模块最初按全 src 差异返回退出码 1。`tests/animation-audit-stability.mjs` 根据这次已捕获的前后快照追加实际相关范围结论 `animationSourcesUnchanged: true`，并保留原始计数、帧 SHA、时间和全源码差异。后续执行脚本使用同一相关范围判定，避免将非动画 CSS 的变化误报为动画功能变化。

本次 964 帧执行后，原版 controls 的计数字体/包裹元素又作了窄范围视觉校正；最终该条控件的初始、中间、末尾、hover 等 10 状态由根任务的独立原站/本地裁片审计验证。这里不把那次后续字形变动说成本次逐帧执行时已经存在，也不为不改变帧与计数行为的字形校正重复 964 次执行。
