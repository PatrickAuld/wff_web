import { execFileSync } from "node:child_process";
import { accessSync } from "node:fs";
import { EmulatorManager } from "./emulator.js";

const emulator = new EmulatorManager();

export async function setup(): Promise<void> {
  validatePrerequisites();
  await emulator.ensureAvd();
  await emulator.start();
}

export async function teardown(): Promise<void> {
  await emulator.stop();
}

function validatePrerequisites(): void {
  // adb must be on PATH
  try {
    execFileSync("which", ["adb"]);
  } catch {
    throw new Error(
      "'adb' not found on PATH. Install Android platform-tools.\n" +
        "  brew install --cask android-platform-tools"
    );
  }

  // Emulator binary must exist in ANDROID_HOME or ~/Library/Android/sdk
  const androidHome =
    process.env.ANDROID_HOME ?? `${process.env.HOME}/Library/Android/sdk`;
  const emulatorBin = `${androidHome}/emulator/emulator`;
  try {
    accessSync(emulatorBin);
  } catch {
    throw new Error(
      `Emulator not found at ${emulatorBin}.\n` +
        "  Install via Android Studio SDK Manager or set ANDROID_HOME."
    );
  }
}
