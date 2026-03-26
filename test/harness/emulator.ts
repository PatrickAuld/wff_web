import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

const AVD_NAME = "wff_test_avd";
const SYSTEM_IMAGE = "system-images;android-34;android-wear;x86_64";
const DEVICE_PROFILE = "wearos_large_round";
const BOOT_TIMEOUT_MS = 180_000;
const BOOT_POLL_INTERVAL_MS = 3_000;

export class EmulatorManager {
  private process: ChildProcess | null = null;

  /** Check if the AVD already exists */
  async avdExists(): Promise<boolean> {
    const { stdout } = await exec("avdmanager", ["list", "avd", "-c"]);
    return stdout
      .split("\n")
      .map((l) => l.trim())
      .includes(AVD_NAME);
  }

  /** Create the AVD if it doesn't exist */
  async ensureAvd(): Promise<void> {
    if (await this.avdExists()) {
      return;
    }

    console.log(`Creating AVD "${AVD_NAME}"...`);

    // Ensure system image is installed
    await exec("sdkmanager", [SYSTEM_IMAGE], { timeout: 300_000 });

    await exec("avdmanager", [
      "create",
      "avd",
      "-n",
      AVD_NAME,
      "-k",
      SYSTEM_IMAGE,
      "-d",
      DEVICE_PROFILE,
      "--force",
    ]);
  }

  /** Start the emulator headlessly */
  async start(): Promise<void> {
    // Check if an emulator is already running
    if (await this.isRunning()) {
      console.log("Emulator already running, reusing.");
      return;
    }

    console.log("Starting WearOS emulator...");

    this.process = spawn(
      "emulator",
      [
        "-avd",
        AVD_NAME,
        "-no-window",
        "-no-audio",
        "-no-boot-anim",
        "-gpu",
        "swiftshader_indirect",
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
