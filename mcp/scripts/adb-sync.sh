#!/usr/bin/env bash
# Move the Altiora SQLite database between the Android device and this machine,
# so the MCP server can read (and optionally write) real app data.
#
#   ./mcp/scripts/adb-sync.sh pull    device -> ./offline_tasker.db
#   ./mcp/scripts/adb-sync.sh push    ./offline_tasker.db -> device  (close the app first)
#
# Requires: adb on PATH, USB debugging enabled, and a debuggable build of the
# app (`run-as` only works for debuggable installs; a release APK will fail).
set -euo pipefail

PKG="${ALTIORA_PKG:-com.offlinetasker.app}"
REMOTE_DIR="files/SQLite"
DB="offline_tasker.db"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOCAL="${ALTIORA_DB_PATH:-$ROOT/$DB}"

die() { echo "error: $*" >&2; exit 1; }

usage() {
    sed -n '2,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

case "${1:-}" in
  pull|push) ;;
  *) usage; exit 1 ;;
esac

command -v adb >/dev/null 2>&1 || die "adb not found on PATH (install android-tools)."
adb get-state >/dev/null 2>&1 || die "no device connected (check 'adb devices')."

# WAL means recent writes may still live in the -wal sidecar; copy all three.
run_as() { adb exec-out run-as "$PKG" "$@"; }

case "${1:-}" in
  pull)
    for suffix in "" "-wal" "-shm"; do
      remote="$REMOTE_DIR/$DB$suffix"
      if run_as test -f "$remote" 2>/dev/null; then
        run_as cat "$remote" > "$LOCAL$suffix"
        echo "pulled $remote -> $LOCAL$suffix"
      fi
    done
    [ -s "$LOCAL" ] || die "pull produced an empty file; is the package name '$PKG' correct and the build debuggable?"
    ;;
  push)
    [ -f "$LOCAL" ] || die "$LOCAL does not exist."
    echo "Close Altiora on the device before pushing, or the app will overwrite these changes."
    adb push "$LOCAL" "/data/local/tmp/$DB" >/dev/null
    run_as sh -c "cp /data/local/tmp/$DB $REMOTE_DIR/$DB && rm -f $REMOTE_DIR/$DB-wal $REMOTE_DIR/$DB-shm"
    adb shell rm -f "/data/local/tmp/$DB"
    echo "pushed $LOCAL -> $PKG:$REMOTE_DIR/$DB"
    ;;
esac
