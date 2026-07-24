/**
 * Windows Android helper for Expo New Architecture.
 *
 * SDK Ninja hard-fails on paths ≥260 chars. Ninja 1.12 allows longer paths when
 * Windows Long Paths is enabled; otherwise we shorten via subst + a junction.
 *
 * EAS/Linux never hits this script.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const SHORT_NM = "n"; // <drive>:\n holds real node_modules content

function run(command, args, opts = {}) {
  return spawnSync(command, args, {
    stdio: opts.stdio ?? "inherit",
    shell: opts.shell ?? false,
    cwd: opts.cwd,
    encoding: "utf8",
  });
}

function ensureWindowsNinja() {
  const ps1 = path.join(__dirname, "ensure-windows-ninja.ps1");
  const ensure = run("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    ps1,
  ]);
  if (ensure.status !== 0) process.exit(ensure.status ?? 1);
}

function windowsLongPathsEnabled() {
  const result = run(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      "(Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem' -Name 'LongPathsEnabled' -ErrorAction SilentlyContinue).LongPathsEnabled",
    ],
    { stdio: "pipe" },
  );
  return String(result.stdout || "").trim() === "1";
}

function isJunction(p) {
  try {
    return Boolean(fs.lstatSync(p).isSymbolicLink());
  } catch {
    return false;
  }
}

function findFreeDriveLetter() {
  for (const letter of "PQRSTUVWXYZ") {
    try {
      if (!fs.existsSync(`${letter}:\\`)) return letter;
    } catch {
      return letter;
    }
  }
  return null;
}

function mapProjectToShortDrive() {
  const letter = findFreeDriveLetter();
  if (!letter) {
    console.error("No free drive letter for subst; enable Windows Long Paths instead.");
    process.exit(1);
  }
  run("subst", [`${letter}:`, "/D"], { stdio: "ignore", shell: true });
  const mapped = run("subst", [`${letter}:`, root], { shell: true });
  if (mapped.status !== 0) {
    console.error(`subst ${letter}: failed`);
    process.exit(mapped.status ?? 1);
  }
  console.log(`Mapped ${letter}:\\ -> ${root}`);
  return `${letter}:\\`;
}

/**
 * Make node_modules a junction to <project>\n so CMake encodes E_/n/... instead of
 * E_/node_modules/... (clears Ninja's 260-char limit when Long Paths is off).
 */
function ensureShortNodeModules(projectRoot) {
  const nm = path.join(projectRoot, "node_modules");
  const short = path.join(projectRoot, SHORT_NM);

  if (isJunction(nm)) {
    console.log(`node_modules already junctions to short path (${SHORT_NM})`);
    return;
  }

  if (!fs.existsSync(nm)) {
    console.error("node_modules missing; run bun install first");
    process.exit(1);
  }

  if (fs.existsSync(short)) {
    console.log(`Removing stale ${SHORT_NM}\\ before remap...`);
    fs.rmSync(short, { recursive: true, force: true });
  }

  console.log(`Moving node_modules -> ${SHORT_NM} (same volume, usually fast)...`);
  fs.renameSync(nm, short);

  const link = run("cmd", ["/c", "mklink", "/J", nm, short]);
  if (link.status !== 0) {
    try {
      fs.renameSync(short, nm);
    } catch {
      /* ignore */
    }
    console.error(
      "Failed to create node_modules junction. Enable Windows Long Paths as Admin instead.",
    );
    process.exit(link.status ?? 1);
  }
  console.log(`Linked node_modules\\ => ${SHORT_NM}\\`);
}

function cleanCxx(projectRoot) {
  const cxx = path.join(projectRoot, "android", "app", ".cxx");
  if (fs.existsSync(cxx)) {
    fs.rmSync(cxx, { recursive: true, force: true });
    console.log("Cleared android/app/.cxx");
  }
}

function printLongPathsHint() {
  console.log(`
Tip (permanent fix, Admin PowerShell once):
  New-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem' -Name 'LongPathsEnabled' -Value 1 -PropertyType DWORD -Force
Then open a new terminal.
`);
}

let cwd = root;

if (process.platform === "win32") {
  ensureWindowsNinja();

  if (windowsLongPathsEnabled()) {
    console.log("Windows Long Paths enabled — building from project path.");
  } else {
    console.log(
      "Windows Long Paths disabled — using short-path workaround (subst + node_modules junction).",
    );
    cwd = mapProjectToShortDrive();
    ensureShortNodeModules(cwd);
    cleanCxx(cwd);
    printLongPathsHint();
  }
}

const result = run("expo", ["run:android", ...process.argv.slice(2)], {
  shell: true,
  cwd,
});
process.exit(result.status ?? 1);
