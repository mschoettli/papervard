#!/bin/sh
set -eu

CONFIG_PATH="${PAPERVARD_CONFIG_PATH:-/config}"
DATA_PATH="${PAPERVARD_DATA_PATH:-/data}"
mkdir -p "$CONFIG_PATH/secrets" "$DATA_PATH/blobs" "$DATA_PATH/previews" "$DATA_PATH/thumbnails" "$DATA_PATH/staging" "$DATA_PATH/library/Familie" "$DATA_PATH/library/Privat"
chown -R nextjs:nodejs "$CONFIG_PATH/secrets" "$DATA_PATH/blobs" "$DATA_PATH/previews" "$DATA_PATH/thumbnails" "$DATA_PATH/staging" "$DATA_PATH/library"
chmod 0700 "$CONFIG_PATH/secrets"

secret_value() {
  file="$CONFIG_PATH/secrets/$1"
  kind="$2"
  if [ ! -s "$file" ]; then
    if mkdir "$file.lock" 2>/dev/null; then
      umask 077
      temporary="$file.$$.tmp"
      if [ "$kind" = "base64" ]; then openssl rand -base64 32 > "$temporary"; else openssl rand -hex 32 > "$temporary"; fi
      mv "$temporary" "$file"
      rmdir "$file.lock"
    else
      while [ ! -s "$file" ]; do sleep 1; done
    fi
  fi
  tr -d '\r\n' < "$file"
}

AUTH_SECRET="${AUTH_SECRET:-$(secret_value auth-secret hex)}"
PAPERVARD_SIGNING_SECRET="${PAPERVARD_SIGNING_SECRET:-$(secret_value signing-secret hex)}"
DICOM_FIELD_KEY="${DICOM_FIELD_KEY:-$(secret_value dicom-field-key base64)}"
export AUTH_SECRET PAPERVARD_SIGNING_SECRET DICOM_FIELD_KEY

exec gosu nextjs:nodejs "$@"
