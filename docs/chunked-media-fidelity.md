# 分块视频真实播放核查

2026-11-02，在独立冻结服务 `http://127.0.0.1:5176` 对原发布Markdown组件与本地组件同时核查两条 `/api/media` 视频。此前Vite没有Worker路由，两边都出现错误码4的旧正文结果**不能证明视频可播**；本专项要求实际元数据、解码首帧和原生控件操作成功。

| 视频 | 原始自然尺寸 | 时长 | 原/本地页面尺寸 |
| --- | --- | --- | --- |
| `fc016e52f3a60c386a00`，024/1325 | 2820×1424 | 20.916667秒 | 638×342.953125 |
| `c81a6c19ec7f1283e355`，024/1337 | 2844×1502 | 35.2秒 | 638×356.75 |

两边均 `readyState=4`、`error=null`、`autoplay=false`、初始暂停time0。原始元数据与保存的视频文件ffprobe结果一致。为避免离屏未呈现的黑帧，抽帧前先滚入可见区，seek到0并等视频帧回调，再读取canvas原始RGBA；两对首帧SHA256均相同，通道差>10的像素均为0。

实际使用鼠标点击浏览器原生播放/暂停按钮与时间进度条，未用模拟业务播放器替代。四个原/本地播放实例都验证了：时间推进、暂停250ms时间不变、seek到50%以后且成功解码、seek后重新播放并再次暂停。两边seek结果分别同为14.785184秒、24.881521秒。

网络记录包含真实HTTP206、`Content-Type: video/mp4`与`Content-Range`。例如第一条视频seek产生 `bytes 76611584-89678384/89678385` 范围请求，实际跨过本地分块边界。原生控件缓冲进度仍取决于流式读取时序；不把缓冲条动态绘制差异当作视频帧或课程排版差异。

本次服务实现哈希：

- `scripts/dev-media.ts`：`0b48b968b1aa0b92c81753bb4756962a84d4000e3bae7987448eacca6d58a5a2`
- `worker/media.ts`：`f9de8914814cb8235fcbd5cecd35b385a3a5e80cbc077323bddd10391876e9cf`

复跑 `AUDIT_BASE=http://127.0.0.1:5176 node tests/chunked-media-browser-audit.mjs`。完整数据在 `tests/chunked-media-browser-audit.json`；页面截图和不含controls的原始帧在 `output/chunked-media-browser/`。本报告是新增有效播放证据，不改写先前失败历史。
