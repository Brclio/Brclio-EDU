# Python 课程运行审计

本审计区分静态清点、实际执行和原站对照。已覆盖所有 1,686 个可运行 Python 编辑器的清点，其中 1,674 项实际执行、12 项静态跳过；没有把完成运行等同于原版本数值、排版或图像完全一致。课程 JSON 中的代码没有被修改。

## 清点范围

`tests/runtime-course-audit.mjs` 扫描全部课程页面中的 Code、TabbedCode，以及独立挑战的 Python 模板。挑战引用不重复计数。代码采用当前 CodeBlock 实际拼接方式：隐藏前置代码 + 原始 content/template + 隐藏后置代码；执行时传入原始 additional_content/additional_files。

- Python 编辑器共 2,457 个；运行按钮允许执行的 1,686 个：Code 1,217，TabbedCode 133，挑战模板 336。
- 另有 435 个带公开测试/判题代码的编辑器。它与“运行按钮允许执行”存在交集，不能相加。
- 239 个使用标准输入；33 个含联网依赖；99 个绘图示例；167 个含文件读写调用；44 个携带附件。均为静态扫描结果，不代表已经成功运行。
- 未发现可运行 Python 代码导入 turtle/tkinter/pygame/Qt。发现 4 段 multiprocessing，其中 3 段使用真正的 Pool，浏览器 WASM 无法等价运行。
- 完整逐段来源、imports、调用位置、附件、代码 SHA256 在 `tests/runtime-course-inventory.json`。语法解析器版本随报告记录；静态解析使用本机 Python，实际执行使用打包的 Pyodide Python 3.14。

| 依赖/API | 可运行编辑器中的出现数 | 本次处理 |
|---|---:|---|
| numpy | 236 | 全部纳入执行；没有找到 np.int/np.float 等已移除别名的实际调用，不添加无依据兼容别名 |
| pandas | 162 | 补已确认的历史 API 与原例所依赖的混合列数值行为 |
| matplotlib.pyplot | 99 | 建立 output 目录，读取保存后关闭的图像文件 |
| requests / bs4 | 30 / 20 | 既有精确 URL fixture 保留；其它联网能力不等同于离线可用 |
| seaborn | 18 | 历史 x/y 位置参数及本地 flights 数据 |
| sklearn.datasets.load_boston | 10 | 恢复官方历史数据与 Bunch 接口 |
| read_csv(delim_whitespace=True) | 9 | 转为等价的 sep 正则，拒绝互相冲突的 delimiter 参数 |
| DataFrame.append / iteritems | 2 / 1 | 运行器提供历史方法，课文仍保留原写法 |
| pandas.util.testing | 3 | 恢复课程使用的 makeTimeDataFrame；不是完整旧 testing 模块 |
| Seaborn x/y 位置参数 / DataFrame.pivot 位置参数 | 7 / 1 | 精准兼容 |
| sns.load_dataset("flights") | 3 | 本地 CSV；保留旧版完整月份名称，009/398 的 January 筛选可用 |

## 先修复运行环境，再保留原教学错误

修复前两批真实浏览器执行分别记录于 `tests/runtime-course-audit.json`（49 段）和 `tests/runtime-course-extra-audit.json`（22 段）：共 71 段原 Code，39 段完成，32 段报错。第一批含 14 个附带文件的实例，第二批含 13 个。没有运行挑战模板作为已经完成的答案。

确认的环境问题包括 output 目录不存在、保存后关闭的图没有收集、pandas 删除方法与参数、corr/mean 等混合字符串列默认行为改变、缺少 pandas.util.testing、sklearn 删除 load_boston、Seaborn 远程数据无法 TLS 读取、缺少 openpyxl，以及原站容器预置的 raw_data.csv/books.txt 未归档。当前修复位于 `src/python-worker.js`，纯 Python 依赖由 `scripts/import-runtime.mjs` 固定版本镜像。

仍然必须保留的课程原始异常包括：001/2 修改不可变字符串、001/3 修改不可变元组、001/4 主动 raise 异常。这三段不能通过吞掉异常“修复”。

静态发现的 60 个语法问题中：48 个是待填空/待实现的挑战模板；6 个是原站将 C 代码误标为 Python 的元数据问题（021/1132、1138、1144 三段、1152）；另 6 个为原课教学错误或不完整片段（001/4、002/41、024/1317、024/1330、026/1417、027/1485）。静态错误不是运行器故障的证明。

## 全量执行结果

先前 170 段抽样与绘图回归已经扩大为全量审计。`tests/runtime-course-full-audit.json` 首轮真实执行 **1,674 项**：1,338 段原 Code/TabbedCode 与 336 个原站公布的挑战解答。所有 44 个可运行附件实例、99 个绘图例都在范围内。12 项静态跳过分别为 6 段误标为 Python 的 C 代码与 6 段原课语法错误/不完整片段；未把 48 个空挑战模板当作运行器故障。

