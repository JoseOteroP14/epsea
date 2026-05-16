// Bun on Windows can leave extensionless junctions under nested .bin folders
// that Node cannot lstat (EACCES). Metro's file watcher then crashes on start.
// Remove only entries that fail lstat; keep .exe / .bunx / .cmd shims.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "node_modules");
const KEEP_EXT = /\.(exe|bunx|cmd|ps1)$/i;

let removed = 0;

function cleanBinDir(binDir) {
  let names;
  try {
    names = fs.readdirSync(binDir);
  } catch {
    return;
  }

  for (const name of names) {
    if (KEEP_EXT.test(name)) continue;

    const fullPath = path.join(binDir, name);
    try {
      fs.lstatSync(fullPath);
    } catch (err) {
      if (err.code === "EACCES" || err.code === "ENOENT") {
        try {
          fs.unlinkSync(fullPath);
          removed += 1;
        } catch {
          // ignore
        }
      }
    }
  }
}

function walk(dir, depth = 0) {
  if (depth > 14) return;

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const ent of entries) {
    const fullPath = path.join(dir, ent.name);
    if (!ent.isDirectory()) continue;

    if (ent.name === ".bin") {
      cleanBinDir(fullPath);
      continue;
    }

    if (ent.name === "node_modules" || depth < 10) {
      walk(fullPath, depth + 1);
    }
  }
}

if (fs.existsSync(ROOT)) {
  walk(ROOT);
}

if (removed > 0) {
  console.log(`[fix-node-modules-bin] Removed ${removed} broken .bin link(s).`);
}
