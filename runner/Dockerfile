ARG BASE_IMAGE=debian:bookworm-slim
FROM ${BASE_IMAGE}
ARG APT_MIRROR=""
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    LANG=C.UTF-8
RUN if [ -n "$APT_MIRROR" ]; then sed -i "s|http://deb.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list.d/debian.sources; fi \
    && apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates gcc g++ libc6-dev openjdk-17-jdk-headless \
    golang-go nodejs npm python3 python3-requests python3-bs4 python3-lxml sqlite3 bash \
    mono-mcs mono-runtime ruby rustc php-cli \
    && npm install --global typescript@5.9.3 --ignore-scripts --no-audit --no-fund \
    && npm cache clean --force \
    && rm -rf /var/lib/apt/lists/* /root/.npm /tmp/*
# Trusted SDK-only seed. Student-produced cache entries never leave the per-run tmpfs.
COPY warm-go.go /tmp/warm-go.go
RUN GOMAXPROCS=1 GOCACHE=/opt/go-seed-cache go build -p 1 -o /tmp/go-warm /tmp/warm-go.go \
    && chmod -R a+rX /opt/go-seed-cache \
    && rm -f /tmp/go-warm /tmp/warm-go.go
WORKDIR /opt/runner
COPY execute.py protocol.py process_utils.py /opt/runner/
COPY offline/ /opt/runner/offline/
COPY fixtures/ /opt/fixtures/
RUN chmod -R a=rX /opt/runner && mkdir -p /work && chown 65534:65534 /work
USER 65534:65534
WORKDIR /work
ENTRYPOINT ["python3", "-I", "-c", "import sys,runpy;sys.path.insert(0,'/opt/runner');runpy.run_path('/opt/runner/execute.py',run_name='__main__')"]
