import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

const ANDROID_HOME = process.env.ANDROID_HOME ?? `${process.env.HOME}/Library/Android/sdk`;
const EMULATOR_BIN = `${ANDROID_HOME}/emulator/emulator`;

// AVD names to try, in preference order.
// Uses existing "Wear_OS_Large_Round" if present, falls back to "wff_test_avd".
const AVD_CANDIDATES = ["Wear_OS_Large_Round", "Wear_OS_Small_Round", "wff_test_avd"];
const BOOT_TIMEOUT_MS = 180_000;
const BOOT_POLL_INTERVAL_MS = 3_000;

export class EmulatorManager {
  private process: ChildProcess | null = null;
  private avdName: string | null = null;

  /** Find a usable WearOS AVD from the candidates list */
  async resolveAvd(): Promise<string> {
    if (this.avdName) return this.avdName;

    const avdDir = `${process.env.HOME}/.android/avd`;
    for (const name of AVD_CANDIDATES) {
      try {
        const { readFileSync } = await import("node:fs");
        const ini = readFileSync(`${avdDir}/${name}.ini`, "utf-8");
        if (ini.includes("path=")) {
          this.avdName = name;
          console.log(`Using AVD: ${name}`);
          return name;
        }
      } catch {
        // AVD doesn't exist, try next
      }
    }
    throw new Error(
      `No WearOS AVD found. Looked for: ${AVD_CANDIDATES.join(", ")}.\n` +
        "Create one in Android Studio or run: scripts/setup-emulator.sh"
    );
  }

  /** Ensure an AVD is available (resolves existing, does not create) */
  async ensureAvd(): Promise<void> {
    await this.resolveAvd();
  }

  /** Start the emulator headlessly */
  async start(): Promise<void> {
    // Check if an emulator is already running
    if (await this.isRunning()) {
      console.log("Emulator already running, reusing.");
      return;
    }

    const avd = await this.resolveAvd();
    console.log(`Starting WearOS emulator (${avd})...`);

    this.process = spawn(
      EMULATOR_BIN,
      [
        "-avd",
        avd,
        "-no-window",
        "-no-audio",
        "-no-boot-anim",
        "-gpu",
        "auto",
      ],
      {
        stdio: "ignore",
        detached: true,
      }
    );

    this.process.unref();

    await this.waitForBoot();
    await this.disableAnimations();

    console.log("Emulator ready.");
  }

  /** Wait for the emulator to finish booting */
  private async waitForBoot(): Promise<void> {
    console.log("Waiting for emulator boot...");

    // Wait for device to appear
    await exec("adb", ["wait-for-device"], { timeout: 60_000 });

    // Poll for boot completion
    const deadline = Date.now() + BOOT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const { stdout } = await exec("adb", [
          "shell",
          "getprop",
          "sys.boot_completed",
        ]);
        if (stdout.trim() === "1") {
          return;
        }
      } catch {
        // Device not ready yet
      }
      await sleep(BOOT_POLL_INTERVAL_MS);
    }

    throw new Error(`Emulator did not boot within ${BOOT_TIMEOUT_MS}ms`);
  }

  /** Disable all animations for deterministic screenshots */
  private async disableAnimations(): Promise<void> {
    const settings = [
      "window_animation_scale",
      "transition_animation_scale",
      "animator_duration_scale",
    ];
    for (const setting of settings) {
      await exec("adb", [
        "shell",
        "settings",
        "put",
        "global",
        setting,
        "0",
      ]);
    }
  }

  /** Check if an emulator is currently running */
  async isRunning(): Promise<boolean> {
    try {
      const { stdout } = await exec("adb", ["devices"]);
      return stdout.includes("emulator-");
    } catch {
      return false;
    }
  }

  /** Stop the emulator */
  async stop(): Promise<void> {
    console.log("Stopping emulator...");
    try {
      await exec("adb", ["emu", "kill"], { timeout: 15_000 });
    } catch {
      // Emulator may already be stopped
    }
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
