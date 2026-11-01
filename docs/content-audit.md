# 课程导入审计

来源：https://edu.py2fun.com/learn#/course/list
抓取时间（UTC）：2026-11-01T12:46:22.120950+00:00

全部请求匿名执行，不发送 Cookie 或身份认证。目录中的 lock 状态仅保留为来源元数据；是否导入由公开 API 的实际响应决定。

- 分类：8
- 课程：28
- 课节：1190 / 1190
- 引用组件：2805 / 2805
- 代码挑战：479
- 本地媒体：3057
- 未成功资源：0

## 各课程

| 课程 | 名称 | 导入课节 |
| --- | --- | ---: |
| 015 | Python 小白入门课New | 39 |
| 019 | Python 小白进阶课 | 34 |
| 002 | 从零开始学Python | 75 |
| 018 | Python 数据结构入门 | 24 |
| 027 | Python 面试挑战课 | 101 |
| 035 | 图解算法与数据结构 | 55 |
| 004 | 数据结构与算法 | 88 |
| 005 | Python面向对象编程 | 57 |
| 010 | python算法设计与分析-实战课 | 132 |
| 011 | 30天学会Python - 简单有趣 | 36 |
| 013 | 30天学会Python - 进阶课 | 22 |
| 017 | Python 小白数据分析 | 24 |
| 009 | python 数据分析与可视化 | 34 |
| 008 | Matplotlib Python 数据可视化 | 32 |
| 007 | Pandas数据分析与处理入门 | 42 |
| 006 | 二分查找算法小课 | 12 |
| 003 | 计算机编程导论 | 30 |
| 001 | python 快速入门 | 10 |
| 020 | SQL 数据库入门 | 27 |
| 021 | C语言入门 | 46 |
| 023 | C++ 入门课程 | 42 |
| 016 | Go 新手入门 | 38 |
| 022 | JavaScript | 59 |
| 025 | Java入门编程 | 36 |
| 026 | 递归算法入门课 | 15 |
| 034 | Python NumPy 数据科学 | 19 |
| 037 | 算法复杂度分析入门 | 23 |
| 024 | Python爬虫入门实战课 | 38 |

## 组件类型

{
  "QuizRef": 1190,
  "Image": 786,
  "MarkdownEditor": 6158,
  "Note": 945,
  "Code": 2588,
  "Coach": 196,
  "MxGraphWidget": 167,
  "Quiz": 52,
  "Columns": 32,
  "CanvasAnimation": 163,
  "MxGraph": 1078,
  "TabbedCode": 141,
  "Knowledge": 932,
  "ChallengeRef": 246,
  "QuestionRef": 204,
  "CanvasText": 3052,
  "Stack": 61,
  "SpoilerEditor": 29,
  "EducativeArray": 559,
  "BinaryTree": 266,
  "Matrix": 96,
  "CanvasImage": 1,
  "MarkMap": 1,
  "Graphviz": 2,
  "SequenceDiagrams": 2,
  "RunJS": 7,
  "css": 7,
  "exercise": 7,
  "hiddenjs": 7,
  "html": 7,
  "js": 7,
  "JsHtml": 211
}

## 题型

{
  "single_choice": 837,
  "drag_and_drop": 140,
  "reorder": 28,
  "type_in": 143,
  "multi_type_in": 434,
  "mult_choice": 43
}

## 可复现命令

`python3 scripts/import-courses.py` 使用匿名 API 缓存；`--refresh` 重新获取，`--skip-assets` 跳过媒体下载。

原始响应保存在 `data/source/api/`；课程目录、课节正文及图片位于 `public/content/`。源 API 的字段和课程文本保持原样，媒体 URL 替换为本地路径。引用组件使用 `resolved` 字段内联，原始引用保留。

交互实现与课程内容导入分开验收：课程 API 有些代码题没有公开测试用例，不能将运行成功等同于通过判题。

## 初次抓取失败历史（已恢复，见末节）

- {'url': 'https://cdn.py2fun.com/course/spider/03/img/bignet.mp4', 'reason': 'HTTP Error 404: Not Found', 'kind': 'asset'}

## SVG 图像依赖审计

图解SVG及动画帧中嵌入 859 处图像引用，使其不依赖源站加载子图像。保留原始SVG于 `data/source/svg-assets/`。

超24MiB视频按8MiB分块，原始文件保存在 `data/source/media/`，`media-index.json` 保留完整字节长度与SHA-256，无转码。通过 `/api/media/{id}` 的 Range 接口播放。

动画帧SVG外置为独立本地文件，`canvas_objects[].file` 是显示路径，其余帧元数据保留；原始内嵌SVG可从 `data/source/api/` 恢复。

