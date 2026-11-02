# Reader shell 原站视觉与操作核查

2026-11-02，保留 Brclio 品牌与本地业务导航。本文范围是 Article 阅读器外壳和 Solo 顶栏/底栏，不把正文全量组件报告的结果重复计入。原页面分别为 `/course/004/page/117`、`/course/001/page/1`、`/learn#/course/015/page/936`；参考原组件来自已保存的公开发布包。

## 已修复

- Article 侧栏默认展开，菜单状态跨刷新保存；原站在宽度 ≤414 时即使展开仍隐藏侧栏，本地保持相同规则。415–768 保留原版 960px 正文最小宽度与横向溢出。
- 原版侧栏行字体/行高/基线、4px 标题底距、图标颜色、当前页 rocket 优先级、完成 check 双层 SVG、分隔线、返回按钮 shadow/hover、章节箭头。`__default` 平铺目录也实页复核。
- 课程进度按原版向下取整；4/88 显示 4%，不再显示 5%。
- TOC 点击使标题到阅读区顶端（约 y=72），修改并保存锚点；手动滚动不会切换已点击的激活项。因本地使用 hash 路由，锚点表达为 `/anchor/<标题>`，支持刷新/浏览历史，不覆盖课程路由。
- 上下节按钮恢复 4px 圆角、原 shadow、默认/hover/active 蓝色；TOC 底边恢复原版两层圆角边框，消除角落残差。
- Article 完成控件恢复原 `fc` 行为：普通页默认勾选，取消后“下一节”不自动标完成；勾选/取消立即更新本地完成状态。末页仅显示完成勾选，无额外“完成课程→目录”按钮。当前页即使完成仍保留 rocket。
- Solo 顶栏退出图标使用原版两条独立 SVG path，字体颜色 `#6b7f99`。进度条恢复两层：紫色保留到达过的最远进度，白点可随返回移动；比例不再取整，最远进度保存到本地。
- Solo footer 字体恢复 Arial 16px，disabled opacity .6、原 hover 色。恢复原锁图标及获取答案入口。

## 本轮证据

22 组同浏览器 source/local 截图裁片均为 **RGB 任一通道差 >8 的像素数 0**。这是带抗锯齿容差的裁片比较，不等同于所有页面所有像素完全相等。实际查看过完整平铺侧栏、TOC、Solo 顶栏/底栏及完成控件图像。

| 范围 | 覆盖 | 结果文件 |
| --- | --- | --- |
| Article 004/117 | 返回默认/hover、标题、章节开/闭、当前/预览/锁定行默认/hover、TOC、上一节、下一节默认/hover，共15组 | `output/reader-shell-visual/article-states.json`、`article-index.html` |
| Article 001/1 | 300×828 完整平铺侧栏1组 | `output/reader-shell-visual/article-flat.json`、`article-flat-{source,local}.png` |
| Article 完成控件 | 未完成不勾、已完成勾选、普通页默认自动标记3组 | `output/reader-shell-visual/completion-states.json` |
| Solo 顶栏 | 返回后的完整1280×120顶栏1组 | `output/reader-shell-visual/solo-header.json` |
| Solo 底栏 | 1280×844、390×844 两种视口下完整底栏2组，含锁、disabled按钮、AI入口 | `output/reader-shell-visual/solo-footers.json` |

`tests/reader-shell-source-state.json`：原站与本地在390/414/415/640/700/768/1280共7宽度的侧栏、阅读区域、正文内容宽度、文档宽度共42项比较通过；两边实际点击侧栏菜单后持久化值一致，实际点击第二个TOC后目标顶部均为71.9375。

`tests/reader-shell-state-audit.json`：10组真实本地App操作通过，包括菜单刷新恢复、手机隐藏、多个章节展开、TOC锚点/刷新/滚动、TOC折叠、取消完成后next、next默认完成与prev返回、末页勾选/撤销、不跳转、floor进度、Solo返回与最远进度刷新恢复。`npx tsc --noEmit` 通过。

## 已确认的原站行为及本地边界

- **手机 AI 遮挡**：390×844 中，原站和本地提交按钮都在 x=223,y=760.5,w=167,h=48；中心点均命中右下AI入口，而非提交按钮。原站入口 fixed right/bottom=25px、60px 圆形，本地保持原样，没有擅自移动。按钮左侧仍可操作。
- Article 游客原站底部是“登录后 保存学习进度”，登录态才显示完成 checkbox。这里使用公开原 `fc` 组件、真实原CSS和明确的登录态 fixture 对照，未把原站访客页面称为已登录实测。本地已获用户要求免登录学习，完成操作接本地持久化，不调用原站账号服务。
- 原 Article next 会请求保存进度；原站游客实点117→118后可被401重定向到登录。本地保留课程页跳转和完成规则，并免登录保存。未执行原站购买、付费或账户写入。
- 原 Solo 获取答案先检查钻石余额；其解锁成功回调 `onFillAnswer` 读取 `quizAnswer` 并调用 `onSubmitAnswer`。本地弹层明确“本地课程可免费查看参考答案 / 查看后会填入参考答案并提交本题”，点击后填入已本地化的参考答案并走现有Quiz正常判题路径，不直接写 `correct=true`。不伪造余额，不扣费。
- 获取答案已验证单选真实015/936流程，另5种题型由独立agent真实App检查通过，见 `tests/answer-locker-app-audit.json`；checked/correct、题步、课程未完成状态、笔记、刷新恢复均验证。
- 本报告没有声称覆核全部28课程的每一阅读状态；28课程目录及786张独立Image另见对应报告。原站已购用户的“整门标记完成/重置”商业账户控件不在当前公开游客展示状态内。本地当前页完成/撤销与课程进度已实现。Solo完成页的独立路由与桌面/手机全屏对照已由独立任务完成，见 `docs/solo-completion-fidelity.md`。

## 复跑

本地服务5173，已准备 `output/article-reference`。截图脚本依赖保留的原站浏览器会话，以避免CDN新会话间歇加载失败：`lesson-article-source`的004/117、`catalog-fidelity` tab t3的001/1、`root-solo`的015/936。保持源页面在相应课程状态，不同时操作同一session。

```sh
node tests/reader-shell-visual-audit.mjs
node tests/article-flat-sidebar-visual-audit.mjs
node tests/article-completion-visual-audit.mjs
node tests/solo-shell-visual-audit.mjs
node tests/solo-footer-visual-audit.mjs
node tests/reader-shell-source-state.mjs
node tests/reader-shell-state-audit.mjs
```

完成控件对照使用原 `fc`，其导出已加入 `scripts/prepare-article-visual-reference.mjs`。Solo顶栏对照应在两边都进入第二步再返回第一步后运行；不要用初始50%进度页与已经返回的100%最远进度页比较。
