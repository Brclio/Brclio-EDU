# Brclio EDU

[在线学习](https://edu.brclio.com/) · [上线验收](docs/verification.md) · [宝塔运行服务](docs/server-deployment.md)

基于 edu.py2fun.com 公开课程数据的开放学习站。Cloudflare Workers + Static Assets 托管课程，访客无需登录；学习记录由 Worker 写入 GitHub 私有仓库。需要原生编译或多进程的程序使用独立的宝塔运行服务。

## 内容与交互

- 28 门课程、8 个分类、1,190 个课节、479 道代码挑战、2,805 个知识/测验/挑战引用。
- 保留原课程顺序、正文、代码、公开答案和组件数据，资源随站点部署。
- 分别实现逐步学习和文章式课程布局：章节目录、课内导航、笔记、完成进度。
- 单选、多选、填空、拖放、排序、错答重试；编辑多文件代码、输入、运行和公开测试。
- 163 个分步动画、964 帧原 SVG，支持前进、后退和重播；真实 SVG 导图支持折叠、拖动和缩放。
- KaTeX 数学公式与字体同源部署；网页交互预览采用隔离 iframe。
- 学习记录可离线保存、恢复同步及导入/导出。无需账户不等于自动跨设备识别，换设备可导入备份。

[内容导入审计](docs/content-audit.md)记录来源与恢复方式；[交互审计](docs/interaction-audit.md)区分全量静态比较、真实操作和不能证明的范围。原始 API 缓存保留于本机 `data/source/`，不公开运维凭据或主机盘点。

## 运行环境

Python 核心使用本地 Pyodide 314.0.7，NumPy、Pandas、Matplotlib、SciPy、SymPy、scikit-learn、Seaborn、Requests、Beautiful Soup、lxml、OpenPyXL 等依赖均在本站加载，不需要第三方 CDN。旧课程所用历史 API 在运行器中兼容，课程源码保持原样。图表、CSV、Excel 产物可显示或下载。

JavaScript、课程使用的 Node `main/readLine` 约定、SQLite 与 HTML 在浏览器中执行。Node 兼容覆盖现有课例，不是完整的 Node 系统 API；SQLite 兼容课程用到的部分 MySQL 语法，不是完整 MySQL 服务。

C、C++、Java、Go、TypeScript、C#、Ruby、Rust、PHP、Swift、Shell 及 Python 多进程由 `/api/run` 转发到隔离运行器。服务器支持 15 种语言，每次运行使用独立非 root 容器、只读文件系统、禁网络、CPU/内存/时限/输出限制；仅允许单并发，每个访问来源每分钟最多 6 次。令牌只在 Worker Secret 和服务器私有环境文件中。

34 个精确教学 URL 映射至本地资源，保留真实原始响应、编码与来源。两份已改版网页另有明确标记的教学兼容副本，按真实当前目录/正文恢复旧课程选择器，**不冒称历史原 HTML**。未归档的动态地址和个人登录操作不承诺离线可用；不能假造用户凭据或互联网响应。

运行与判题证据：

- [Python 全量与兼容审计](docs/runtime-audit.md)
- [JavaScript / Node / SQL / 网页交互](docs/runtime-nonpython-audit.md)
- [原生语言与服务器执行](docs/runtime-native-audit.md)
- [107 道作者单元测试](docs/runtime-unit-audit.md)
- [数学题操作与填空](docs/math-quiz-audit.md)

原教材中的故意异常、未完成模板、无限循环及部分原始错误保留并分类记录。有公开用例的题按公开用例检验，没有公开判题依据的题不伪装成通过原站隐藏测试。原站购买、账号、客服、AI 答疑不在本项目范围。

## 开发与验证

```sh
npm install
npm run dev
npm test
npm run build
python3 scripts/import-verify.py
python3 -m unittest discover -s tests -p 'runner_test.py'
```

`npm run dev` 为前端开发，记录保存在浏览器；真实 Worker 联调用 `npm run dev:cloudflare`，并在未提交的 `.dev.vars` 中提供需要的服务密钥。已有审计结果的校验和完整浏览器重跑是不同操作，具体复现命令在各审计文档中。

```sh
python3 scripts/import-courses.py
python3 scripts/import-svg-assets.py
node scripts/import-runtime.mjs
python3 scripts/import-runtime-data.py
python3 scripts/import-network-fixtures.py
python3 scripts/import-biqukan-compat.py
```

导入器默认复用缓存，来源、SHA256、恢复或改编标记随数据保留。大视频无损拆为 8 MiB 静态块，由 `/api/media/:id` 支持 Range 播放。这里的“本地化”指与站点一起托管，首次访问仍需下载资源。

## 部署与管理

```sh
npm run deploy
```

Cloudflare 站点配置在 `wrangler.jsonc`；详见 [Cloudflare 配置](docs/cloudflare.md)、[学习记录接口](docs/progress-storage.md)、[宝塔服务管理](docs/server-deployment.md)。GitHub App 私钥、会话密钥、运行器令牌都不能放入前端、`public/` 或 Git 仓库。

运行器目录、宝塔项目、Nginx 虚拟主机和证书续期任务独立管理；部署前后其他站点配置和响应状态保持一致。镜像包含本地教学资源，可通过提供的单层更新脚本更新，无需重复安装工具链。
