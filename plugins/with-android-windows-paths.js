const {
  withAppBuildGradle,
  withGradleProperties,
} = require("expo/config-plugins");

// Local Windows: long object paths need Ninja ≥1.12 (SDK ships an old ninja with MAX_PATH).
// Only set CMAKE_MAKE_PROGRAM when android/.tools/ninja.exe exists so EAS/Linux builds are untouched.
const CMAKE_WINDOWS_BLOCK = `
        if (org.apache.tools.ant.taskdefs.condition.Os.isFamily(org.apache.tools.ant.taskdefs.condition.Os.FAMILY_WINDOWS)) {
            def windowsNinja = new File(rootDir, ".tools/ninja.exe")
            externalNativeBuild {
                cmake {
                    def cmakeArgs = ["-DCMAKE_OBJECT_PATH_MAX=1024"]
                    if (windowsNinja.exists()) {
                        cmakeArgs.add("-DCMAKE_MAKE_PROGRAM=\${windowsNinja.absolutePath.replace('\\\\', '/')}")
                    }
                    arguments(*cmakeArgs)
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

    // Replace any prior Windows CMAKE_OBJECT_PATH_MAX block so prebuild stays idempotent.
    const windowsCmakeBlockRe =
      /\n\s*\/\/ Windows[\s\S]*?if \(org\.apache\.tools\.ant\.taskdefs\.condition\.Os\.isFamily\(org\.apache\.tools\.ant\.taskdefs\.condition\.Os\.FAMILY_WINDOWS\)\) \{[\s\S]*?\n\s*\}\n/;
    const legacyWindowsCmakeBlockRe =
      /\n\s*if \(org\.apache\.tools\.ant\.taskdefs\.condition\.Os\.isFamily\(org\.apache\.tools\.ant\.taskdefs\.condition\.Os\.FAMILY_WINDOWS\)\) \{\s*externalNativeBuild \{\s*cmake \{\s*arguments "-DCMAKE_OBJECT_PATH_MAX=\d+"\s*\}\s*\}\s*\}\n/;

    contents = contents.replace(windowsCmakeBlockRe, "\n");
    contents = contents.replace(legacyWindowsCmakeBlockRe, "\n");

    if (!contents.includes("windowsNinja")) {
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
