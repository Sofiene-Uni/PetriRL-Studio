#!/bin/sh
# Runs as root only to prepare the data folder of the server (mounted at /data), then starts the app as "studio".
set -e
mkdir -p /data
if [ "$(stat -c %u /data)" != "$(id -u studio)" ]; then
  chown -R studio:studio /data          # first start, or a folder created by Docker as root
fi
export HOME=/home/studio                # gunicorn keeps a control socket in $HOME
exec setpriv --reuid=studio --regid=studio --init-groups "$@"
