import { NativeModules, Platform } from "react-native";

type NotifeePackage = typeof import("@notifee/react-native");

let notifeeModule: NotifeePackage | null | undefined;

/** True when running a native build that links @notifee/react-native (not Expo Go). */
export function isNotifeeNativeAvailable(): boolean {
  if (Platform.OS !== "android") return false;
  return Boolean(NativeModules.NotifeeApiModule);
}

export function loadNotifeeModule(): NotifeePackage | null {
  if (!isNotifeeNativeAvailable()) {
    notifeeModule = null;
    return null;
  }
  if (notifeeModule !== undefined) return notifeeModule;
  try {
    // Must not import at file top-level — Expo Go has no native module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    notifeeModule = require("@notifee/react-native") as NotifeePackage;
  } catch {
    notifeeModule = null;
  }
  return notifeeModule;
}
