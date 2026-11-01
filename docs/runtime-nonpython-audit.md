# JavaScript、Node、SQL 与网页交互执行审计

课程原始源码、解答、测试预期值均保持不变。通过真实 Chromium 加载 `src/python-worker.js`，全量运行 **183 个原内容项**，再执行 2 个独立运行器探针；通过生产 `webPreviewDocument` 在相同 `allow-scripts` iframe 中另执行 **90 个网页示例**。

## 清点与执行

| 范围 | 数量 | 实际结果 |
|---|---:|---|
| 纯 JavaScript JsHtml | 69 | 68 完成；1 个原文修改 const 的故意异常 |
| JavaScript/Node TabbedCode | 11 | 全部完成 |
| Node 挑战原公开解答 | 36 | 全部完成，35/35 原公开测试通过，无静默无输出完成 |
| 普通 SQL Code | 46 | 全部完成 |
| SQL 挑战原公开解答 | 21 | 全部完成；这些原题没有公开 testcase，不宣称隐藏判题通过 |
| 网页 JsHtml | 83 | 全部实际执行；原文 `var x=100; document.write(X)` 保留大小写错误 |
| RunJS 算法活动 | 7 | 实际输入、计算结果、重置全部验证 |

合计 183 项中 182 完成、1 个原故意错误。Node 36 个解答中，27 个带测试、9 个不带测试但有固定打印结果；没有把未完成模板当作已完成解答。当前导入的 worker JavaScript 未使用 require/process 等 Node 模块接口，运行器提供课程所需的 JavaScript 与入口约定，不是完整 Node.js 系统环境。

## 已修复的实质故障

- 原 Node 解答定义 `main()` 并调用 `readLine()`；旧运行器缺两者约定，首轮仅 2/35 用例通过。界面现在传递原始 `sourceLanguage`，仅 `node`/`nodejs` 启用自动 main 入口及 readLine。普通 JavaScript 中“仅定义 main”不会自动执行，独立浏览器探针已确认。
- 原数组和对象打印不应统一 JSON.stringify。按课程使用的数据类型显示数组、对象、undefined 等；商品涨价公开用例的数组输出现与原预期一致。不宣称实现了 Node util.inspect 的全部格式化选项。
- 022/1233 的嵌套 setTimeout 与 Promise 示例先打印 End，后打印 Work 1、Work 2。旧运行器立即 done，UI 会终止 Worker，丢失后两行。现在等待实际已调度 timer 与其 Promise 延续完成，两段均真实运行约 2 秒并按顺序输出三行。
- 3 处 SQL CONCAT（含挑战）以及 1 处 CREATE OR REPLACE VIEW 使用原课程 MySQL 语法，SQLite 不直接支持。兼容实现保留 CONCAT 的 NULL 传播及原数据拼接结果，替换视图先删除同名本地视图再创建。查询原员工、城市和业绩数据已断言；这不是完整 MySQL 方言仿真。

## 网页交互证据

90 项使用生产预览文档生成器与实际 sandbox iframe；31 项有具体值/DOM/图片/位置断言，全部通过：

- 3 个实际 prompt/confirm 示例：姓名传递、平方根输入、确认和取消两条分支。
- RunJS 7 项：ASCII 65→A/1000001、油耗成本 4、3/7 交换、最大值 12、11 为奇数、BMI 31 为 obese、4 非质数；每项均检查重置后输入可编辑。
- 点击事件、监听器移除、输入转大写、表单相等校验、图片前后切换、定时文本、真实方块位置改变、时钟和间隔弹窗。

原图像切换示例的 HTML 初始图片来自 sololearn，JavaScript 数组第一张来自原 py2fun CDN，原始两张图就不同。“Next→Prev 后回数组第 0 张”才是原算法行为，不能假设恢复为 HTML 初始图片。两个原 URL 对应图片均已本地化，源码行为保留。

实际可运行网页只有 3 处顶层裸 prompt/confirm，没有 window.prompt、hiddenJS/inline script 中 prompt 或嵌套回调 prompt；因此没有为未使用的假设扩大对话框改写范围。本轮未修改 `content-web.ts`。

## 可复现记录

- `tests/runtime-nonpython-inventory.json`：183 项逐一来源、源码哈希、语言、前后置拼接信息与测试。
- `tests/runtime-nonpython-baseline.json`：首轮 178 完成/5 异常，2/35 用例通过。
- `tests/runtime-nonpython-audit.json`：修复后 183 原项加 2 探针，35/35 用例通过。
- `tests/runtime-web-audit.json`：90 项实际预览与 31 项具体交互断言。
- `tests/runtime-nonpython.test.mjs`：7 项综合回归断言。

```sh
node tests/runtime-nonpython-audit.mjs --run --probes --parallel=3
node --import tsx tests/runtime-web-audit.mjs
node --test tests/runtime-nonpython.test.mjs
node --test tests/runtime-compat.test.mjs
```

外部请求在审计浏览器中被阻止；网页资源使用本地副本。结果不是整个 App 导航或逐像素等价证明。运行报告记录 worker/预览生成器执行前后哈希，运行期间文件未变更。
