const { withInfoPlist } = require("expo/config-plugins");

function withIosBackgroundSync(config) {
  return withInfoPlist(config, (cfg) => {
    const modes = new Set(cfg.modResults.UIBackgroundModes ?? []);
    modes.add("fetch");
    modes.add("processing");
    cfg.modResults.UIBackgroundModes = Array.from(modes);

    const bundleId =
      cfg.ios?.bundleIdentifier ??
      cfg.modResults.CFBundleIdentifier ??
      "com.miagroalimentaria.epsea";
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
  return withIosBackgroundSync(config);
};
