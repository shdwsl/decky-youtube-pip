#!/bin/sh
# Builds the frontend and produces out/youtube-pip.zip for Decky's "Install from ZIP".
set -eu
cd "$(dirname "$0")/.."

pnpm build

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
root="$stage/youtube-pip"
mkdir -p "$root/dist" out

cp dist/index.js "$root/dist/"
cp main.py plugin.json package.json LICENSE README.md defaults/agent.js "$root/"

rm -f out/youtube-pip.zip
(cd "$stage" && zip -qr - youtube-pip) > out/youtube-pip.zip
echo "out/youtube-pip.zip"
