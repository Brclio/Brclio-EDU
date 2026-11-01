# 独立编译运行服务

部署目标是 `https://edu-runner.bornforthis.cn/__brclio_edu_runner/run`。宝塔项目名 `brclio-edu-runner`，目录 `/www/wwwroot/brclio-edu-runner`；宿主服务仅监听 `127.0.0.1:18731`，由独立 Nginx 虚拟主机转发。

宿主使用宝塔独立虚拟环境 `/www/server/pyporject_evn/brclio-edu-runner/bin/python`。`RUNNER_TOKEN` 保存在服务器 `/etc/brclio-edu-runner.env`，权限 `0600`，由本服务的 host-only 启动器读取，避免面板环境文件解析差异。Cloudflare Worker 使用同名 secret；任何令牌值都不进入仓库、浏览器、Docker 镜像或日志。

## 面板管理与网络

`infra/server-panel.py` 通过已安装宝塔官方 Python 项目模块创建、查询和配置**仅本项目**，不修改插件代码。必须使用 `/www/server/panel/pyenv/bin/python3` 运行。

1. `register`：校验 `server.py` 存在，保存当前所有旧 Nginx vhost 的 SHA-256 基线，新建 command 项目。不开额外防火墙端口。
2. `status`：核验 `prep_status=complete`、运行状态和绑定信息。
3. `bind`：仅本项目添加新域名并开启外网映射；然后 `proxy` 添加 `/` → 本机端口的转发规则。先完成转发规则，再部署 TLS，避免面板重建配置时清除尚未同步的 SSL 块。
4. `probe`：为新域名创建唯一 HTTP challenge 探针；必须从公网拿到其精确内容，确认通配 DNS 正确回源。
5. `certificate`：通过宝塔 ACME API 申请本域名证书并部署到本项目，过滤私钥和证书正文输出。
6. `baseline`：核验旧 vhost 配置未被改变。

只有源站 HTTP probe 成功才申请证书。Nginx 配置通过面板 API 生成和同步，允许其正常 reload；不得 restart Nginx、Docker 或旧站点服务。

## 资源隔离

`infra/server-build.sh` 使用专用 BuildKit builder `brclio-edu-builder`，512 MiB 内存上限、CPU 0.35。构建上下文只包含 `runner/` 的服务文件，不能包含主机凭据或整个课程资产仓库。构建完成的固定镜像名为 `brclio-edu-runner:1`。

Swift 使用独立 `brclio-edu-swift:1` 镜像，通过 `RUNNER_SWIFT_IMAGE` 启用。`infra/server-build-swift.sh` 复用专用构建器，两个构建顺序执行。基础镜像按官方 amd64 digest 锁定；服务器网络需要时使用镜像代理与保留 GPG 验证的 APT 镜像源。

课程资源和执行器后续更新使用 `infra/server-update-image.sh`：先将当前工具链固定为本地 `brclio-edu-toolchains:20261102`，再以 `runner/Dockerfile.update` 仅复制新执行器、离线拦截器和归档页面并设为只读，不重新安装 SDK。构建禁网络、禁止拉取、CPU 0.35、内存 512 MiB；执行容器依然不挂载任何宿主目录。

只有执行兼容逻辑变化时，可用 `infra/server-hotfix-execute.sh` 从当前镜像单次 COPY `execute.py`，保留已有 SDK、离线课件和非 root 入口。两步构建无需新增包，避免经典 builder 对多次元数据层提交的额外开销。更新应在维护审计停止且没有执行容器时进行，完成后复验受影响课程及公开测试用例。

运行器单并发，每次提交独立容器：CPU 0.35、384 MiB 内存、64 MiB 工作目录 tmpfs、64 进程、只读根目录、非 root UID、禁网络、丢弃全部 capabilities、no-new-privileges，保留默认 seccomp。编译与运行都有限时、输出上限；使用 `--log-driver none` 防止学生输出形成 Docker 磁盘日志。容器结束或超时后清理。宿主 HTTP 最多 8 线程、每学习标识每分钟 6 次；跨进程文件锁确保维护审计与在线请求合计仍单并发。

## 验收

验证本机 `/health`、未授权 POST 被拒绝、带 token 的真实课程示例得到正确结果；验证编译错误、运行超时和并发忙碌响应。公网 HTTPS 验证证书有效且后端接口可达，再由 Cloudflare Worker 代理调用。Worker 请求显式发送 `User-Agent: Brclio-EDU-Worker/1.0`，避免上游将默认脚本客户端标记为爬虫。

2026-11-02 首次部署完成 C、C++、Java、Go、JavaScript、Python、SQL、Shell、Bash、TypeScript、C#、Ruby、Rust、PHP、Swift 共 15 个真实 HTTP + 容器 smoke，全部输出 `6` 且退出码为 0。Swift 示例编译运行耗时 10.88 秒（CPU 0.35、384 MiB），公网鉴权 C 调用返回 200。实际课程的全面审计由 `runner/native-audit.py` 和 `tests/runner-native-plan.json` 单独记录，smoke 不代表每个原始例子都无教学错误。

最终镜像还通过实际边界检查：UID 为 65534、系统目录写入失败、外部网络连接失败、34 个离线 URL 归档可读；错误 C 代码返回编译失败，无限循环触发超时，第二个并发请求返回 503。离线归档按精确 URL 映射，个别教学兼容页面保留 `adapted` 元数据，未知网络地址明确失败。构建结束后停止专用 builder 并清理其缓存，不清理其他项目资源。

复查 CPU/内存/磁盘、无遗留执行容器、旧配置 SHA-256 和站点 HTTP 状态。详细环境基线仅保留在未跟踪的运维目录，不应提交公开仓库。

服务器自续期使用独立 `brclio-edu-certbot-renew.timer` 每日调度和本服务虚拟环境中的 Certbot；仅其进程使用 TLS 1.2 配置以适应该服务器到 CA 的链路，失败有有界重试。不会修改全局 OpenSSL 配置或创建桌面自动化。证书、账户密钥均保存在 `/var/lib/brclio-edu-runner/` 的受限目录，续期后调用面板 API 安装本服务证书。首次证书有效至 2027-01-30；服务器 staging `renew --dry-run` 和真实安装 hook 均已通过。可用 `systemctl status brclio-edu-certbot-renew.timer` 和对应 service journal 查看后续续期状态。
