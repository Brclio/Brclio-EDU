#!/usr/bin/env bash
# Update only execute.py while retaining the current trusted SDK and fixtures.
set -euo pipefail
cd /www/wwwroot/brclio-edu-runner
context=$(mktemp -d /var/lib/brclio-edu-runner/execute-update.XXXXXX)
trap 'rm -rf "$context"' EXIT
install -m 644 execute.py "$context/execute.py"
printf '%s\n' 'FROM brclio-edu-runner:1' \
  'COPY execute.py /opt/runner/execute.py' > "$context/Dockerfile"
DOCKER_BUILDKIT=0 nice -n 15 docker build --pull=false --network none \
  --memory 512m --memory-swap 512m --cpu-period 100000 --cpu-quota 35000 \
  --tag brclio-edu-runner:1 "$context"
docker image inspect brclio-edu-runner:1 --format '{{.Id}} {{.Size}}'
