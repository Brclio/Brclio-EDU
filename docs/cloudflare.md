# Cloudflare 部署

站点使用 Cloudflare Worker 托管 Vite 生成的 `dist/`，`/api/*` 由 `worker/index.ts` 处理。课程、图片和前端文件公开访问；学习记录由 Worker 读写 GitHub 私有仓库，GitHub 凭据只保存在 Worker 中。

## 本地启动

```sh
npm install
npm run dev
```

要联调 Worker 与构建后的前端：

```sh
npm run build
npx wrangler dev
```

`wrangler dev` 默认在 `http://localhost:8787` 提供站点。Vite 开发服务和 Worker 开发服务是不同入口；验证学习记录接口时应使用 Worker 入口，或配置 Vite API 代理。

## 绑定学习记录仓库

1. 创建 GitHub **私有**仓库 `BrclioData/Brclio-EDU-Data` 并初始化一个提交（例如添加 README），确认目标分支存在。
2. 在 `wrangler.jsonc` 中将 `vars.GITHUB_REPOSITORY` 填为 `owner/repository`，将 `GITHUB_BRANCH` 设为实际分支名，通常为 `main`。
3. 将 GitHub App（App ID `5566305`）安装到该私有仓库，授予 `Contents: Read and write` 权限；设置 `GITHUB_INSTALLATION_ID` 为安装 ID。配置中的 App ID 与 Client ID 是公开标识，私钥必须存为 Secret。
4. 使用 Cloudflare Secrets 保存 `GITHUB_APP_PRIVATE_KEY`（完整 PEM 私钥）和 `SESSION_SECRET`。`SESSION_SECRET` 应为至少 32 字节随机密钥，用于匿名身份签名，同一部署升级时保持不变。

GitHub 私钥和 token 不应写入 `VITE_*`、前端代码、课程 JSON 或 Git 仓库。匿名身份由 HttpOnly Cookie 保存；同一浏览器可继续学习，无需账号。

本地开发可在项目根目录创建已被 Git 忽略的 `.dev.vars`：

```dotenv
GITHUB_REPOSITORY="BrclioData/Brclio-EDU-Data"
GITHUB_BRANCH="main"
GITHUB_APP_ID="5566305"
GITHUB_INSTALLATION_ID="your-installation-id"
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
SESSION_SECRET="your-random-signing-secret"
```

本地 `.dev.vars` 不会自动上传至 Cloudflare。GitHub App 必须安装到目标仓库；只创建 App 或只提供私钥不足以访问仓库。也支持以 `GITHUB_TOKEN` Secret 提供限定到目标仓库、具有 Contents 读写权限的 fine-grained PAT 作为备用认证方式。

## 发布

先确认 Cloudflare 身份：

```sh
npx wrangler whoami
```

若尚未登录，执行 `npx wrangler login`。如果所属账户不止一个，使用 `CLOUDFLARE_ACCOUNT_ID` 指定账户，或在配置中添加 `account_id`。

首次部署可以先发布公开课程，再通过交互式输入设置密钥：

```sh
npm run deploy
npx wrangler secret put GITHUB_APP_PRIVATE_KEY
npx wrangler secret put SESSION_SECRET
```

`secret put` 会发布一个新版本。在仓库和密钥尚未设置时，课程仍可公开使用；云端学习记录尚未启用。

也可以将密钥保存到被忽略的 `.env.production` 文件，在首次发布时一并上传，避免短暂缺少配置：

```sh
npm run build
npx wrangler deploy --secrets-file .env.production
```

部署成功后，Wrangler 会输出实际的 `https://brclio-edu.<account-subdomain>.workers.dev` 地址。绑定自定义域名可在 Cloudflare Dashboard → Workers & Pages → brclio-edu → Settings → Domains & Routes 中配置。

## 发布验证

- 课程列表、课程详情、课时直达链接无需登录即可打开，刷新页面仍可访问。
- `/api/*` 返回 API 响应，不应回落为 HTML。
- 正确配置私有仓库后，完成课时会同步学习记录；同一浏览器刷新后可恢复。
- GitHub 私钥、token 和签名密钥不出现在网页响应、浏览器存储或构建产物中。
- 清除浏览器 Cookie 或使用其他浏览器会被识别为新访客；跨设备恢复需要使用项目提供的恢复功能（若已启用）。

## 官方说明

- [Workers 静态资源](https://developers.cloudflare.com/workers/static-assets/)
- [SPA 路由与 run_worker_first](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)
- [静态资源响应头](https://developers.cloudflare.com/workers/static-assets/headers/)
- [Worker 密钥](https://developers.cloudflare.com/workers/configuration/secrets/)

`public/_headers` 只应用于静态资源；API 响应头由 Worker 设置。SPA fallback 已在 Wrangler 中启用，因此无需 `_redirects` 通配规则，避免把 API 请求改写为页面。

## 已部署正式域名

正式访问地址为 https://edu.brclio.com/ ，通过 `wrangler.jsonc` 的 `routes[].custom_domain` 管理。`workers.dev` 地址仅保留作为备用访问入口。两个域名的浏览器匿名身份独立，学习时请固定使用正式域名。
