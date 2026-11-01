# 上线验收（2026-11-01）

- 站点：https://edu.brclio.com/
- 源码及课程文件：https://github.com/Brclio/Brclio-EDU
- 学习记录私有仓库：BrclioData/Brclio-EDU-Data
- 最终部署版本：44ed4718-6514-4f38-8975-7fb426f1a99e

## 内容完整性

`python3 scripts/import-verify.py` 通过：28 门课程、1190 课节、479 道代码挑战，全部本地引用有效，两个大视频分块 SHA256 一致，没有超过 Cloudflare 25MiB 的文件，没有未解决的必需课程资源。

`public/content/recovery-report.json` 保留恢复证据：3 个取回的原文件、1 个从课件导出的原 HTML、2 个依据原始截图/模型重建的资源。重建资源未冒称原文件。真实互联网爬虫目标、知识参考超链接及示例未使用的全站 CSS 图标保留来源，不纳入离线课程依赖。

## 功能与运行环境

- 桌面和390px手机宽度截图检查；分类筛选、章节目录、课程导航、练习错误重试/正确完成、进度恢复及备份入口可用。
- 六种原始题型实际判分通过；填空编辑不丢失焦点。
- Python / JavaScript、NumPy / Pandas / Matplotlib / SciPy / SymPy / scikit-learn / BeautifulSoup / lxml / requests / seaborn / SQLite 浏览器运行通过；Matplotlib 返回有效 PNG。
- Python 核心及29个依赖包在本站加载；实测 Worker 资源请求无第三方 CDN。
- requests / urllib 对原固定教学网页 URL 使用本地保留件；024-1327 原始 BeautifulSoup 代码全文运行通过。
- 公开测试用例验证正确及错误输出，原站未公开的判题数据不会被伪造。

## 正式域名

`edu.brclio.com` 已绑定 Worker Custom Domain；DNS A/AAAA 已生效，HTTPS 证书校验通过（curl verify result=0），首页返回200。在正式域名再次完成匿名记录保存、读取、身份隔离与GitHub实际文件核验，测试文件已清理。

## 云端学习记录与视频

- 匿名 GET 生成 HttpOnly cookie；PUT 保存、同浏览器刷新读取一致、独立浏览器无他人记录。
- 直接读取 GitHub 私有仓库验证实际 JSON 与文件 SHA；本次临时测试文件已清理。
- 视频 HEAD、开头、结尾、跨8MiB分块的 Range 返回正确206与Content-Length，返回字节SHA256与本地一致。
- `npm test` 34项全部通过，覆盖身份隔离、跨域写入拒绝、冲突合并、GitHub App认证和token刷新、超限拒绝、超过1MiB文件raw读取、断网恢复、多标签合并以及流式媒体。
- `npm run build` 成功；主入口约78KB gzip，课程编辑/渲染器按需加载。

## 尚未等同原站的能力

C/C++、Java、Go 的在线编译尚未接入；课程、练习题和代码编辑/下载均已保留。Python网络爬虫的任意真实网站、桌面GUI等需要相应网络或桌面环境。本站不提供原站私有判题服务、AI答疑与会员系统。浏览器匿名身份不等于账号跨设备登录，跨设备需导出/导入学习记录。
