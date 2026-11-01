#!/usr/bin/env python3
"""Certbot HTTP hook; SSH destination is supplied privately through environment."""
import json
import os
import re
import subprocess
import sys

domain = os.environ['CERTBOT_DOMAIN']
token = os.environ['CERTBOT_TOKEN']
if domain != 'edu-runner.bornforthis.cn' or not re.fullmatch(r'[A-Za-z0-9_-]{10,200}', token):
    raise SystemExit('Unexpected certificate challenge')
value = os.environ.get('CERTBOT_VALIDATION', '')
if not re.fullmatch(r'[A-Za-z0-9_.-]{10,500}', value):
    raise SystemExit('Invalid challenge body')
request = json.dumps({'token': token, 'value': value, 'cleanup': '--cleanup' in sys.argv})
remote = '''import json,sys,re;from pathlib import Path
r=json.loads(sys.stdin.read());assert re.fullmatch(r'[A-Za-z0-9_-]{10,200}',r['token'])
p=Path('/www/wwwroot/java_node_ssl/.well-known/acme-challenge')/r['token']
if r['cleanup']:p.unlink(missing_ok=True)
else:p.parent.mkdir(parents=True,exist_ok=True);p.write_text(r['value'])
'''
import shlex
command = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', '-S', os.environ['RUNNER_SSH_SOCKET'], '-p', os.environ['RUNNER_SSH_PORT'], os.environ['RUNNER_SSH_TARGET'], 'python3 -c ' + shlex.quote(remote)]
subprocess.run(command, input=request, text=True, check=True, timeout=20)
