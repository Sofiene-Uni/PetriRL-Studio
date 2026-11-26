#!/bin/sh
# Runs as root only to prepare the data folder of the server (mounted at /data), then starts the app as "studio".
set -e
mkdir -p /data
if [ "$(stat -c %u /data)" != "$(id -u studio)" ]; then
  chown -R studio:studio /data          # first start, or a folder created by Docker as root
fi
exec setpriv --reuid=studio --regid=studio --init-groups "$@"
