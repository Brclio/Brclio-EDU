# Brclio EDU

[在线学习](https://brclio-edu.aiyuechuang.workers.dev/) · [上线验收](docs/verification.md)

基于 edu.py2fun.com 公开课程内容的开放学习站，运行于 Cloudflare Workers + Static Assets。访客无需注册或登录；课程、题目和配图随网站部署，学习记录通过 Worker 写入 GitHub 私有仓库。

## 已导入内容

- 28 门课程、8 个分类、1,190 个课节。
- 2,805 个知识、测验和挑战引用，479 道代码挑战。
- 保留课程顺序、中文正文、原始图片及组件数据。
- 按原站紫色主题实现课程卡片、章节时间线、逐步学习与长文学习两种布局。
- 单选、多选、填空、拖放填空、排序题；代码编辑、输入、运行、答案检查；课程图示与分步动画。
- 学习进度、练习答案、代码和笔记自动保存；支持学习记录 JSON 导入导出。

数据以实际导入报告 [docs/content-audit.md](docs/content-audit.md) 为准。完整原始响应保留在 `data/source`，不随站点发布。

## 开发

```bash
npm install
npm run dev
npm run build
npm test
```

`npm run dev` 为前端本地开发，学习记录保存在浏览器；联调真实 Worker 用 `npm run dev:cloudflare`。

```bash
python3 scripts/import-courses.py
python3 scripts/import-verify.py
node scripts/import-runtime.mjs
```

导入器可重复运行，默认复用匿名公开 API 缓存；`--refresh` 重新获取。大视频无损分为8MiB静态块，由 `/api/media/:id` 支持 Range 播放。缺失的源站媒体会记入审计报告。

## 本地 Python 运行资源

`public/runtime/pyodide/` 随站点部署 Pyodide 314.0.7 核心、Python 标准库，以及课程涉及的 NumPy、Pandas、Matplotlib、SciPy、SymPy、scikit-learn、Seaborn、Requests、Beautiful Soup 和递归依赖。Python 运行时和这些库全部从本站 `/runtime/pyodide/` 加载，无需访问 jsDelivr 或 PyPI；Matplotlib 在浏览器内生成图表。

`node scripts/import-runtime.mjs` 可重新下载固定版本资源，并核对官方锁文件中的 SHA256。Seaborn 使用固定版本的 PyPI wheel 和其 SHA256。实际文件、版本、来源和校验值保存在 `public/runtime/pyodide/manifest.json`，每个文件均受 Cloudflare 25 MiB 上限检查。

爬虫课两份教学网页由 `public/content/fixture-map.json` 映射到本站 HTML；运行器在不改动课程 Python 代码的情况下，为精确匹配的 GET 请求提供本地内容，支持 `requests` 和 `urllib.request.urlopen`。附带查询参数、POST 及其他地址仍走真实网络。Beautiful Soup 使用的 `lxml` 解析器也已随站点打包。网页来源及按原截图恢复的标记保留在映射数据中。

这里的“本地”表示与网站一起托管，不代表首次访问可完全断网：浏览器仍需从本站取得尚未缓存的文件。运行任意未打包的第三方库不在此范围；爬虫示例请求的外部网页、远端接口及网络数据仍需目标服务可访问并允许浏览器跨域访问。`pyppeteer` 等需要完整浏览器进程的库无法在网页 Python 环境中运行，自定义模块则由课内附加文件提供。

## 部署与存储

```bash
npm run deploy
```

详见 [Cloudflare 部署说明](docs/cloudflare.md) 和 [学习记录接口](docs/progress-storage.md)。GitHub App 安装到 `BrclioData/Brclio-EDU-Data` 后，设置 installation ID 与 Cloudflare Secrets。私钥、会话签名密钥、安装令牌不得放入前端、`public/` 或 Git 仓库。

无登录模式通过签名 HttpOnly cookie 区分学习者；本地记录在断网时保留，恢复网络后重试。清除浏览器数据后不会自动认回旧身份；跨设备可用导出/导入备份。源码仓库和学习记录仓库是独立用途，本项目不会把整个站点源码写到学习记录仓库。

## 当前范围

课程内容已完整导入，交互实现并不等同于原站所有后端服务：

- Python（Pyodide）、JavaScript、SQL 和 HTML 在浏览器中运行，首次运行需要下载运行环境。
- C/C++、Java、Go 的编辑和课程可用，在线编译尚未接入；可下载代码在本地运行。
- 有公开测试用例的挑战按公开用例校验；没有用例的题只能运行并核对参考答案，不能声称通过原站私有判题。
- 原站 AI 答疑、客服、购买、账号等不在本站实现；本站使用 Brclio EDU 名称。
- 原站已失效媒体和无法导入资源见导入审计，不会以虚构内容替代。
