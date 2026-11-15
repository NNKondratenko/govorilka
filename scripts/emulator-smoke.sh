#!/usr/bin/env bash
# Smoke test on an Android emulator (CI): install the APK, walk through the first-run flow,
# take real screenshots, and fail on JavaScript errors from the WebView.
set -euo pipefail
APK=${1:-out/Govorilka.apk}
OUT=${2:-shots}
PKG=ru.govorilka.app
mkdir -p "$OUT"

dump() { adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true; adb pull /sdcard/ui.xml "$OUT/ui.xml" >/dev/null 2>&1 || true; }
shot() { adb exec-out screencap -p > "$OUT/$1.png"; dump; cp "$OUT/ui.xml" "$OUT/$1.xml" || true; echo "screenshot $1"; }
has() { grep -q "$1" "$OUT/ui.xml"; }
# Taps the centre of the first node whose text or content-desc contains $1.
tap() {
  dump
  local b
  b=$(grep -o "<node [^>]*\(text\|content-desc\)=\"[^\"]*$1[^\"]*\"[^>]*>" "$OUT/ui.xml" | head -1 | grep -o 'bounds="\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]"' | grep -o '[0-9]*' | tr '\n' ' ')
  if [ -z "$b" ]; then echo "no node with «$1»"; return 1; fi
  set -- $b
  adb shell input tap $(( ($1 + $3) / 2 )) $(( ($2 + $4) / 2 ))
}
tap_id() {
  dump
  local b
  b=$(grep -o "<node [^>]*resource-id=\"$1\"[^>]*>" "$OUT/ui.xml" | head -1 | grep -o 'bounds="\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]"' | grep -o '[0-9]*' | tr '\n' ' ')
  [ -n "$b" ] || return 1
  set -- $b
  adb shell input tap $(( ($1 + $3) / 2 )) $(( ($2 + $4) / 2 ))
}

adb logcat -c
adb install -r "$APK"
adb shell am start -W -n "$PKG/.MainActivity"
sleep 10

# 1. First start: our own sheet explains why the mic is needed, before the system dialog.
shot 1-permission-sheet
has "Нужен микрофон" || { echo "FAIL: permission sheet not shown"; exit 1; }
tap "Разрешить"
sleep 3
shot 2-system-dialog
tap_id "com.android.permissioncontroller:id/permission_allow_foreground_only_button" || tap_id "com.android.permissioncontroller:id/permission_allow_button" || tap "While using" || tap "Allow"
sleep 3

# 2. Home screen with the groups.
shot 3-home
has "Говорилка" || { echo "FAIL: home not shown"; exit 1; }
has "Звук Р" || { echo "FAIL: groups not rendered"; exit 1; }
[ "$(adb shell dumpsys package $PKG | grep -c 'android.permission.RECORD_AUDIO: granted=true')" -ge 1 ] || { echo "FAIL: mic permission not granted"; exit 1; }

# 3. Start training: TTS speaks, then the app listens (or explains why it can't on this image).
tap "Играть"
sleep 4
shot 4-play
has "Мама" || { echo "FAIL: exercise not shown"; exit 1; }
sleep 6
shot 5-play-later

# 4. Restart the app: the permission must NOT be asked again.
adb shell am force-stop "$PKG"
adb shell am start -W -n "$PKG/.MainActivity"
sleep 8
shot 6-restart
if has "Нужен микрофон"; then echo "FAIL: permission asked again"; exit 1; fi

adb logcat -d > "$OUT/logcat.txt"
grep -E "chromium.*(Uncaught|SyntaxError|TypeError|ReferenceError)" "$OUT/logcat.txt" && { echo "FAIL: JavaScript errors"; exit 1; }
grep -E "FATAL EXCEPTION" -A20 "$OUT/logcat.txt" && { echo "FAIL: crash"; exit 1; }
grep -iE "chromium.*Console|govorilka" "$OUT/logcat.txt" | tail -30 || true
echo "SMOKE OK"
