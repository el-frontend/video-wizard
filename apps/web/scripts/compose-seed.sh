#!/bin/sh
# Provision the existing root-owned catalog, then hand its private login file
# to the explicitly supplied UID and GID of the Docker operator.
set -eu
pnpm auth:seed
file=/app/.studio/bootstrap-user.json
if [ -e "$file" ]; then
  test ! -L "$file"
  test -f "$file"
  test "$(stat -c %a "$file")" = 600
  test "$(stat -c %h "$file")" = 1
  chown --no-dereference "$1:$2" "$file"
fi
