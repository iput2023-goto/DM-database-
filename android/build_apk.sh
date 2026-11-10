#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android"
BUILD_DIR="$ANDROID_DIR/build"

SDK_ROOT="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/usr/local/lib/android/sdk}}"
BUILD_TOOLS="$(ls -d "$SDK_ROOT/build-tools/"* | sort -V | tail -n 1)"
PLATFORM_JAR="$(ls "$SDK_ROOT/platforms/"android-*/android.jar | sort -V | tail -n 1)"

echo "Using BUILD_TOOLS: $BUILD_TOOLS"
echo "Using PLATFORM_JAR: $PLATFORM_JAR"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/gen" "$BUILD_DIR/classes" "$BUILD_DIR/dex" "$BUILD_DIR/compiled_res"

# 1. Compile resources
"$BUILD_TOOLS/aapt2" compile --dir "$ANDROID_DIR/res" -o "$BUILD_DIR/compiled_res/res.zip"

# 2. Link resources & assets into base APK and generate R.java
"$BUILD_TOOLS/aapt2" link \
  -I "$PLATFORM_JAR" \
  --manifest "$ANDROID_DIR/AndroidManifest.xml" \
  -A "$ANDROID_DIR/assets" \
  --java "$BUILD_DIR/gen" \
  -o "$BUILD_DIR/unaligned.apk" \
  "$BUILD_DIR/compiled_res/res.zip"

# 3. Compile Java sources
javac -encoding UTF-8 --release 8 \
  -cp "$PLATFORM_JAR" \
  -d "$BUILD_DIR/classes" \
  "$ANDROID_DIR/src/com/dmvault/app/MainActivity.java" \
  "$BUILD_DIR/gen/com/dmvault/app/R.java"

# 4. Convert .class to classes.dex
"$BUILD_TOOLS/d8" \
  --lib "$PLATFORM_JAR" \
  --min-api 24 \
  --output "$BUILD_DIR/dex" \
  "$BUILD_DIR/classes/com/dmvault/app/"*.class

# 5. Add classes.dex to APK
(cd "$BUILD_DIR/dex" && zip -uj "$BUILD_DIR/unaligned.apk" classes.dex)

# 6. Align APK
"$BUILD_TOOLS/zipalign" -f -p 4 "$BUILD_DIR/unaligned.apk" "$BUILD_DIR/aligned.apk"

# 7. Sign APK
KEYSTORE="$BUILD_DIR/release.keystore"
keytool -genkeypair \
  -v \
  -keystore "$KEYSTORE" \
  -alias dmvault \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass dmvault123 \
  -keypass dmvault123 \
  -dname "CN=DM Vault, OU=App, O=DMVault, L=Tokyo, S=Tokyo, C=JP"

"$BUILD_TOOLS/apksigner" sign \
  --ks "$KEYSTORE" \
  --ks-key-alias dmvault \
  --ks-pass pass:dmvault123 \
  --key-pass pass:dmvault123 \
  --out "$ROOT_DIR/デュエマ管理アプリ.apk" \
  "$BUILD_DIR/aligned.apk"

cp "$ROOT_DIR/デュエマ管理アプリ.apk" "$ROOT_DIR/public/DM-Vault.apk"
rm -rf "$BUILD_DIR"

echo "Successfully built signed APK: $ROOT_DIR/デュエマ管理アプリ.apk"
ls -lh "$ROOT_DIR/デュエマ管理アプリ.apk"