全量首轮为 1,613 项完成、60 项异常、1 项超时。随后针对新发现的环境差异、全部联网代码、全部挑战/标准输入重新执行；最终按组件取最新记录，结果见 `tests/runtime-course-full-summary.json`：

| 最新结果 | 数量 | 性质 |
|---|---:|---|
| 完成执行 | 1,632 | 含所有 336 个原站公布的挑战解答 |
| 原课程错误演示 | 32 | 作用域、不可变对象、抽象类、参数、索引与数组形状等原码行为，保留异常 |
| 原课无限生成器 | 1 | 019/1073 不终止循环，20 秒限时退出，未伪造完成 |
| 原课 `plt.chose` 拼写错误 | 3 | 008/358；保留异常，已保存的图仍返回 |
| 需要真实进程 | 3 | 024/1338–1339 multiprocessing.Pool；浏览器 WASM 不提供系统进程，由独立服务器审计处理 |
| 需要个人登录 | 3 | 024/1347 豆瓣账号/个人订单；不伪造账号响应，也不开放任意联网 |

全部 **345 个原公开测试用例通过**，99/99 绘图例均返回图像。336 个挑战执行的是原站另行提供的 `solution_code`，并非宣称学生尚未完成的模板能够直接通过。公开测试不足以覆盖所有输入分支。题 439 没有公布样例，审计明确使用满足题意的测试输入 N=12；其他人工审计输入也逐项记录来源，未冒充原站样例。

这是一次全量首轮加定向复跑的汇总，并非同一 worker 哈希的一次无间断全量运行。每个组件的最后报告、代码 SHA256、运行变体、输入来源、错误原因都可追溯；所有阶段运行期间 worker 没有变更。

新确认并修复 `fillna(method='ffill'/'bfill')`。CRLF 语义用原站公开执行器实测：`input()` 保留 `\r`，输出端将 CRLF/CR 统一为 LF。运行器保留输入 CR、在完整输出行上统一换行，既通过题 430 的姓名拼接，也通过题 410 的逐行输出。没有修改题目、答案或 expected_output。对照证据在 `tests/runtime-original-testcase-evidence.json`。

已验证兼容还包括：`Figure.gca(projection='3d')`；旧 Matplotlib 允许的对称正负误差长度（仅对称、非上下限模式，取绝对值不改变 ± 端点）；旧教材的 Seaborn 月份完整名称与分类顺序。保存图像后发生异常时，先收集图像再报告原错误。

`files` 消息返回 output 目录中的非图像产物 `{name, mime, size, url}`，URL 只由本地字节构造为 data URL；每次运行最多合计 10 MiB。超过限制明确提示。007/323 的 1 个 CSV、2 个 XLSX 与超过上限的运行器探针已验证。浏览器 UI 接收由主任务实现。

## 固定联网响应与原站环境对照

33 个联网依赖均已纳入实际执行：30 个 requests/urllib 普通代码，另 3 个 Seaborn flights 载入（已本地）。额外静态审计了原 `runnable=false` 的 024/1339 综合多进程爬虫。

`public/content/fixture-map.json` 固定 34 个精确 URL 映射，包括原有 2 个教学 HTML、当前公开抓取响应、ZOL 10 页历史列表、示例详情与原图片；不提供通用代理。`network-fixture-audit.json` 对每个原 URL 保存课程/组件位置、状态、SHA256、编码与恢复来源。25 个本轮资源已捕获，固定目标的原始响应获取缺口已归零；其中 2 个笔趣看响应有明确标注的教学兼容版。GBK 原字节保留，requests 根据 Content-Type 解码。未知网址在隔离测试及服务器中仍禁止联网。

ZOL `/1.html` 没有公开档案，使用已归档目录首页作明确标注的首页地址适配；其他页保持各自真实历史快照，日期并不相同，不宣称是同一天的完整原网站。综合爬虫还存在原始 `"{}.{}".format(host, next_image_url)` 多加点的拼写问题；其动态发现的全部图集不在有限 fixtures 内，不能宣称整个第三方网站已镜像。通过原站公开执行接口的固定 URL requests，进一步取回了笔趣看两个真实当前响应。当前站点改为 UTF-8 和新 DOM，不能冒充历史 GBK 页面。`scripts/import-biqukan-compat.py` 仅从当前原件抽取该目录页 100 个真实条目，以及对应“第一章 狐女 第1页”里公开编码呈现的 31 个真实段落，再以原课已明确给出的 GBK/旧选择器封装。没有补造后续分页内容；raw 字节与 SHA 永久保留。映射明确 `adapted:true`、`recovered:false`，详见 `biqukan-compat-audit.json`。13/13 原爬虫例已用该兼容输入离线执行通过；这证明教学操作可用，不宣称当前内容等于旧站全文。个人登录和订单不属于可匿名归档数据。

