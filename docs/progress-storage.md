# 学习记录存储

课程页面公开访问，无登录流程。浏览器先保存学习记录到本地，再通过同源 `/api/progress` 同步到 GitHub 私有仓库。后端为 Cloudflare Worker，入口 `worker/index.ts`。

## GitHub App 配置

当前仓库：`BrclioData/Brclio-EDU-Data`。

| 类型 | 名称 | 值 / 用途 |
| --- | --- | --- |
| Worker variable | `GITHUB_REPOSITORY` | `BrclioData/Brclio-EDU-Data` |
| Worker variable | `GITHUB_BRANCH` | 可选；省略时使用仓库默认分支 |
| Worker variable | `GITHUB_APP_ID` | `5566305` |
| Worker variable | `GITHUB_APP_CLIENT_ID` | 可选，`Iv23liTCIgK88FqA1wPz`；设置后优先用于 JWT issuer |
| Worker variable | `GITHUB_INSTALLATION_ID` | 将 App 安装到目标账户后取得的 installation ID |
| Worker secret | `GITHUB_APP_PRIVATE_KEY` | App 的完整 PEM 私钥，支持 PKCS#1 / PKCS#8 |
| Worker secret | `SESSION_SECRET` | 至少 32 个字符的随机密钥，用于签名匿名学习者 cookie |

App 必须安装到目标账户并授权目标仓库，权限为 Contents: Read and write。安装入口：<https://github.com/apps/brclio-edu-data/installations/new>。建议创建仓库时添加 README，使默认分支存在。

Worker 使用 RS256 JWT 换取 installation token。JWT 有效期 9 分钟，签发时间回退 60 秒以容忍时钟偏差；installation token 只申请目标仓库的 Contents 写权限，在到期前 60 秒重新获取。并发请求共享换取 token 的请求；GitHub 返回 401 时重新换取一次。私钥、JWT、installation token 均不会返回浏览器或写入学习记录。

兼容旧配置：没有完整 App 配置时，可使用 `GITHUB_TOKEN` secret 作为 PAT 认证。此 token 应只授权指定私有仓库的 Contents 读写权限。推荐使用 GitHub App。

不要把 PEM 文件、token、`.dev.vars` 或 `.env` 提交到代码仓库。由部署者通过 Wrangler secret 输入设置上述 secrets，真实私钥应始终留在本地安全位置及 Cloudflare secret 中。不要更换已有 `SESSION_SECRET`，除非需要主动使全部匿名 cookie 失效。

## 匿名学习者

首次 GET 会设置 `__Host-brclio_progress` cookie：Secure、HttpOnly、SameSite=Lax、Path=/，有效期一年。cookie 包含随机匿名 ID、有效期及 HMAC 签名。服务端使用 Web Crypto 验证签名，客户端不能指定任意仓库路径或其他学习者 ID。

- 同一浏览器继续访问会恢复该学习者的记录。
- 不同浏览器、设备或隐私窗口会生成不同记录。
- 清除浏览器 cookie 会失去云端记录的关联；当前版本没有账户恢复或跨设备配对功能。
- 本地 HTTP 开发使用 `brclio_progress_dev` cookie；生产环境必须用 HTTPS。

GitHub 文件路径为 `progress/v1/<ID前两位>/<匿名ID>.json`。接口不会列出其他学习者的文件，也不接收邮箱或姓名。

## API

请求必须同源。浏览器正常 `fetch('/api/progress')` 自动带 cookie；PUT 必须设置 `Content-Type: application/json`。浏览器会自动发送 Origin。

`GET /api/progress`：

```json
{
  "configured": true,
  "progress": {
    "version": 1,
    "updatedAt": "2026-11-01T12:00:00.000Z",
    "lessons": {
      "1:2": {
        "completed": true,
        "updatedAt": "2026-11-01T12:00:00.000Z",
        "code": "print('hello')",
        "answers": { "exercise-1": "A" }
      }
    },
    "lastLesson": { "courseId": "1", "lessonId": "2" }
  }
}
```

`PUT /api/progress` 的请求体直接使用上例的 `progress` 对象，返回 `{ "configured": true, "progress": <合并后的记录> }`。前端应先 GET 建立 cookie，再 PUT；PUT 缺失或签名无效的 cookie 返回 401。lesson key 应使用 `courseId:lessonId`，避免不同课程的课时编号冲突。数字形式的 `lastLesson` ID 会转换为字符串。

未配置认证、仓库或 session secret 时，GET 返回 200、`configured: false` 和空记录。PUT 返回 503；前端保留本地记录，接通配置后再同步。只有确认仓库为 private 才读写学习记录。

服务端逐课比较 `updatedAt`，保留较新的完整课时记录。缺席的课时不会删除，时间相同时保留云端课时。最近学习位置使用顶层 `updatedAt`。因此更新某个课时时，客户端应保留其已有 code / answers，再提交完整记录。GitHub SHA 冲突最多重读、合并、重试 3 次；完全相同的保存不会产生新的 commit。

请求和合并后的文件上限 2 MiB，每人最多 2000 个课时记录；每课代码及单个答案/笔记字符串最多 64 KiB（UTF-8 字节），每课 answers 合计最多 256 KiB。超过 1 MiB 的 GitHub 文件使用 raw 内容接口读取，同时保留 metadata SHA 进行冲突检测。API 返回 `Cache-Control: private, no-store`。GitHub 上游错误只返回简短提示，不返回原始响应、token 或仓库内容。

## 同步频率及错误处理

GitHub Contents API 是版本化存储，每次有效保存产生 commit，存在 API 请求速率限制。建议停止输入至少数秒后保存代码，完成课时和跳转时保存；多个变化应合并一次提交，不要按键逐个写入。暂时性失败时继续保留本地状态并自动重试；首次连接失败也会重试。401 会先重新建立匿名 cookie，400/413/415 会显示具体原因并停止对相同状态的自动重试。跨标签页变化会合并、持久化并同步。

| HTTP 状态 | 前端处理 |
| --- | --- |
| 200 | 合并返回记录，显示已同步 |
| 400 / 413 / 415 | 停止自动重试，显示具体错误，保留本地记录并提示导出备份后精简 |
| 401 | GET 重建匿名 cookie 后重试 |
| 403 | 仅从本站发起保存 |
| 409 | 延迟重试，保留本地状态 |
| 502 / 503 | 保留本地状态，稍后重试或检查后端配置 |

## 验证

Node.js 22.18+ 可直接运行：

```sh
node --test tests/worker.test.ts
```

测试覆盖匿名隔离、cookie 篡改及过期、跨站写入阻断、私有仓库约束、Unicode 编码、GitHub SHA 冲突重试、旧状态合并、无变化不写 commit、字段与请求大小限制、损坏记录不覆盖，以及 App JWT 签名 / token 缓存 / 到期与 401 刷新。

参考：[GitHub JWT](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app)、[installation token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)、[Contents API](https://docs.github.com/en/rest/repos/contents)。
