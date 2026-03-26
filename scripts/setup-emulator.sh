#!/usr/bin/env bash
set -euo pipefail

AVD_NAME="wff_test_avd"
SYSTEM_IMAGE="system-images;android-34;android-wear;x86_64"
DEVICE_PROFILE="wearos_large_round"

echo "=== WFF Web Test Emulator Setup ==="

# Check prerequisites
if [ -z "${ANDROID_HOME:-}" ]; then
  echo "ERROR: ANDROID_HOME is not set."
  echo "  Install Android SDK and set ANDROID_HOME to the SDK root."
  exit 1
fi

for cmd in sdkmanager avdmanager emulator adb; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: '$cmd' not found on PATH."
    echo "  Ensure \$ANDROID_HOME/cmdline-tools/latest/bin and"
    echo "  \$ANDROID_HOME/platform-tools are on your PATH."
    exit 1
  fi
done

# Install system image
echo "Installing WearOS system image..."
sdkmanager "$SYSTEM_IMAGE"

# Create AVD
if avdmanager list avd -c | grep -q "^${AVD_NAME}$"; then
  echo "AVD '$AVD_NAME' already exists, skipping creation."
else
  echo "Creating AVD '$AVD_NAME'..."
  echo "no" | avdmanager create avd \
    -n "$AVD_NAME" \
    -k "$SYSTEM_IMAGE" \
    -d "$DEVICE_PROFILE" \
    --force
fi

echo ""
echo "Setup complete. Run tests with: pnpm test:visual"