SVG依赖失败：1
- {'url': 'https://190621-dot-educative-hesive.appspot.com/api/collection/10370001/5474278013140992/page/5420466032345088/image/5723261830692864', 'reason': 'HTTP Error 404: Not Found', 'kind': 'svg_dependency'}

## 恢复前运行资源审计（历史）

{
  "attachment_instances": 50,
  "unique_attachment_files": 14,
  "attachment_names": [
    "adult.data",
    "auto-mgp.data",
    "auto-mpg.data",
    "fake_fruit.json",
    "hello.py",
    "mymodule.py",
    "sample.csv",
    "sample1.csv",
    "sample2.csv",
    "stack.py",
    "type.csv"
  ],
  "render_dependency_candidates": 5,
  "new_local_dependencies": 2,
  "render_failures": [
    {
      "url": "https://cdn.py2fun.com/course/spider/03/img/bi\tqnet.mp4",
      "reason": "URL can't contain control characters. '/course/spider/03/img/bi\\tqnet.mp4' (found at least '\\t')",
      "kind": "render_dependency",
      "pages": [
        "024-1329.json"
      ]
    },
    {
      "url": "https://img3.doubanio.com/f/book/e87e3a06f234a06e09ded94a5855bc6f50390ccd/css/book/master.css",
      "reason": "HTTP Error 418: ",
      "kind": "render_dependency",
      "pages": [
        "024-1325.json"
      ]
    },
    {
      "url": "https://sjbz-fd.zol-img.com.cn/t_s320x510c5/g6/M00/0E/07/ChMkKV-NICeIOAUKAEr-VrVkwWAAAD5UQDbYv8ASv5u449.jpg",
      "reason": "HTTP Error 403: Forbidden",
      "kind": "render_dependency",
      "pages": [
        "024-1334.json"
      ]
    }
  ],
  "fixture_map": {
    "http://api.pythontip.com/course/fake_baidu": {
      "path": "/content/fixtures/fake-baidu.html",
      "source": "024-1327 / Code 385251ae-5d0c-3646-a8b6-e56dfe04bdff"
    }
  },
  "fixture_endpoint_status": [
    {
      "url": "http://api.pythontip.com/course/hello_html",
      "reason": "HTTP 502 Bad Gateway",
      "kind": "exercise_fixture"
    },
    {
      "url": "http://api.pythontip.com/course/fake_baidu",
      "reason": "HTTP 502; identical lesson-supplied HTML is available locally",
      "kind": "exercise_fixture",
      "local_fixture": "/content/fixtures/fake-baidu.html"
    }
  ],
  "changes": {
    "lesson_links": 60,
    "course_links": 56,
    "changed_pages_or_challenges": 60
  },
  "external_crawling_examples": "Original web-scraping targets (Baidu, Douban, novel and wallpaper sites), package installation instructions and knowledge reference hyperlinks are preserved. They are exercise targets or references, not remotely stored course content."
}

## 失效资源恢复结果

当前必需资源未解决项为 0。3 个原文件通过原站纠正URL或公开归档取回；1 个教学HTML从原课件完整源码导出；2 个素材根据原课程证据重建并明确标注。

