"""Host-only entrypoint; load this service's private configuration without shell interpolation."""
import os
from pathlib import Path
import runpy

for line in Path('/etc/brclio-edu-runner.env').read_text().splitlines():
    key, separator, value = line.partition('=')
    if separator and key in {'RUNNER_TOKEN', 'RUNNER_IMAGE', 'RUNNER_SWIFT_IMAGE', 'RUNNER_WALL_TIMEOUT'}:
        os.environ[key] = value
runpy.run_path('/www/wwwroot/brclio-edu-runner/server.py', run_name='__main__')
