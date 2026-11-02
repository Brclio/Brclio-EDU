#!/usr/bin/env python3
"""Reproduce courses, recovered assets, fixed fixtures and runtime dependencies.
Existing public fixtures and caches are reused. --refresh refreshes course API
responses only; immutable captured fixtures are not silently replaced.
"""
import argparse,pathlib,subprocess,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--refresh',action='store_true');p.add_argument('--skip-runtime',action='store_true',help='Skip pinned browser interpreter packages, not course datasets');p.add_argument('--live-audit',action='store_true');a=p.parse_args()
steps=[
 [sys.executable,'scripts/import-courses.py']+(['--refresh']if a.refresh else[]),
 [sys.executable,'scripts/import-network-fixtures.py'],
 [sys.executable,'scripts/import-biqukan-compat.py'],
 [sys.executable,'scripts/import-runtime-data.py'],
]
if not a.skip_runtime:steps.append(['node','scripts/import-runtime.mjs'])
steps += [[sys.executable,'scripts/import-verify.py'],[sys.executable,'scripts/audit-content-fidelity.py']+(['--live']if a.live_audit else[])]
for command in steps:
 print('Running '+command[1],flush=True);subprocess.run(command,cwd=ROOT,check=True)
