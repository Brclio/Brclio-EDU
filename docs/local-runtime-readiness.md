# 本机运行服务就绪核查

2026-11-02 对当前 macOS ARM64 工作站做了真实启动和执行尝试，证据为 `tests/local-runner-readiness.json`。

- 仓库 `runner/server.py` 可在本机启动，`GET /health` 返回 200；临时鉴权令牌只保存在进程环境中，未写入报告。
- 提交原型 C++ 程序得到 503 `Execution service is unavailable.`。本机没有 Docker CLI、Docker Desktop、OrbStack、Colima、Podman 或 Docker socket，因此不能运行仓库的隔离编译镜像。测试后临时 HTTP 服务已停止。
- 本机虽有部分原生编译器，但没有用未隔离的宿主执行冒充仓库的 Docker 执行服务。`/health` 成功仅说明 HTTP 已启动，不能当作编译器可用证据。
- 仓库提供服务、执行器、离线课堂响应、基础镜像 Dockerfile 和 Swift Dockerfile；具备 Docker 环境后可以自行构建并运行，配置方法见 `runner/README.md`。Swift 为独立镜像，当前机器没有该镜像。
- 本轮当前前端的 C/C++/Java/Go/Swift/多进程验证采用显式测试 relay 调用既有 Brclio 隔离服务；不是原站 py2fun 的编译服务，也不是假响应。报告记录本地前端 URL、真实上游 URL、请求状态与程序结果。Python、JavaScript、SQL 的浏览器执行器和依赖资源仍是本地化的同源资源。

因此，本仓库拥有可自部署的本地运行服务实现，但**当前工作站尚未具备全部编译执行服务的离线运行前置条件**。不能把使用既有独立服务的测试写成此 Mac 已完成全离线执行验证。

后续补齐开发预览服务：Vite 的 `/api/run` 默认代理到既有 `https://edu.brclio.com`，只转发运行请求，不转发浏览器 Cookie 或 Authorization；可通过 `BRCLIO_DEV_API_ORIGIN` 改为自行配置的 Worker。`tests/dev-services-audit.json` 记录未安装测试 relay 的真实开发端点编译结果。本地界面的原生代码运行因此可直接使用，仍不是此 Mac 的离线编译。

`scripts/dev-media.ts` 同时为开发和预览接入部署版 `worker/media.ts` 的 Range/流式实现，媒体块只从当前本机静态服务器读取。两个大视频不再落入 SPA HTML 回退；这项功能不需要外部服务。
