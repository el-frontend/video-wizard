#!/bin/sh
# Deliver the private bootstrap file to the operator while retaining the
# container identity that already owns and provisions the Studio data volume.
set -eu
umask 077
test ! -L .studio
mkdir -p .studio
chmod 700 .studio
docker compose --env-file .env.docker run --rm --no-deps -T \
  -v "$PWD/.studio:/app/.studio" web sh scripts/compose-seed.sh "$(id -u)" "$(id -g)"
