# 网页示例原生弹框专项（2026-11-02）

本地课程现在通过顶层页面的真实浏览器 `alert`、`prompt`、`confirm` 显示弹框。JsHtml / RunJS、文章内嵌网页、Solo 全屏网页，以及通用 CodeBlock 的 HTML 运行入口均接入同一个桥接。没有继续使用自制 HTML dialog 代替这些产品入口的原生弹框。

`src/native-web-dialogs.ts` 只接受当前 iframe 的 WindowProxy、独立随机通道和 opaque origin 发来的有效请求。iframe 保持 `sandbox="allow-scripts allow-forms"`，没有添加 `allow-same-origin`。`allow-forms` 来自原课程真实提交行为的必要修复：仅 scripts 的沙箱会在 onsubmit 之前阻止表单提交。浏览器实际弹框属于本地域名，这与完整本地化的运行位置一致。

`src/native-dialog-transform.ts` 使用本地 Acorn 解析执行副本，识别内建弹框调用、词法绑定、包含调用的函数及其调用者；以 await 保留已测试课程的返回值和后续执行顺序。HTML 内嵌脚本、后续脚本和 inline 事件处理器也纳入转换。编辑器里原始课程代码及用户编辑不会被异步转换内容覆盖。表单在异步检查为 false 时保持原页，为 true 时在下一 task 通过 requestSubmit 重放一次；这避免 Chrome 在原提交算法的 microtask 内忽略再次 requestSubmit。

## 实际执行证据

- `tests/native-dialog-audit.json`（10:56:08 UTC）：全库 22 个含弹框的 JsHtml 原例全部通过。原始课程脚本在与原版 Rmt 相同权限的未加 sandbox iframe 中执行，本地副本使用正式 builder 和 native bridge；比较真实 browser dialog 事件的类型、文字、默认值、顺序及原有错误。附加 4 组覆盖 prompt 输入/取消 null、嵌套函数返回与副作用顺序、多个 HTML 内嵌脚本与后续 JS 顺序、错误来源/通道拒绝。0 外部请求、0 新错误；父页面 DOM 不可被 iframe 读取。
- `tests/native-dialog-app-audit.json`（10:54:43 UTC）：5 组通过。真实 Solo 022/1201 的 prompt→alert 与 confirm 取消→alert，原编辑器代码前后相同；真实 Article Content 表单无效输入弹框且不 POST，有效输入恰好 POST 一次；13 个原 HTML Code 块逐个保持原源码和不可运行控件；在明确启用运行的衍生 fixture 中，真实粘贴 HTML→运行→prompt/alert，第二次同源码 Run 再次触发相同原生弹框。
- **上述 13 个原 HTML Code 全部 `runnable=false`**，因此 HTML Code 的运行专项使用明确标注的衍生 fixture，不把它算作原文中存在的可运行例子。
- `tests/runtime-web-audit.json`（10:56:01 UTC）：90 个可运行网页示例重新实际执行，31 个结果断言全部通过，0 非预期错误、0 失效图片、0 外部请求。原例 `X is not defined` 大小写错误原样保留并分类，不修成不同课程内容。

三份最终报告都记录运行前后 5 个模块的实际 SHA-256：Content、content-web、native-dialog-transform、native-web-dialogs、SourceWebPreview；均未变化。单元检查同时将 90 例报告绑定这些当前文件，后续改动不能仅改报告哈希而跳过真实执行。

## 范围与限制

原站页面使用同源、未加 sandbox 的预览 iframe；本地继续隔离用户代码。此次验证覆盖现有 22 原例、90 网页及上述实际操作，不保证任意用户 JavaScript 在异步转换后与同步语言语义完全等价。例如构造器/访问器中等待弹框、动态 eval、任意回调协议与动态脚本没有全称等价保证；转换器对无法等待的构造器/访问器给出明确错误。此限制不能被全量课程通过数字抹去。

对照原例中的 Math.random 仅在两侧测试环境固定为 0.25，用于比较随机弹框内容；生产代码没有固定随机数。实际原生弹框事件验证不是逐像素图像等价声明，也不覆盖 AI 或原站账号后台。
