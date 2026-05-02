const fs = require("fs");
const path = require("path");

const targetPath = path.join(
  __dirname,
  "..",
  "node_modules",
  "@expo",
  "metro-config",
  "build",
  "serializer",
  "findUpPackageJsonPath.js"
);

const targetDir = path.dirname(targetPath);

if (!fs.existsSync(targetPath)) {
  fs.mkdirSync(targetDir, { recursive: true });

  const contents = `"use strict";\nconst fs = require(\"fs\");\nconst path = require(\"path\");\n\nfunction findUpPackageJsonPath(startPath) {\n  let current = startPath;\n  if (path.extname(current)) {\n    current = path.dirname(current);\n  }\n\n  while (true) {\n    const candidate = path.join(current, \"package.json\");\n    if (fs.existsSync(candidate)) {\n      return candidate;\n    }\n    const parent = path.dirname(current);\n    if (parent === current) {\n      throw new Error(\"package.json not found for: \" + startPath);\n    }\n    current = parent;\n  }\n}\n\nmodule.exports = { findUpPackageJsonPath };\n`;

  fs.writeFileSync(targetPath, contents, "utf8");
  console.log("[patch] Added missing @expo/metro-config serializer helper:", targetPath);
}
