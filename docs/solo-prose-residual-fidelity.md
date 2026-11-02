# Solo Markdown 最后残差复核

2026-11-02。本轮只复核 `prose-pixel-differences` 中固定12个文本hash，未把它表述为4052块全部截图结果。使用公开原始Markdown组件与本地组件、相同内容、同一个Chromium实例和1440×1000视口；未重写harness HTML。

## 修复及证据

`src/solo-fidelity.css` 仅改三处通用Markdown样式：

1. `hr` 保留原生 `border:1px inset`，去掉显式 `#808080`。虽然两者computed color均为灰色，Chromium对显式边框颜色与原生currentColor的inset绘制不同；原本3块各1276像素差消失。
2. `.solo-source-code code` 恢复原版 `display:inline`。原来block在长行横向溢出时产生不同的圆角合成，3块46/46/74像素差全部消失。
3. 外层 `.solo-source-pre` 圆角归零，与原版外pre结构一致；8px圆角仍位于内层代码容器。

其余1块包含++/--比较表，当前复跑也为0。7块不含video的文本在最终复跑中均 `changedOver10=0`，尺寸与高度一致。

## Video：解码画面与原生控件分开核对

旧脚本只等`loadedmetadata`/readyState≥1，可能在首帧尚未解码或尚未呈现时截图，导致136227/43416等大面积差异。新等待步骤已并入 `tests/prose-full-visual-audit.mjs`：

- 等`loadeddata`/readyState≥2（错误或5秒上限）；
- 将每个video滚入可见区，等待`requestVideoFrameCallback`，对已呈现而不会再触发回调的暂停帧保留500ms兜底；
- 再等待两次animation frame。

两边执行相同等待。没有修改video的src、preload、currentTime、autoplay或播放状态。

独立脚本还通过canvas提取原始解码RGBA，计算SHA256并保存帧PNG。5块正文包含7个video；最终7对帧SHA256均相同，原始帧像素差均0。全部12块中，**video矩形区域外的差像素均0**。原生video控件内仍可存在随网络读取时序变化的缓冲条差异，数值每轮变化；没有把这些时变控件称为逐像素相同。

实际查看了024/1325的视频页面完整截图：两边同为暂停的0:00/0:26首帧，文本、边框、视频画面一致；底部原生缓冲条长度不同。原站没有preload属性，但Chromium DOM属性读取默认也为`metadata`；本地显式metadata与其策略一致。两边autoplay均false，无需为了消除测试时序差而改变业务播放行为。

## 可复跑材料

- `tests/solo-prose-residual-audit.mjs`：固定12个hash，避免并行全量报告覆盖中间状态造成漏测。
- `tests/solo-prose-residual-audit.json`：每块原/本地computed CSS、video readyState/buffered/paused/currentTime、原始帧SHA256、视频外像素差。
- `output/solo-prose-residual/<hash>-{source,local}.png`：正文完整截图。
- `output/solo-prose-residual/<hash>-video<N>-frame-{source,local}.png`：直接从video解码画面提取的原始PNG，不含浏览器控件。

```sh
node tests/solo-prose-residual-audit.mjs
```

最终断言同时要求12块全部存在、尺寸/高度一致、视频外差像素0、7对原始帧hash相同；允许原生controls区域的时变绘制差异。所有资源均经本地内容路径加载。
