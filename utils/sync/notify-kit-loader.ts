import { NativeModules, Platform } from "react-native";

type NotifyKitPackage = typeof import("react-native-notify-kit");

let notifyKitModule: NotifyKitPackage | null | undefined;

/** True when running a native build that links react-native-notify-kit (not Expo Go / web). */
export function isNotifyKitNativeAvailable(): boolean {
  if (Platform.OS === "web") return false;
  return Boolean(NativeModules.NotifeeApiModule);
}

export function loadNotifyKitModule(): NotifyKitPackage | null {
  if (!isNotifyKitNativeAvailable()) {
    notifyKitModule = null;
    return null;
  }
  if (notifyKitModule !== undefined) return notifyKitModule;
  try {
    // Must not import at file top-level — Expo Go has no native module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    notifyKitModule = require("react-native-notify-kit") as NotifyKitPackage;
  } catch {
    notifyKitModule = null;
  }
  return notifyKitModule;
}
