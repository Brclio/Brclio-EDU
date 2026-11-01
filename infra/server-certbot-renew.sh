#!/bin/sh
set -eu
export OPENSSL_CONF=/www/wwwroot/brclio-edu-runner/server-certbot-openssl.cnf
attempt=1
while [ "$attempt" -le 3 ]; do
  if /www/server/pyporject_evn/brclio-edu-runner/bin/certbot renew \
    --config-dir /var/lib/brclio-edu-runner/acme \
    --work-dir /var/lib/brclio-edu-runner/acme-work \
    --logs-dir /var/log/brclio-edu-runner-acme \
    --cert-name edu-runner.bornforthis.cn --non-interactive "$@"; then
    exit 0
  fi
  attempt=$((attempt + 1))
  if [ "$attempt" -le 3 ]; then sleep 10; fi
done
exit 1
