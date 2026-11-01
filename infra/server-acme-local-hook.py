#!/usr/bin/env python3
"""HTTP-01 hook for this one service; never starts or stops a web server."""
import os
import re
import sys
from pathlib import Path
if os.environ.get('CERTBOT_DOMAIN') != 'edu-runner.bornforthis.cn':
    raise SystemExit('Unexpected domain')
token = os.environ.get('CERTBOT_TOKEN', '')
value = os.environ.get('CERTBOT_VALIDATION', '')
if not re.fullmatch(r'[A-Za-z0-9_-]{10,200}', token) or not re.fullmatch(r'[A-Za-z0-9_.-]{10,500}', value):
    raise SystemExit('Invalid challenge')
path = Path('/www/wwwroot/java_node_ssl/.well-known/acme-challenge') / token
if '--cleanup' in sys.argv:
    path.unlink(missing_ok=True)
else:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value)
