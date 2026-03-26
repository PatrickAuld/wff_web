import { EmulatorManager } from "./emulator.js";

const emulator = new EmulatorManager();

export async function setup(): Promise<void> {
  // Validate prerequisites
  validatePrerequisites();

  await emulator.ensureAvd();
  await emulator.start();
}

export async function teardown(): Promise<void> {
  await emulator.stop();
}

function validatePrerequisites(): void {
  const androidHome = process.env.ANDROID_HOME;
  if (!androidHome) {
    throw new Error(
      "ANDROID_HOME is not set. Install the Android SDK and set ANDROID_HOME.\n" +
        "Run: scripts/setup-emulator.sh for full setup instructions."
    );
  }

  const requiredTools = ["adb", "emulator", "avdmanager", "sdkmanager"];
  for (const tool of requiredTools) {
    try {
      const { execFileSync } = require("node:child_process");
      execFileSync("which", [tool]);
    } catch {
      throw new Error(
        `'${tool}' not found on PATH. Ensure Android SDK tools are available.\n` +
          "Add to PATH: $ANDROID_HOME/cmdline-tools/latest/bin and $ANDROID_HOME/platform-tools"
      );
    }
  }
}
