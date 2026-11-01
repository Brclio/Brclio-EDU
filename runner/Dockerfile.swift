# A separate compiler image keeps Swift out of every other execution's filesystem.
# The slim Swift images only contain runtime libraries and cannot compile source.
ARG BASE_IMAGE=swift:5.10.1-jammy@sha256:2d1c71154f1f9c8ca712997f49a7b42366978ae7d28fa9a76ea3672d62dbd251
FROM ${BASE_IMAGE}
ARG APT_MIRROR=""
ENV DEBIAN_FRONTEND=noninteractive PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 LANG=C.UTF-8
RUN if [ -n "$APT_MIRROR" ]; then sed -i -e "s|http://archive.ubuntu.com|${APT_MIRROR}|g" -e "s|http://security.ubuntu.com|${APT_MIRROR}|g" /etc/apt/sources.list; fi \
    && if ! command -v python3 >/dev/null 2>&1; then apt-get update && apt-get install -y --no-install-recommends python3; fi \
    && rm -rf /var/lib/apt/lists/* /tmp/*
WORKDIR /opt/runner
COPY execute.py protocol.py process_utils.py /opt/runner/
RUN chmod -R a=rX /opt/runner && mkdir -p /work && chown 65534:65534 /work
USER 65534:65534
WORKDIR /work
ENTRYPOINT ["python3", "-I", "-c", "import sys,runpy;sys.path.insert(0,'/opt/runner');runpy.run_path('/opt/runner/execute.py',run_name='__main__')"]
