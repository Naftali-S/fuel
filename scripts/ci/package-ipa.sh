#!/usr/bin/env bash
# Packages an unsigned .xcarchive into an .ipa that AltStore/SideStore can re-sign.
#
# The app is ad-hoc signed ("-") with its entitlements file so the sideloading
# tool can read which capabilities (e.g. HealthKit) the app requests; it then
# re-signs everything with the user's own Apple ID certificate.
#
# Usage: package-ipa.sh <path/to/App.xcarchive> <output.ipa>
set -euo pipefail

ARCHIVE="$1"
OUT="$2"

APP="$(find "$ARCHIVE/Products/Applications" -maxdepth 1 -name '*.app' | head -1)"
if [ -z "$APP" ]; then
  echo "No .app found in $ARCHIVE" >&2
  exit 1
fi

ENTITLEMENTS="$(find ios -maxdepth 2 -name '*.entitlements' | head -1)"

WORK="$(mktemp -d)"
mkdir -p "$WORK/Payload"
cp -R "$APP" "$WORK/Payload/"
APP_COPY="$WORK/Payload/$(basename "$APP")"

# Nested code must be signed before the app bundle that contains it.
if [ -d "$APP_COPY/Frameworks" ]; then
  find "$APP_COPY/Frameworks" -maxdepth 1 \( -name '*.framework' -o -name '*.dylib' \) -print0 |
    xargs -0 -I{} codesign --force --sign - --timestamp=none "{}"
fi

if [ -n "$ENTITLEMENTS" ]; then
  codesign --force --sign - --timestamp=none --generate-entitlement-der --entitlements "$ENTITLEMENTS" "$APP_COPY"
else
  codesign --force --sign - --timestamp=none "$APP_COPY"
fi

echo "Entitlements embedded in $(basename "$APP_COPY"):"
codesign -d --entitlements - "$APP_COPY" || true

mkdir -p "$(dirname "$OUT")"
OUT_ABS="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"
rm -f "$OUT_ABS"
(cd "$WORK" && zip -qry "$OUT_ABS" Payload)
ls -lh "$OUT_ABS"