{
  "summary": {
    "downloaded_original_files": 3,
    "exported_original_html": 1,
    "reconstructed_from_original_evidence": 2,
    "unresolved_required_resources": 0
  },
  "recovered": [
    {
      "originals": [
        "https://cdn.py2fun.com/course/spider/03/img/biqnet.mp4",
        "https://cdn.py2fun.com/course/spider/03/img/bignet.mp4",
        "https://cdn.py2fun.com/course/spider/03/img/bi\tqnet.mp4"
      ],
      "path": "/content/dependencies/biqnet.mp4",
      "page": "024-1329",
      "method": "Browser URL normalization removes an embedded tab from bi\\tqnet.mp4; the lesson HTML copy had the separate bignet typo.",
      "reconstructed": false,
      "retrieved_from": "https://cdn.py2fun.com/course/spider/03/img/biqnet.mp4",
      "bytes": 18911084,
      "sha256": "2184398f4b26d5d2a1192fcc9597f3bae3ce914ee3740911ac2c04b703c8a451",
      "mime": "video/mp4"
    },
    {
      "originals": [
        "https://img3.doubanio.com/f/book/e87e3a06f234a06e09ded94a5855bc6f50390ccd/css/book/master.css"
      ],
      "path": "/content/dependencies/douban.css",
      "page": "024-1325",
      "method": "Original CSS restored from Internet Archive snapshot 2021-03-17.",
      "reconstructed": false,
      "retrieved_from": "https://web.archive.org/web/20210317012743id_/https://img3.doubanio.com/f/book/e87e3a06f234a06e09ded94a5855bc6f50390ccd/css/book/master.css",
      "bytes": 149244,
      "sha256": "91f7dbd1365a75ed9c432432f1331a6734a91bce78fb14c6160d6e91c68aa274",
      "mime": "text/css"
    },
    {
      "originals": [
        "https://sjbz-fd.zol-img.com.cn/t_s320x510c5/g6/M00/0E/07/ChMkKV-NICeIOAUKAEr-VrVkwWAAAD5UQDbYv8ASv5u449.jpg"
      ],
      "path": "/content/dependencies/wallpaper.jpg",
      "page": "024-1334",
      "method": "Original JPEG restored from Internet Archive snapshot 2020-11-23.",
      "reconstructed": false,
      "retrieved_from": "https://web.archive.org/web/20201123140617id_/https://sjbz-fd.zol-img.com.cn/t_s320x510c5/g6/M00/0E/07/ChMkKV-NICeIOAUKAEr-VrVkwWAAAD5UQDbYv8ASv5u449.jpg",
      "bytes": 37385,
      "sha256": "0f0135ffe55bbed8ac9e5143c85c9af1cad3790e991f30057230c5b1639e504f",
      "mime": "image/jpeg"
    },
    {
      "originals": [
        "https://190621-dot-educative-hesive.appspot.com/api/collection/10370001/5474278013140992/page/5420466032345088/image/5723261830692864"
      ],
      "path": "/content/recovered/stack-push-arrow.svg",
      "page": "004-119",
      "method": "Re-rendered from original frame objects_dict mxGraph model and official Slender Left Arrow stencil, preserving geometry, rotation, colors and stroke. This is a reconstruction, not the lost source file.",
      "reconstructed": true,
      "stencil_source": "https://raw.githubusercontent.com/jgraph/drawio/v20.8.16/src/main/webapp/stencils/arrows.xml",
      "patched_svg_assets": [
        "/content/assets/8fe6487098cd43fa8857.svg",
        "/content/assets/9b971c9df295b0159b93.svg",
        "/content/assets/32d9fe307a8cdd3fc2f1.svg",
        "/content/assets/991e3b268e59baacf59c.svg",
        "/content/assets/bdfb91a3c94e576d294c.svg"
      ]
    },
    {
      "originals": [
        "http://api.pythontip.com/course/hello_html"
      ],
      "path": "/content/fixtures/hello-html.html",
      "pages": [
        "024-1326",
        "024-1328"
      ],
      "method": "Exact visible DOM from original course screenshot 024-1328; page title and appearance confirmed by screenshot 024-1326.",
      "reconstructed": true
    },
    {
      "originals": [
        "http://api.pythontip.com/course/fake_baidu"
      ],
      "path": "/content/fixtures/fake-baidu.html",
      "page": "024-1327",
      "method": "Exported the complete HTML already present in the original lesson Code component; no replacement text invented.",
      "reconstructed": false,
      "recovery_type": "exported_original_html"
    }
  ],
  "fixture_map": {
    "http://api.pythontip.com/course/fake_baidu": {
      "path": "/content/fixtures/fake-baidu.html",
      "source": "024-1327 / Code 385251ae-5d0c-3646-a8b6-e56dfe04bdff"
    },
    "http://api.pythontip.com/course/hello_html": {
      "path": "/content/fixtures/hello-html.html",
      "reconstructed": true,
      "source": "Exact visible DOM from original course screenshot 024-1328; page title and appearance confirmed by screenshot 024-1326.",
      "evidence": [
        "/content/assets/3d15310d283264478709.png",
        "/content/assets/092b5a8fd988c6c75643.png"
      ]
    }
  },
  "changed_pages": [],
  "remaining_required_resource_failures": [],
  "unused_dependencies": [
    {
      "asset": "/content/dependencies/douban.css",
      "count": 103,
      "type": "site-wide CSS icon URLs",
      "evidence": "Chromium computed styles checked every original HTML example DOM element and ::before/::after; backgroundImage/listStyleImage/borderImageSource/maskImage/content/cursor contained zero URL usages. These icons are not used by the supplied author-introduction example."
    }
  ],
  "external_web_scraping": "Live crawling examples keep original target URLs. Their target websites are not course assets; browser sandbox/runtime network support is a separate execution constraint.",
  "reproduce": "python3 scripts/import-courses.py (full pipeline); python3 scripts/import-recover-resources.py (recover only, no course refetch); python3 scripts/import-verify.py (local integrity check)"
}
