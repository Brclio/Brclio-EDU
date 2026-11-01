#!/usr/bin/env bash
set -euo pipefail
cd /www/wwwroot/brclio-edu-runner
docker buildx build --builder brclio-edu-builder --load \
  --file Dockerfile.swift --tag brclio-edu-swift:1 --progress=plain \
  --build-arg BASE_IMAGE=docker.m.daocloud.io/library/swift@sha256:2d1c71154f1f9c8ca712997f49a7b42366978ae7d28fa9a76ea3672d62dbd251 \
  --build-arg APT_MIRROR=http://mirrors.aliyun.com .
docker image inspect brclio-edu-swift:1 --format '{{.Id}} {{.Size}}'
