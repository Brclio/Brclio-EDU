"""Create unmasked source/local comparison images and pixel metrics (requires Pillow)."""
from PIL import Image, ImageChops, ImageStat, ImageDraw
from pathlib import Path
import json
import os

out = Path('output/editor-visual')
report = []
for source in sorted(out.glob('*-source.png')):
    name = source.name[:-11]
    local = out / f'{name}-local.png'
    if not local.exists():
        continue
    left, right = Image.open(source).convert('RGB'), Image.open(local).convert('RGB')
    row = {'name': name, 'sourceSize': left.size, 'localSize': right.size}
    if left.size == right.size:
        diff = ImageChops.difference(left, right)
        row['meanAbsoluteChannelDifference'] = round(sum(ImageStat.Stat(diff).mean) / 3, 4)
        maximum = ImageChops.lighter(ImageChops.lighter(diff.getchannel(0), diff.getchannel(1)), diff.getchannel(2))
        row['pixelsOver20Percent'] = round(sum(maximum.histogram()[21:]) / left.width / left.height * 100, 4)
        diff.save(out / f'{name}-diff.png')
    width = max(left.width, right.width)
    pair = Image.new('RGB', (width * 2, max(left.height, right.height) + 30), '#ddd')
    pair.paste(left, (0, 30))
    pair.paste(right, (width, 30))
    label = ImageDraw.Draw(pair)
    label.text((8, 8), 'SOURCE - original website', fill='#111')
    label.text((width + 8, 8), 'LOCAL - captured build', fill='#111')
    pair.save(out / f'{name}-compare.png')
    report.append(row)
(out / 'pixel-report.json').write_text(json.dumps(report, indent=2) + '\n')
html = '''<!doctype html><meta charset="utf-8"><title>Editor visual comparison</title><style>body{font:16px/1.6 system-ui;margin:32px;color:#252933;background:#f5f5f5}section{background:white;padding:24px;margin:24px 0;border:1px solid #ddd;border-radius:8px}img{max-width:100%;display:block}small{color:#666}a{color:#575bfd}</style><h1>编辑器实际截图对照</h1><p>左：原网站；右：本地。原始截图未经遮罩或像素修改。差分图为 RGB 绝对差值，黑色为相同像素。数值只是定位差异的辅助，并非整站视觉验收结论。</p><p>AI 面板内容明确存在服务差异；导图与挑战运行后的原站界面受登录/解锁限制，未计入已核验状态。</p><p>此索引汇集 35 对既有截图，并非同一次最新源码重拍全部成功。最新主重拍只完成 4 对，其后原站文章 CodeMirror 加载超时，原始失败保留在 <a href="report.json">report.json</a>。其余既有截图及非零残差仍保留；最后 Web 标题 24px 修正尚未完成主截图重拍。原生弹框后续操作专项另见 <a href="../../docs/native-web-dialog-fidelity.md">专项文档</a>，不能由此图库推定全部视觉通过。</p>'''
for row in report:
    name = row['name']
    html += f'<section><h2>{name}</h2><small>{json.dumps(row, ensure_ascii=False)}</small><p><a href="{name}-source.png">原始 source</a> · <a href="{name}-local.png">原始 local</a>'
    if 'meanAbsoluteChannelDifference' in row:
        html += f' · <a href="{name}-diff.png">差分</a>'
    html += f'</p><img src="{name}-compare.png" alt="{name} 原站与本地对照"></section>'
if (out.parent / 'editor-web-header-final/index.html').exists():
    html += '<p>后续独立补验：<a href="../editor-web-header-final/index.html">Web 标题 24px 对照</a>，标题完整裁片 RGB 差 0；头部关闭 X 保留 26 个非零像素。此局部补验不改上述主流程失败和 35 对历史记录。</p>'
if not os.environ.get('EDITOR_VISUAL_NO_HTML'):
    (out / 'index.html').write_text(html)
print(json.dumps(report, indent=2))
