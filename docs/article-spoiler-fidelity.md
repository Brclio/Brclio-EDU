# Article 提示与按钮点击动画复核

2026-11-02，直接使用原站已发布的 Article 组件及 CSS，在同一 Chromium 中与本地真实 Content 分支比较。最终源组件文件 `main.js` SHA-256 为 `fc7d340034a099ce76c625f3f73924b6a0de1bfa4c307c38134d094275b7787f`，其 `vendor.js` 为 `2f05f5b00c4c047048d00e50ab7df06a6c02cdbcf6417f808aa3e4714690b804`。

## 修正内容

- 原提示按钮使用正常数字字形，本地曾继承 `tabular-nums` / `tnum`，使“提示1”宽度由原106.875px变成109.53125px。现对齐正常字形、16px字号、4px圆角、原 alert SVG、间距、边框、颜色及 hover/focus/active。
- 将 Article 的原生 details 替换为专用 `ArticleSpoiler`，保留源按钮与折叠容器结构。折叠正文按 `offsetHeight + 8` 作为目标高度，保持原正文 margin collapse；这也修复了展开后多出24px、首个代码块上移8px的差异。
- 原组件使用 react-spring 默认质量1、张力170、阻尼26。本地复现同样1ms积分、位移相关 precision / restVelocity、首帧16.667ms及后续最大64ms步长，保留中途反向时的速度，未用普通 CSS easing 代替物理弹簧。
- 原 Ant 按钮点击涟漪的淡出为2s、扩散为0.4s、最终半径6px；均使用 `cubic-bezier(.08,.82,.17,1)`。`useSourceClickWave` 也保留下一任务重启、10次 rAF 的启动保护、后续 animation/transition 事件复位和卸载清理。只接入 Article 提示按钮及动画上一帧/下一帧/重播三个圆按钮。

## 实际验证

| 范围 | 证据 | 结果 |
| --- | --- | --- |
| 全部29个真实提示，关闭/展开 | `tests/article-spoiler-visual-audit.json`，58对截图 | 每对尺寸相等，RGB任一通道差超过10的像素均为0 |
| 展开、收起、重新展开、展开途中反向 | `tests/article-spoiler-motion-audit.json`，每16ms采样，共239点 | 所有点的高度与透明度差均为0；四对160ms中间帧的通道差>10像素为0 |
| Enter、Space打开后再次关闭 | `tests/article-spoiler-keyboard-audit.json` | 两组源/本地均触发点击波纹、标签切换、展开到位及完全收起 |
| 三个动画圆按钮，1440px/390px视口 | `tests/animation-click-wave-audit.json`，6对160ms截图 | 涟漪存在，半径/透明度/圆角一致，通道差>10像素均为0 |
| TypeScript | `npx tsc --noEmit` | 通过 |

提示全量端点视口为1440×1000；动画圆按钮另外覆盖390×1000。截图分别在 `output/article-spoiler-visual/`、`output/article-spoiler-motion/`、`output/animation-click-wave/`。这些是上述组件与状态的证据，不代表所有设备与所有鼠标轨迹的穷举证明。

## 测量稳定性

最终测试使用独立5177冻结副本，避免多人修改产生的 Vite HMR。该副本初次配置遗漏了 symlink node_modules 的字体访问许可，导致两段提示的 KaTeX 字体403；这次无效测量保留在 `output/article-spoiler-visual/font-403-run.json`，未改应用字体来掩盖测试环境故障。修正测试服务访问范围后，全量脚本还明确拒绝任何字体加载错误。

Playwright 的虚拟 rAF 时钟与 Chromium 原生 CSS 动画时钟不同。动画测试先让原生 `animationstart` 到达，防止虚拟10帧先跑完而误触发原 Ant 的保护复位，再将两边原生 CSS 动画定位到相同160ms截屏；物理弹簧仍逐16ms由同一上下文时钟推进。未禁用或删除应用点击效果来取得相等截图。

最终组件哈希由全量端点与圆按钮 JSON 登记。最终共享 hook 为 `7e1e78d7b1ec7f91cb8a7079a0222f35b3c8307d725a76287821c16ddbcbe65f`。未部署、未提交。