通过原站公开执行 API 测得当前服务端版本：Python 3.9.9、NumPy 1.22.4、Pandas 1.4.2、Matplotlib 3.1.2、Seaborn 0.11.2、scikit-learn 1.1.1、SciPy 1.8.1。原教材部分示例更早于这些版本。原站自身当前 Seaborn 导入也可能受其裁剪 unittest 环境影响；不能将当前服务器输出视作所有历史图的绝对基准。版本证据位于 `runtime-data/original-runtime-evidence.json`。

原站 SongTi/xkcd 等字体实际也回退 DejaVu Sans；原站字体文件和本地打包字体的 SHA256 均为 `3fdf69cabf06049ea70a00b5919340e2ce1e6d02b0cc3c4b44fb6801bd1e0d22`。只给这些缺失名称登记相同字节的回退别名，消除 findfont 警告，没有引入不同字体。证据和查询代码在 `runtime-data/font-evidence.json`。Matplotlib 版本不同仍可能影响图表排版，不宣称图像像素完全相同。

## 内置数据恢复证据

`public/content/runtime-data/manifest.json` 记录原始 URL、文件 SHA256、字节数、课程/页面/组件，以及可复现的公开请求。`scripts/import-runtime-data.py` 不依赖登录，也没有尝试绕过访问控制。

- `raw_data.csv`：通过原站公开 `/api/course/code/execute`，在 007/307 的课程上下文读取课程指定文件。原始 40,919 字节、780 条采购记录。与课程提供的首两行 Lisim78 / Lisovynya38 核对一致。原站服务端预置文件，并非学生需要先生成的文件。6 个普通可运行例直接引用它；判题/解答中也使用它。
- `books.txt`：同样从 019/1091 的公开课程执行上下文恢复原始 68 字节：Harry Potter、The Hunger Games、Pride and Prejudice、Gone with the Wind。原课程说明明确写明这是服务器内置文件。
- Boston：来自 scikit-learn 官方 `1.1.3` 标签中的 CSV 和原始说明文件，506 条记录；保留原课程使用的历史数据，不替换成其他住房数据。
- Flights：来自 Seaborn 官方数据仓库的 144 条记录。旧课使用完整月份名称；当前 Seaborn 新版本会缩短为 Jan 等，兼容载入保留原教材行为。
- Excel：镜像 openpyxl 3.1.5 与 et_xmlfile 2.0.0，SHA256 来自固定版本 PyPI 元数据，运行时无 CDN 后备。

参考源：[pandas 2.0 变更](https://pandas.pydata.org/pandas-docs/version/2.0/whatsnew/v2.0.0.html)、[pandas 3.0 变更](https://pandas.pydata.org/pandas-docs/version/3.0/whatsnew/v3.0.0.html)、[Seaborn Flights 数据](https://github.com/mwaskom/seaborn-data/blob/master/flights.csv)、[Boston 历史 CSV](https://github.com/scikit-learn/scikit-learn/blob/1.1.3/sklearn/datasets/data/boston_house_prices.csv)。

## 复现

```sh
node tests/runtime-course-audit.mjs
node tests/runtime-course-audit.mjs --run --all --parallel=3 --output=tests/runtime-course-full-audit.json
node tests/runtime-course-audit.mjs --run --filter=007-322,008-354,008-367 --network --parallel=3 --output=tests/runtime-course-network-final.json
node tests/runtime-course-audit.mjs --run --all --challenges --parallel=3 --output=tests/runtime-course-challenge-audit.json
node tests/runtime-course-audit.mjs --run --filter=024-1330,024-1331 --parallel=3 --output=tests/runtime-course-biqukan-recovery.json
node tests/summarize-runtime-audit.mjs
node --test tests/runtime-compat.test.mjs
python3 scripts/import-runtime-data.py
python3 scripts/import-network-fixtures.py
python3 scripts/import-biqukan-compat.py
node scripts/import-runtime.mjs
```

每段执行使用新浏览器 Worker，加载真实 `src/python-worker.js`，20 秒执行限时。外部网络被阻止，本地资源可正常请求。报告记录运行前后 worker/fixture SHA；全量首轮较早尚未记录 fixture SHA，联网用最新完整复跑报告覆盖。图片报告统计产物数量，不声称像素与原站相同。服务器运行器部署及其多进程验证在独立报告中，不由本浏览器审计代替。
