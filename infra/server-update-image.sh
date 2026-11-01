#!/usr/bin/env bash
# Copy only the runner source/context, including Dockerfile.update, first.
set -euo pipefail
cd /www/wwwroot/brclio-edu-runner
BASE_IMAGE=brclio-edu-toolchains:20261102
if ! docker image inspect "$BASE_IMAGE" >/dev/null 2>&1; then
  docker image inspect brclio-edu-runner:1 >/dev/null
  docker image tag brclio-edu-runner:1 "$BASE_IMAGE"
fi
# Only COPY and file permissions: preserve the non-root entry point and all
# isolation at execution time, without changing the frozen toolchain layer.
DOCKER_BUILDKIT=0 nice -n 15 docker build --pull=false --network none \
  --memory 512m --memory-swap 512m --cpu-period 100000 --cpu-quota 35000 \
  --file Dockerfile.update --build-arg BASE_IMAGE="$BASE_IMAGE" \
  --tag brclio-edu-runner:1 .
docker image inspect brclio-edu-runner:1 --format '{{.Id}} {{.Size}}'
