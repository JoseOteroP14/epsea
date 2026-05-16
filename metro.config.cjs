const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Gradle writes ephemeral outputs under node_modules during Android builds.
// Metro must not watch them or it crashes with ENOENT when folders disappear.
const gradleBuildArtifacts =
  /[\\/]node_modules[\\/].*[\\/]android[\\/].*[\\/]build[\\/].*/;

config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : []),
  gradleBuildArtifacts,
  /[\\/]android[\\/].*[\\/]build[\\/].*/,
  /[\\/]android[\\/]app[\\/]\.cxx[\\/].*/,
];

module.exports = config;
