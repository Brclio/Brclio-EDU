# 原课程 author judge 单元测试审计

审计范围为全部 1,190 个本地课节中的 `Code` / `TabbedCode` 编辑器。存在 `judge_content.author_code` 的编辑器共 **140** 个；其中 **107** 个原数据启用 `judge`，**33** 个明确 `judge:false`。33 个关闭项保留了默认 square 测试、空白答案或异语言答案，不能算成有效单元测试练习。

| 范围 | 数量 | 当前证据 |
| --- | ---: | --- |
| 启用 Python / Python38 判题 | 95 | 真 Chromium Worker，原参考答案和原 author/ed 判题，全部返回结构化结果 |
| 启用 JavaScript 判题 | 4 | 同上，原判题自行调用 main，不使用 Node 自动入口 |
| 启用 C++ / Java 判题 | 8 | 原生隔离 runner，8/8 原样参考解答、34/34 原测试点通过 |
| 关闭的 Python 判题残留 | 31 | 原样诊断运行已记录，不视为可完成练习 |
| 关闭的 C++ 判题残留 | 2 | 原字段 `judge:false`，由 native 审计记录 |

合并浏览器与独立原生审计，原数据启用的 **107/107 编辑器、328/328 原判题测试点通过**。其中浏览器 **99/99 编辑器、294/294 测试点**；原生 C++ / Java **8/8 编辑器、34/34 测试点**。原生另有 C++、Java 各一个错误解答，共 8 个断言全部拒绝。这与其他审计的公开 challenge stdin/stdout 测试不同，单独检查 `<__educative_test_results__>` 的 `test_results` 数组，只有非空且每条 `succeeded` 都为布尔值才接受。不会将 `done` 或普通输出视作测试通过。

## 源码拼接与参考答案来源

按当前 Content 运行测试实际顺序拼接：hidden/prepend/template_head → judge_content_prepend → editor → hidden/append/template_tail → author_code → ed_code；附件使用原 additional_content。原始答案、author、ed、实际执行代码及完整源页面均记录 SHA256。全部页面在执行前后哈希一致；外部网络请求为 0。

首次 literal baseline 实际执行了全部 130 个浏览器相关项：95 个有效项直接通过、4 个有效项缺少原编辑器脚手架、31 个关闭残留报错。没有删除失败记录来制造全绿结果。

四个原 `solution_content` 只有目标函数，测试时将这个函数放回原编辑器，保留其前面的原文代码，不改参考函数：

- `009-377 / 4042e66a-9784-4443-9645-94382d93dd0b`：保留 `import numpy as np`。
- `009-377 / 514a347d-d7c2-45c0-8125-3a8717285416`：保留 `from scipy import stats` 和 NumPy 导入。
- `009-386 / 09cf9736-d2e2-4c67-940b-4af3d12c1e8e`：保留 Pandas 导入、原 `read_csv()` 和 `df = read_csv()`。
- `009-392 / f71c75c1-bb78-4670-bf72-b921071e54b2`：同样保留原数据读取代码。

实际保留文本在最终报告 `preservedScaffold` 字段。没有给课程页面自动补答案。所有 140 个 author/ed 脚本都没有引用 `edTestMetadata` / `userCode`；因此没有把未使用的 `user_code_string_format` 当成运行依赖或猜测插值规则。

## 本轮运行器修复

- `009-386` 原附件拼写为 `auto-mgp.data`，而原编辑器和 author judge 都读取 `auto-mpg.data`。运行器保留原文件，并仅在附件名、代码依赖及附件完整 SHA256 `48b830e11feee5572525f8f1691ddb9d38d3d7b7063edcd8fca672c2a5e17d8d` 匹配时提供正确名称的同字节 alias。没有修改附件或课文。
- 原空函数体会令 Pyodide import 扫描不返回依赖，随后兼容层错误显示缺 Pandas。现在先编译检查语法，返回原本正确的 `IndentationError`，避免把未完成代码误报为缺库。
- author judge 未返回 marker、无效 JSON、空数组、错误 succeeded 类型时明确 error，不能继续 done。

## 反例

99 个原始未完成编辑器全部拒绝：**92** 个返回真实非空结构化失败结果，**7** 个明确异常，0 个误通过。92 个中共 282 个测试点，269 个失败、13 个个别输入碰巧通过；没有把部分通过当整体通过。

7 个异常分别为：5 个原空函数体 `IndentationError`，`007-306` 原 getValues 不返回结果导致无法解包，`005-258` 原判题在缺少 School 实现后没有正确捕获 mySchool 未赋值。这些是未完成模板/原 judge 的错误表现，完整原参考答案均通过。

Python、JavaScript 各测试缺 marker、空数组、非法 JSON、字符串 succeeded、有效 false 结果，共 **10** 个协议探针，全部符合预期。合法失败结果仍显示 false，不被转换成执行异常或通过。

## 重现

```sh
node tests/runtime-unit-audit.mjs --output=tests/runtime-unit-baseline.json
node tests/runtime-unit-audit.mjs --enabled --scaffold --output=tests/runtime-unit-audit.json
node tests/runtime-unit-audit.mjs --negative --output=tests/runtime-unit-negative.json
node tests/runtime-unit-audit.mjs --probes --parallel=1 --output=tests/runtime-unit-protocol.json
node --test tests/runtime-unit.test.mjs
```

