#!/usr/bin/env python3
"""Reproduce native author-judge execution through the service's isolated launcher."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import time

def assemble(data, source):
    hidden=data.get('hidden_code_content') or {}
    prefix=[hidden.get('prepend_code') or data.get('prepend_code') or data.get('template_head') or '',data.get('judge_content_prepend','')]
    judge=data['judge_content']
    ed=judge.get('ed_code','')
    suffix=[hidden.get('append_code') or data.get('append_code') or data.get('template_tail') or '',judge['author_code'],ed]
    return '\n'.join(part for part in prefix+[source]+suffix if part)

def prepare(source, negative=False):
    tasks=[]
    for row in source:
        d=row['data']
        if d['language'] not in ('c++','java') or d.get('judge') is False:
            continue
        editor=d['solution_content']
        # This mutation preserves compilation for the integer duplicate-number
        # exercise while returning a sentinel outside every expected answer.
        if negative:
            if row['page']!='006-263':continue
            editor=re.sub(r'\breturn\s+[^;]+;', 'return -999;',editor)
        code=assemble(d,editor)
        tasks.append({'page':row['page'],'id':d['comp_id'],'language':d['language'],'variant':'wrong-sentinel' if negative else 'public-reference',
            'codeSha256':hashlib.sha256(code.encode()).hexdigest(),
            'request':{'language':d['language'],'code':code,'stdin':'','files':d.get('additional_content') or [],'testcases':[]}})
    return {'negative':negative,'tasks':tasks}

def run(plan, output):
    from protocol import validate_request
    from server import execute_request
    rows=[]
    for task in plan['tasks']:
        start=time.monotonic()
        status,result=execute_request(validate_request(task['request']))
        cases=[];parse_error=None
        match=re.search(r'<__educative_test_results__>([\s\S]*?)</__educative_test_results__>',result.get('stdout',''))
        if match:
            try:cases=json.loads(match[1])['test_results']
            except (ValueError,KeyError,TypeError) as error:parse_error=str(error)
        record={k:v for k,v in task.items() if k!='request'}
        record.update(httpEquivalentStatus=status,seconds=round(time.monotonic()-start,3),result=result,structuredResults=cases,parseError=parse_error,
            allPassed=status==200 and result.get('exitCode')==0 and not result.get('timedOut') and bool(cases) and all(case.get('succeeded') is True for case in cases))
        rows.append(record)
        report={'updatedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'negative':plan['negative'],'results':rows,
            'summary':{'tasks':len(rows),'allPassed':sum(row['allPassed'] for row in rows),'structuredTests':sum(len(row['structuredResults']) for row in rows),'passedTests':sum(case.get('succeeded') is True for row in rows for case in row['structuredResults'])}}
        output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps({k:record[k] for k in ['page','id','language','seconds','allPassed']}),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--prepare',action='store_true')
    parser.add_argument('--execute',action='store_true')
    parser.add_argument('--negative',action='store_true')
    parser.add_argument('--source',type=Path,default=Path('data/source/runtime-unit-jobs.json'))
    parser.add_argument('--plan',type=Path,default=Path('tests/runner-author-plan.json'))
    parser.add_argument('--output',type=Path,default=Path('tests/runner-author-baseline.json'))
    args=parser.parse_args()
    if args.prepare:
        plan=prepare(json.loads(args.source.read_text()),args.negative)
        args.plan.write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps({'tasks':len(plan['tasks']),'languages':dict(Counter(x['language'] for x in plan['tasks']))}))
    if args.execute:run(json.loads(args.plan.read_text()),args.output)
