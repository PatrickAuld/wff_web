import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

const DEFAULT_SETTLE_MS = 2000;

export class AdbClient {
  private settleMs: number;

  constructor(settleMs = DEFAULT_SETTLE_MS) {
    this.settleMs = settleMs;
  }

  /** Install an APK on the connected device */
  async installApk(apkPath: string): Promise<void> {
    await exec("adb", ["install", "-r", apkPath], { timeout: 60_000 });
  }

  /** Uninstall a package */
  async uninstallPackage(packageName: string): Promise<void> {
    try {
      await exec("adb", ["uninstall", packageName], { timeout: 30_000 });
    } catch {
      // Package may not be installed
    }
  }

  /** Set the active watch face by component name */
  async setWatchFace(componentName: string): Promise<void> {
    await exec("adb", [
      "shell",
      "am",
      "broadcast",
      "-a",
      "com.google.android.wearable.app.DEBUG_SURFACE",
      "--es",
      "operation",
      "set-watchface",
      "--es",
      "watchFaceId",
      componentName,
    ]);
    await this.settle();
  }

  /** Set the device time to a specific ISO 8601 timestamp */
  async setTime(isoTime: string): Promise<void> {
    const date = new Date(isoTime);

    // Disable auto time sync
    await exec("adb", [
      "shell",
      "settings",
      "put",
      "global",
      "auto_time",
      "0",
    ]);

    // Format for `date` command: MMDDhhmmYYYY.ss
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    const yyyy = String(date.getFullYear());
    const ss = String(date.getSeconds()).padStart(2, "0");
    const dateStr = `${mm}${dd}${hh}${min}${yyyy}.${ss}`;

    await exec("adb", ["shell", "date", dateStr]);

    // Broadcast time change
    await exec("adb", [
      "shell",
      "am",
      "broadcast",
      "-a",
      "android.intent.action.TIME_SET",
    ]);

    await this.settle();
  }

  /** Enter ambient (always-on display) mode */
  async enterAmbientMode(): Promise<void> {
    // Ensure always-on display is enabled so we can still screencap
    await exec("adb", [
      "shell",
      "settings",
      "put",
      "global",
      "always_on_display_state",
      "1",
    ]);

    await exec("adb", [
      "shell",
      "input",
      "keyevent",
      "KEYCODE_SLEEP",
    ]);
    await this.settle();
  }

  /** Exit ambient mode (wake screen) */
  async exitAmbientMode(): Promise<void> {
    await exec("adb", [
      "shell",
      "input",
      "keyevent",
      "KEYCODE_WAKEUP",
    ]);
    await this.settle();
  }

  /** Capture a screenshot and return the PNG buffer */
  async screencap(): Promise<Buffer> {
    const { stdout } = await exec(
      "adb",
      ["exec-out", "screencap", "-p"],
      { encoding: "buffer" as any, maxBuffer: 10 * 1024 * 1024 }
    );
    return stdout as unknown as Buffer;
  }

  /** Wait for the watch face to settle after a state change */
  private settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.settleMs));
  }
}
