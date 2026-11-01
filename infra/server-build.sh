#!/usr/bin/env bash
# Run on the server after copying only runner/ into its own project directory.
set -euo pipefail
cd /www/wwwroot/brclio-edu-runner
if ! docker buildx inspect brclio-edu-builder >/dev/null 2>&1; then
  docker buildx create --name brclio-edu-builder --driver docker-container \
    --driver-opt memory=512m --driver-opt memory-swap=512m \
    --driver-opt cpu-period=100000 --driver-opt cpu-quota=35000 \
    --driver-opt image=docker.m.daocloud.io/moby/buildkit@sha256:98cc6a3fc46220d00f8224ae483f3274fc874e9be8d7dd1e2e2c5481209228b5
fi
# This builder is independent; do not use --use or change daemon configuration.
docker buildx build --builder brclio-edu-builder --load \
  --tag brclio-edu-runner:1 --progress=plain \
  --build-arg APT_MIRROR=http://mirrors.aliyun.com \
  --build-arg BASE_IMAGE=docker.m.daocloud.io/library/debian@sha256:a3bba7dc7dbcc1f37c2856c51fc9a7fac96608f50cb87b1b4e4d8b8c85ae988e .
docker image inspect brclio-edu-runner:1 --format '{{.Id}} {{.Size}}'