数据源从 public/content/pages 重新扫描，无需未提交的 data/source 原始缓存。运行器版本哈希固定在每份结果中；此审计不声称完成了所有可能学生解答的正确性证明。

## 原数据关闭的 33 个残留

这些原标志保持不变；UI 已遵循 judge:false，不再仅因为存在 author_code 就展示运行测试按钮。原 runnable 按钮不受这个判题开关影响。

| 课节 | 组件 | 语言 | solution_content |
| --- | --- | --- | --- |
| 001-1 | `3cabd3b6eee311eba4783af9d3c2d1d5` | python3 | 空白 |
| 001-2 | `123cdbb0efbb11eb940a3af9d3c2d1d5` | python3 | 空白 |
| 001-3 | `b7d2dc24f28011ebbc013af9d3c2d1d5` | python3 | 空白 |
| 001-6 | `b32266daf29011eb9e673af9d3c2d1d5` | python3 | 空白 |
| 005-227 | `0dc2513000b611ec90563af9d3c2d1d5` | python3 | 残留异语言答案 |
| 005-229 | `6370372800c011eca4b73af9d3c2d1d5` | python3 | 残留异语言答案 |
| 005-237 | `8b41fbaa03f511ec86e4acde48001122` | python3 | 残留异语言答案 |
| 005-239 | `67b2c37e03f811ec8733acde48001122` | python3 | 残留异语言答案 |
| 005-249 | `5428061c04ab11ec8fcf3af9d3c2d1d5` | python3 | 残留异语言答案 |
| 006-263 | `tab_code_0_011113bc439711ecbe523af9d3c2d1d5` | c++ | 空白 |
| 006-264 | `tab_code_0_038b0b48439711ecbe523af9d3c2d1d5` | c++ | 空白 |
| 008-340 | `1095f494-67ef-48c3-88eb-ae3d87d7107a` | python3 | 空白 |
| 009-373 | `9faa4039-4b1d-4138-bd00-33da9ec19902` | python3 | 空白 |
| 009-375 | `2f6c378c-ea3b-4678-803c-e96164dab284` | python3 | 空白 |
| 009-375 | `302eee82-c2a2-4e99-ae50-eb39c7cf2fae` | python3 | 空白 |
| 009-384 | `84942b1b-e08b-4db8-a956-3d347a1695f6` | python3 | 空白 |
| 009-384 | `a5ae8ac5-3a1a-45be-b618-68756783a363` | python3 | 空白 |
| 009-384 | `27abe37a-4e82-4a36-b617-2472f0963341` | python3 | 空白 |
| 009-384 | `2c230ff5-76d2-49b3-be11-4da23c236a98` | python3 | 空白 |
| 009-384 | `3a3030e6-3e89-42f5-8e89-3aeb2a157107` | python3 | 空白 |
| 009-384 | `af9d8b9d-2ac1-4296-857a-f6712c986fdb` | python3 | 空白 |
| 009-384 | `4ffd4383-0f64-443b-bc41-b065ce151e4c` | python3 | 空白 |
| 009-384 | `c3573201-ee75-4ebf-a7d4-154cf3560d9f` | python3 | 空白 |
| 009-384 | `873212f7-3917-4783-8c44-b7f88bd79330` | python3 | 空白 |
| 009-384 | `3d4270a6-bd5e-46e5-a422-7ed390fd9d6e` | python3 | 空白 |
| 009-388 | `c8dd3c53-34b2-47af-b3fd-62d5b95d9f96` | python3 | 空白 |
| 009-388 | `48f00d78-2f21-424d-bd1f-d5fbd9cdfe26` | python3 | 空白 |
| 009-388 | `9d573be6-f6d9-4496-a987-d258bfc2727a` | python3 | 空白 |
| 009-390 | `6c7f7af4-440a-4cdd-8a92-3577f97cf864` | python3 | 空白 |
| 009-390 | `9a798d24-983a-44ef-85c9-cd6399dbcf94` | python3 | 空白 |
| 009-400 | `43c3ece4-aa5a-4672-93c9-d991f48d8054` | python3 | 空白 |
| 009-400 | `c532918a-c65b-48d1-b6f6-82f5aab8ed7b` | python3 | 空白 |
| 010-497 | `tab_code_0_b91c70de-508b-40a8-bb97-6036fe9901d6` | python3 | 空白 |

## 修改后的旧路径定点回归

保持最终 worker 不变后，重新实际执行 13 个已本地化爬虫示例、183 个原 JS/Node/SQL 编辑器与 2 个语言入口探针，均维持已记录的预期结果。另专门重跑原公开 challenge `410`、`430` 的 4 个 stdin/stdout 测试点（含 CRLF），全部通过，证据为 `tests/runtime-unit-public-regression.json`。没有声称在这个最后版本上又执行了全部 1,686 个 Python 编辑器；之前全库结果与本轮增量回归分别保留。
