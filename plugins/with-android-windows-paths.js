const {
  withAppBuildGradle,
  withGradleProperties,
} = require("expo/config-plugins");

// Long native paths on Windows only; do not pin CMAKE_MAKE_PROGRAM — EAS/cloud
// images ship a different CMake version than a local Android SDK install.
const CMAKE_WINDOWS_BLOCK = `
        if (org.apache.tools.ant.taskdefs.condition.Os.isFamily(org.apache.tools.ant.taskdefs.condition.Os.FAMILY_WINDOWS)) {
            externalNativeBuild {
                cmake {
                    arguments "-DCMAKE_OBJECT_PATH_MAX=1024"
                }
            }
        }
`;

/** @type {import('expo/config-plugins').ConfigPlugin} */
module.exports = function withAndroidWindowsPaths(config) {
  config = withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;
    const existing = props.find(
      (p) => p.type === "property" && p.key === "android.enableLongPaths",
    );
    if (!existing) {
      props.push({
        type: "property",
        key: "android.enableLongPaths",
        value: "true",
      });
    }
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") {
      return cfg;
    }

    let contents = cfg.modResults.contents;
    if (!contents.includes("CMAKE_OBJECT_PATH_MAX")) {
      if (
        !contents.includes(
          "import org.apache.tools.ant.taskdefs.condition.Os",
        )
      ) {
        contents = contents.replace(
          /apply plugin: "com\.facebook\.react"\n/,
          'apply plugin: "com.facebook.react"\n\nimport org.apache.tools.ant.taskdefs.condition.Os\n',
        );
      }
      contents = contents.replace(
        /versionName\s+"[^"]+"/,
        (match) => `${match}\n${CMAKE_WINDOWS_BLOCK}`,
      );
    }
    cfg.modResults.contents = contents;
    return cfg;
  });

  return config;
};
