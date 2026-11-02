#!/usr/bin/env python3
"""Compare same-browser captures without image alignment, scaling, or masking."""
import json
from pathlib import Path
from datetime import datetime, timezone
import numpy as np
from PIL import Image, ImageDraw

def compare(source, local):
    a=np.array(Image.open(source).convert('RGB'));b=np.array(Image.open(local).convert('RGB'))
    result={'sourceSize':[a.shape[1],a.shape[0]],'localSize':[b.shape[1],b.shape[0]]}
    if a.shape!=b.shape:return {**result,'dimensionMismatch':True}
    d=np.max(np.abs(a.astype(int)-b.astype(int)),axis=2)
    return {**result,'pixels':int(d.size),'differentPixels':int((d>0).sum()),'differentPixelsOver16':int((d>16).sum()),'differentPercentOver16':round(float((d>16).mean()*100),6),'maxChannelDifference':int(d.max())}

source=json.loads(Path('tests/quiz-visual-audit.json').read_text());rows=[]
for row in source['rows']:
    rows.append({**{k:row[k] for k in ['mode','kind','viewport','state']},**compare(row['sides']['source']['screenshot'],row['sides']['local']['screenshot'])})
feedback=json.loads(Path('tests/quiz-feedback-visual-audit.json').read_text());feedback_rows=[]
for row in feedback['rows']:
    feedback_rows.append({**{k:row[k] for k in ['width','state']},**compare(row['sides']['source']['path'],row['sides']['local']['path'])})
report={'generatedAt':datetime.now(timezone.utc).isoformat(),'sourceReport':source['completedAt'],'metric':'Absolute maximum RGB channel difference. No alignment, resizing, masking, or antialias removal. Tolerance 16 is reported additionally alongside strict differences. Each viewport is reset to its native scroll origin before capture. Retry random option order alone is synchronized after original retry/empty-answer assertions.','rows':rows,'actualAppFeedback':feedback_rows,'summary':{'states':len(rows),'dimensionMismatches':sum(x.get('dimensionMismatch',False) for x in rows),'zeroDifferenceStates':sum(x.get('differentPixels')==0 for x in rows),'zeroDifferenceOver16States':sum(x.get('differentPixelsOver16')==0 for x in rows),'actualAppFeedbackStates':len(feedback_rows),'actualAppFeedbackStrictZeroDifference':sum(x.get('differentPixels')==0 for x in feedback_rows)}}
Path('tests/quiz-pixel-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
# Review contact sheets supplement the full resolution source/local pairs; they are not used for metrics.
for width in [1280,390]:
    entries=[r for r in source['rows'] if r['viewport']['width']==width and r['state'] in ['blank','wrong','correct']]
    tiles=[]
    for row in entries:
        source_image=Image.open(row['sides']['source']['screenshot']).convert('RGB');local_image=Image.open(row['sides']['local']['screenshot']).convert('RGB')
        max_height=min(360,max(source_image.height,local_image.height));factor=min(1,380/source_image.width,max_height/source_image.height)
        dimensions=(round(source_image.width*factor),round(source_image.height*factor));source_image=source_image.resize(dimensions);local_image=local_image.resize(dimensions)
        tile=Image.new('RGB',(790,dimensions[1]+25),'#eee');draw=ImageDraw.Draw(tile);draw.text((4,4),f"{row['mode']} / {row['kind']} / {row['state']} | SOURCE (left) / LOCAL (right)",fill='#111');tile.paste(source_image,(0,25));tile.paste(local_image,(400,25));tiles.append(tile)
    for index in range(0,len(tiles),6):
        group=tiles[index:index+6];sheet=Image.new('RGB',(790,sum(t.height+10 for t in group)),'#ccc');y=0
        for tile in group:sheet.paste(tile,(0,y));y+=tile.height+10
        sheet.save(f'output/quiz-visual/review-{width}-{index//6+1}.png')
print(json.dumps(report['summary'],indent=2))
for row in rows:
    if row.get('differentPixelsOver16',1):print(row['mode'],row['kind'],row['viewport']['width'],row['state'],row.get('differentPercentOver16','dimension mismatch'))
