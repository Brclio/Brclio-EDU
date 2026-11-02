# Solo 完成页核查

2026-11-02 对原站 `https://edu.py2fun.com/learn#/course/015/page/936/completed` 实际访问与点击，并在同一 Playwright Chromium、DPR 1 下比较本地页面。

原站真实行为是独立 `/course/:courseId/page/:pageId/completed` 路由。没有课内 header、返回上一步、重新复习或下一节按钮。页面含 185×180 庆祝图片、学习完成标题、224px 说明、首次完成的 `+10` 钻石卡片，以及固定底栏。底栏先显示原 loading GIF，5 秒后显示“继续”；点击后替换当前路由为课程目录。账号打卡图片加载成功也可让原站提前显示继续，但匿名实际访问没有打卡图片。

对应原 bundle `data/source/index-c6fcd669.js` 的 `E8t`（字符位置约 4005221），CSS 为 `index-9cef5da8.css` 的 `_completed_1deat_1`。原组件根据课节 `status !== "done"` 显示首完奖励，随后保存完成状态。源码中的 `_8t` 打卡海报依赖登录用户及 `poster_infos`，不是完成页的本地静态素材。

本地已用 `SoloCompletion.tsx` 与 `solo-completion.css` 替换自制的“本节学习完成”面板，并在真实最后一步进入相同路由。使用原 PNG、GIF 与 CSS 内嵌钻石图，下载来源、字节数和 SHA-256 在 `public/content/site-ui/completion-provenance.json`。全部图片同源加载。

完成状态保存到既有 `lessons[course:lesson].completed`。首次完成同时将本地纪念值 `answers.__completionReward` 记为 10，重复访问、刷新以及已完成记录不会累加；它不代表原站账户余额。原有答案、代码、最后步骤、笔记均保留。

证据：

- `tests/solo-completion-audit.json`：桌面、手机及真实最后一步，共 3 组通过；检查 5 秒等待、按钮实际导航、首完持久化、刷新不重复奖励和笔记保留。
- `output/editor-visual/completion-desktop-{source,local,compare,diff}.png`：1280×900 全屏。
- `output/editor-visual/completion-mobile-{source,local,compare,diff}.png`：390×844 全屏。
- 两个全屏画面 RGB 差均为 **0**，无遮罩、无像素替换、无尺寸缩放。截图前通过原站关闭按钮关闭其公开弹出的微信登录提示，不修改原站 DOM 或接口结果。
- `tests/completion-progress-compatibility.json`：实际“学习记录”导出下载、全新浏览器导入、Worker `validateProgress` 和存储 JSON 序列化核查。

明确边界：原站登录、账户余额、活动报名以及生成含用户头像的打卡海报依赖原站账号与 API；本地未伪造这些服务或输出。原站匿名访问没有显示打卡海报，此次全屏零像素差覆盖匿名完成页的稳定状态，不覆盖登录后海报和保存分享操作。
