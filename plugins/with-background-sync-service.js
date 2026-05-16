const { withAndroidManifest, withInfoPlist } = require("expo/config-plugins");

// Notifee foreground service (see @notifee/react-native Android manifest merge).
const SERVICE_CLASS = "app.notifee.core.ForegroundService";

function ensurePermission(manifest, name) {
  if (!manifest["uses-permission"]) {
    manifest["uses-permission"] = [];
  }
  const list = manifest["uses-permission"];
  if (!list.some((entry) => entry.$["android:name"] === name)) {
    list.push({ $: { "android:name": name } });
  }
}

function withAndroidBackgroundSync(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    ensurePermission(manifest, "android.permission.FOREGROUND_SERVICE");
    ensurePermission(manifest, "android.permission.FOREGROUND_SERVICE_DATA_SYNC");
    ensurePermission(manifest, "android.permission.WAKE_LOCK");

    const application = manifest.application?.[0];
    if (application) {
      if (!application.service) {
        application.service = [];
      }
      const exists = application.service.some(
        (entry) => entry.$["android:name"] === SERVICE_CLASS,
      );
      if (!exists) {
        application.service.push({
          $: {
            "android:name": SERVICE_CLASS,
            "android:foregroundServiceType": "dataSync",
          },
        });
      }
    }

    return cfg;
  });
}

function withIosBackgroundSync(config) {
  return withInfoPlist(config, (cfg) => {
    const modes = new Set(cfg.modResults.UIBackgroundModes ?? []);
    modes.add("fetch");
    modes.add("processing");
    cfg.modResults.UIBackgroundModes = Array.from(modes);

    const bundleId =
      cfg.ios?.bundleIdentifier ??
      cfg.modResults.CFBundleIdentifier ??
      "com.andresortizjdk.epsea";
    const identifiers = new Set(
      cfg.modResults.BGTaskSchedulerPermittedIdentifiers ?? [],
    );
    identifiers.add(bundleId);
    cfg.modResults.BGTaskSchedulerPermittedIdentifiers = Array.from(identifiers);

    return cfg;
  });
}

/** @type {import('expo/config-plugins').ConfigPlugin} */
module.exports = function withBackgroundSyncService(config) {
  config = withAndroidBackgroundSync(config);
  config = withIosBackgroundSync(config);
  return config;
};
