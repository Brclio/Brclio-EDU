#!/usr/bin/env python3
"""Compare unmodified full-height source/local Article Quiz screenshots."""
import json
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[1]
audit = json.loads((root/'tests/article-quiz-full-visual.json').read_text())
rows = []
for item in audit['rows']:
    source = np.asarray(Image.open(root/item['sides']['source']['path']).convert('RGB'))
    local = np.asarray(Image.open(root/item['sides']['local']['path']).convert('RGB'))
    row = {key:item[key] for key in ('file','componentId','questionId','index','width','state','sourceUiReachable')}
    row['sourceSize'] = list(source.shape[:2][::-1]); row['localSize'] = list(local.shape[:2][::-1])
    row['sameSize'] = source.shape == local.shape
    if row['sameSize']:
        delta = np.abs(source.astype(np.int16)-local.astype(np.int16)).max(axis=2)
        row.update(changedPixels=int((delta>0).sum()),over16Pixels=int((delta>16).sum()),pixelCount=int(delta.size),maxChannelDelta=int(delta.max()),meanChannelDelta=float(np.abs(source.astype(np.int16)-local.astype(np.int16)).mean()))
        row['over16Percent'] = 100*row['over16Pixels']/row['pixelCount']
    rows.append(row)
report = {'generatedAt':datetime.now(timezone.utc).isoformat(),'captureCompletedAt':audit.get('localReplayCompletedAt') or audit.get('completedAt'),'originalReferenceCapturedAt':audit.get('referenceCapture',{}).get('completedAt'),'sourceAudit':'tests/article-quiz-full-visual.json','snapshotManifest':audit['snapshotManifest'],'method':'Unmodified full-height PNGs, no resampling, masking or alignment. Strict RGB and max-channel delta >16 are both reported. Question 179 uses an explicitly marked independent visual fixture; it has no visible arrow navigation but is keyboard reachable (see the supplemental keyboard audit).','rows':rows,'summary':{'states':len(rows),'captureErrors':len(audit['errors']),'resourceErrors':len(audit.get('resourceErrors',[])),'sourceScreenshotsUnchanged':audit.get('sourceScreenshotsUnchanged'),'sameSize':sum(r['sameSize'] for r in rows),'strictPixelIdentical':sum(r.get('changedPixels')==0 for r in rows),'zeroPixelsOver16':sum(r.get('over16Pixels')==0 for r in rows),'maximumOver16Percent':max((r.get('over16Percent',0) for r in rows),default=0)}}
(root/'tests/article-quiz-full-pixel-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report['summary'],indent=2))
print('Largest pixel differences:')
for r in sorted(rows,key=lambda r:r.get('over16Percent',100),reverse=True)[:20]:
    print(r['file'],r['questionId'],r['width'],r['state'],r['sourceSize'],r['localSize'],r.get('over16Percent'))
