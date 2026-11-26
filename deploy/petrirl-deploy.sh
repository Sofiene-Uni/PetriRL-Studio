#!/bin/sh
# Copies PetriRL Studio from the NAS share to this machine, then builds and (re)starts the container.
# Run by petrirl-deploy.service at boot, or by hand: petrirl-deploy
# Settings: /etc/default/petrirl-studio (PETRIRL_SRC, PETRIRL_APP, PETRIRL_DATA_PATH, PETRIRL_PORT, PETRIRL_SECRET_KEY,
# PETRIRL_PUBLIC, PETRIRL_OPERATOR_*)
set -eu
[ -f /etc/default/petrirl-studio ] && . /etc/default/petrirl-studio
SRC="${PETRIRL_SRC:-/mnt/development/09_PetriRL/PetriRL-Studio}"
APP="${PETRIRL_APP:-/opt/petrirl-studio}"
export PETRIRL_DATA_PATH="${PETRIRL_DATA_PATH:-/opt/petrirl-studio-data}"
export PETRIRL_PORT="${PETRIRL_PORT:-5000}"
export PETRIRL_SECRET_KEY="${PETRIRL_SECRET_KEY:-change-me}"
export PETRIRL_PUBLIC="${PETRIRL_PUBLIC:-1}"
export PETRIRL_SITE_URL="${PETRIRL_SITE_URL:-https://petrirl.de}"
export PETRIRL_OPERATOR_NAME="${PETRIRL_OPERATOR_NAME:-Sofiene Lassoued}"
export PETRIRL_OPERATOR_ADDRESS="${PETRIRL_OPERATOR_ADDRESS:-}"
export PETRIRL_OPERATOR_EMAIL="${PETRIRL_OPERATOR_EMAIL:-}"

# the NFS share may come up a little after boot: wait up to 2 minutes
i=0
until [ -f "$SRC/docker-compose.yml" ]; do
  i=$((i + 1))
  [ "$i" -gt 24 ] && { echo "PetriRL Studio not found in $SRC (is the share mounted?)"; exit 1; }
  sleep 5
done

# the app's data lives outside the copied folder, so a copy never touches it
mkdir -p "$APP" "$PETRIRL_DATA_PATH"
rsync -a --delete --chmod=a+rX --exclude data/ --exclude .git/ --exclude __pycache__/ --exclude .pytest_cache/ "$SRC/" "$APP/"

cd "$APP"
docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null           # drop the previous image layers
echo "PetriRL Studio running on port $PETRIRL_PORT, data in $PETRIRL_DATA_PATH"
