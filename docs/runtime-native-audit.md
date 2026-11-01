# 原生语言运行与判题验收

2026-11-02，在已部署的隔离 Docker 运行器上完成真实课程执行。本报告统计原生工具链与 Python 多进程示例；浏览器 Python、JavaScript、SQL 等另见运行审计文档。退出码为 0 的演示程序不等同于答案正确，教材错误示范也不改写成通过。

## 覆盖与结果

扫描全部 1,190 个课节与 479 个独立挑战文件，以完整执行请求的 SHA-256 去重。挑战使用课程公开的参考答案与公开用例；课程示例保留原始附加文件、前后置代码。原计划 414 个任务，人工核对输入说明后补入两个有明确样例的 C 程序，最终为 416 个。

| 项目 | 实测结果 |
| --- | ---: |
| 去重执行任务 | 416 |
| 有已知输出的任务 | 63 |
| 已知输出检查 | 90 / 90 通过 |
| 没有公开预期输出、退出码为 0 的示例 | 343 |
| 保留原行为的教学错误或源片段问题 | 10 |
| 独立作者测试题 | 8 / 8 通过 |
| 作者测试原始断言 | 34 / 34 通过 |
| C++ / Java 明确错误答案负例 | 2 个程序、8 / 8 断言正确拒绝 |

416 个任务按语言为 C++ 123、C 112、Go 95、Java 75、Python 多进程 3、Shell 2，C#、PHP、Ruby、Rust、Swift、TypeScript 各 1 个。部署 smoke 另真实验证了 15 种语言，但不将 smoke 计入上述课程正确性数字。

205 个源组件标为不可运行，未强行执行。需要输入的 28 处出现去重为 24 个例子，其中两例有明确的原文输入，已经执行并检查输出；其余 22 个需要学习者输入，未编造输入或宣称通过。清单在 `tests/runner-native-stdin-review.json`。

## 判题与修复范围

Java 原例允许辅助类型为 public、main 位于另一个包可见类型，也存在单编辑器中的多个 public 顶层类型。运行器按实际 main 选择入口，并按顶层类型拆分源文件，保留包名与 import，嵌套类型不拆分。修复后重跑全部 88 条公开挑战用例、两个 C 输入样例及六个 Java 演示；公开参考答案均未修改。

输出比较将 CRLF 与单独 CR 归一化为 LF，仅移除结尾空白，保留开头空格；标准输入原字节不改。每次运行仍采用同一服务的资源限制和文件锁，不使用无限制宿主执行。

作者测试来自 006/263、006/265、006/268，共 4 个 C++ 与 4 个 Java 版本。测试按生产界面相同顺序拼接原前置代码、公开参考答案、后置代码、作者代码及框架代码，解析原始 XML 包裹的 JSON `test_results`。没有修改或反转义课程字段。另有两个 `judge:false` 的 C++ 残留框架，界面不把它们当作可提交判题的练习。

负例仅把 006/263 两种语言的参考函数返回值改为 `-999`，作者断言保持原样：两个程序均编译成功、正常退出，全部八个断言返回 `succeeded:false`。原站公开 C++ judge 同题也通过四个断言；原站 Java judge 缺失 Arrays import 而编译失败。本站使用数据中完整 `judge_content_prepend`，实际通过，不复制这个原服务缺陷。

远程客户端协议测试覆盖缺失标记、非法 JSON、缺字段、非数组、空数组、空项及非布尔 `succeeded`，均必须报错而非完成；合法失败结果保持失败。即使有合法断言输出，进程超时、非零退出或输出截断也不能发出完成消息。`tests/execution.test.ts` 的 19 项测试通过。

## 十个保留原行为的例子

以下项目仍在原始结果中标记为编译或运行错误，分类说明不会把它们变成正确性通过。

| 课程位置 | 原始行为与实际结果 |
| --- | --- |
| 021/1162，`0c0b0d77…` | 演示打开不存在文件，代码主动 `exit(EXIT_FAILURE)`，返回 1。 |
| 021/1165，`1e20c901…` | 条件编译示意片段没有 main，链接失败。 |
| 021/1124，`b737b0b0…` | 单行变量声明没有 main；原站执行 API 同样失败。 |
| 021/1159，`53072bfa…` | 未附 myfile.txt，源码不检查 fopen 结果，段错误；原站同样发生。 |
| 021/1162，`2c6a7fdf…` | `extern int errno` 缺少 errno.h，TLS 链接错误；原站同样发生。 |
| 021/1162，`0f018562…` | 演示 perror / strerror 后主动返回失败。 |
| 021/1161，`384598a8…` | 检查除数为 0 后主动返回失败。 |
| 023/1272，`4d02f942…` | 课文明示不能仅按返回类型重载，编译失败。 |
| 023/1250，`054028ad…` | 课文演示无限循环，达到 64 KiB 输出上限后停止。 |
| 016/994，`07fec6b8…` | 课文演示越过作用域访问 x，Go 编译失败。 |

完整组件 ID、课程原文说明和分类见 `tests/runner-native-review.json`；三例 C 的原站执行响应见 `tests/runner-native-original-c-evidence.json`。

## 证据与复现

- `tests/runner-native-plan.json`、`runner-native-results.json`：原始 414 个请求计划及第一轮实际结果。
- `tests/runner-native-postfix-plan.json`、`runner-native-postfix-results.json`：Java 修复后的 69 个任务复验，包含全部公开用例与两例原文输入。
- `tests/runner-native-final-results.json`：416 个最新结果，保留此前尝试和来源结果文件。
- `tests/runner-author-baseline.json`、`runner-author-negative.json`：原始作者断言与错误答案结果。
- `tests/runner-author-original-cpp.json`、`runner-author-original-java.json`：原站公开 judge 实测响应。

本地只准备执行清单，不运行学员源码：

```sh
python3 runner/native-audit.py --prepare
python3 runner/author-audit.py --prepare
python3 runner/author-audit.py --prepare --negative --plan tests/runner-author-negative-plan.json
node --import tsx --test tests/execution.test.ts
python3 -m unittest discover -s tests -p 'runner_test.py'
```

远端在既有服务安装目录载入服务环境、复制脚本与清单后，管理员显式执行：

```sh
python native-audit.py --execute --plan runner-native-plan.json --output runner-native-results.json
python author-audit.py --execute --plan runner-author-plan.json --output runner-author-baseline.json
python author-audit.py --execute --plan runner-author-negative-plan.json --output runner-author-negative.json
```

这些审计串行调用真实 `server.execute_request`，与在线请求共用文件锁；不启动额外服务、不增加容器资源、不绕过容器隔离。每个结果及时写盘，避免中断后重复整个审计。完整公开测试通过不代表隐藏测试、全部输入、实时外部网络或逐像素交互与原站完全相同。

## 审计后的服务基线

2026-11-02 02:14（北京时间）进行一次只读收尾检查，没有再执行课程容器。部署前登记的 21 份 Nginx 配置 SHA-256 均未改变；14 个旧站根路径响应全部匹配既有基线（11 个 200、两个原有 502、一个原有 404），没有把既有异常归因于本次部署或宣称旧站全部正常。运行器 `/health` 返回 200，15 种语言均可用，最大并发仍为 1，运行时限 40 秒，无遗留执行容器。包含域名的详细运维证据保留于未跟踪的 `data/source/server/final-audit-baseline.json`。
