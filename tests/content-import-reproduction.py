#!/usr/bin/env python3
"""Rebuild in an isolated copy; never writes the current published course data."""
import hashlib,json,pathlib,shutil,subprocess,tempfile,time
ROOT=pathlib.Path(__file__).resolve().parents[1]
work=pathlib.Path(tempfile.mkdtemp(prefix='brclio-import-audit-'))
def copytree(src,dst):
 dst.parent.mkdir(parents=True,exist_ok=True)
 # APFS clone avoids copying over 1 GiB of immutable source/media bytes.
 result=subprocess.run(['cp','-cR',str(src),str(dst)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 if result.returncode:
  if dst.exists():shutil.rmtree(dst)
  shutil.copytree(src,dst)
meta={'startedAt':time.time(),'isolation':'temporary copy of scripts, public/content and anonymous source caches; node_modules linked read-only by the import process','originalFixtureMapEntries':len(json.loads((ROOT/'public/content/fixture-map.json').read_text()))}
try:
 for rel in ['scripts','public/content','data/source/api','data/source/svg-assets','data/source/media','data/source/network-fixtures','data/source/runtime-data']:copytree(ROOT/rel,work/rel)
 for rel in ['data/source/svg-failures.json','docs/content-audit.md']:
  dst=work/rel;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(ROOT/rel,dst)
 (work/'node_modules').symlink_to(ROOT/'node_modules',target_is_directory=True);(work/'tests').mkdir()
 log=ROOT/'data/source/content-import-reproduction.log'
 with log.open('w')as output:
  result=subprocess.run(['python3','scripts/import-all.py','--skip-runtime'],cwd=work,stdout=output,stderr=subprocess.STDOUT)
  meta['exitCode']=result.returncode
  if result.returncode==0:
   frame=subprocess.run(['python3','scripts/audit-animations.py'],cwd=work,stdout=output,stderr=subprocess.STDOUT)
   animation=json.loads((work/'tests/animation-data-audit.json').read_text());meta['animationSummary']=animation['summary'];meta['animationErrors']=animation['errors'];meta['everyReproducedFrameMatchesSourceBytes']=all(f['expected_equals_actual_bytes']for a in animation['animations']for f in a['frames'])
 before=json.loads((ROOT/'public/content/fixture-map.json').read_text());after=json.loads((work/'public/content/fixture-map.json').read_text());meta['finalFixtureMapEntries']=len(after);meta['lostFixtureUrls']=sorted(set(before)-set(after));meta['changedFixtureBodies']=[u for u in before if u in after and hashlib.sha256((ROOT/'public'/before[u]['path'].lstrip('/')).read_bytes()).hexdigest()!=hashlib.sha256((work/'public'/after[u]['path'].lstrip('/')).read_bytes()).hexdigest()]
 if(work/'tests/content-fidelity-audit.json').exists():meta['reproducedFidelitySummary']=json.loads((work/'tests/content-fidelity-audit.json').read_text())['summary']
 meta['durationSeconds']=round(time.time()-meta['startedAt'],2);(ROOT/'tests/content-import-reproduction.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n');print(json.dumps(meta,ensure_ascii=False,indent=2))
 assert meta['exitCode']==0 and not meta['lostFixtureUrls']and not meta['changedFixtureBodies']
 assert not meta.get('animationErrors')and meta.get('everyReproducedFrameMatchesSourceBytes')
finally:shutil.rmtree(work)
