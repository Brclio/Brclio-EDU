#!/usr/bin/env python3
"""Copy only this renewed certificate, then ask the official panel API to install it."""
from pathlib import Path
import os
import subprocess
source = Path(os.environ.get('RENEWED_LINEAGE', '/var/lib/brclio-edu-runner/acme/live/edu-runner.bornforthis.cn'))
if source != Path('/var/lib/brclio-edu-runner/acme/live/edu-runner.bornforthis.cn'):
    raise SystemExit('Unexpected certificate lineage')
destination = Path('/var/lib/brclio-edu-runner/tls')
destination.mkdir(mode=0o700, parents=True, exist_ok=True)
for name in ['fullchain.pem', 'privkey.pem']:
    target = destination / name
    target.write_bytes((source / name).read_bytes())
    target.chmod(0o600)
subprocess.run(['/www/server/panel/pyenv/bin/python3', '/www/wwwroot/brclio-edu-runner/server-panel.py', 'install-certificate'], check=True, timeout=45)
