/**
 * On Windows, ensure Ninja ≥1.12 is available before `expo run:android`
 * (SDK ninja hard-fails on paths >260 chars; New Architecture hits that often).
 */
const { spawnSync } = require("child_process");
const path = require("path");

if (process.platform === "win32") {
  const ps1 = path.join(__dirname, "ensure-windows-ninja.ps1");
  const ensure = spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1],
    { stdio: "inherit" },
  );
  if (ensure.status !== 0) {
    process.exit(ensure.status ?? 1);
  }
}

const result = spawnSync(
  "expo",
  ["run:android", ...process.argv.slice(2)],
  { stdio: "inherit", shell: true },
);
process.exit(result.status ?? 1);
