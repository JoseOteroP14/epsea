#!/usr/bin/env node
/**
 * Validates release-related config before an EAS production build.
 * Run: bun run validate:release
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const appJson = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
const easJson = JSON.parse(fs.readFileSync(path.join(root, "eas.json"), "utf8"));

const productionEnv = easJson.build?.production?.env ?? {};
const androidPackage = appJson.expo?.android?.package;
const issues = [];
const warnings = [];

if (!androidPackage) {
  issues.push("app.json: falta expo.android.package");
}

if (androidPackage !== "com.epsea.unicordoba") {
  warnings.push(
    `Package Android actual: ${androidPackage}. Play Console debe usar el mismo valor.`,
  );
}

const apiUrl = productionEnv.EXPO_PUBLIC_API_URL;
if (!apiUrl) {
  issues.push("eas.json production: falta EXPO_PUBLIC_API_URL");
} else if (apiUrl.includes("agro-test")) {
  issues.push(
    "eas.json production: EXPO_PUBLIC_API_URL apunta a agro-test. Usa la URL de producción.",
  );
}

const privacyUrl = productionEnv.EXPO_PUBLIC_PRIVACY_POLICY_URL;
if (!privacyUrl) {
  issues.push("eas.json production: falta EXPO_PUBLIC_PRIVACY_POLICY_URL");
} else if (privacyUrl.includes("unicordoba.edu.co/epsea/politica-de-privacidad")) {
  warnings.push(
    "Política de privacidad usa URL placeholder. Publica docs/legal/privacy-policy.html y actualiza la URL.",
  );
}

const supportEmail = productionEnv.EXPO_PUBLIC_SUPPORT_EMAIL;
if (!supportEmail) {
  warnings.push("eas.json production: falta EXPO_PUBLIC_SUPPORT_EMAIL");
}

const buildType = easJson.build?.production?.android?.buildType;
if (buildType !== "app-bundle") {
  issues.push('eas.json production android.buildType debe ser "app-bundle" para Play Store');
}

const reviewerTemplate = path.join(root, "docs", "store-listing", "reviewer-access.local.md");
if (!fs.existsSync(reviewerTemplate)) {
  warnings.push(
    "Crea docs/store-listing/reviewer-access.local.md (copia de reviewer-access.template.md) con credenciales demo.",
  );
}

const screenshotsDir = path.join(root, "store-assets", "screenshots", "phone");
if (!fs.existsSync(screenshotsDir) || fs.readdirSync(screenshotsDir).length < 2) {
  warnings.push(
    "Faltan capturas en store-assets/screenshots/phone/ (mínimo 2 PNG/JPG para Play Console).",
  );
}

const featureGraphic = path.join(root, "store-assets", "feature-graphic.png");
if (!fs.existsSync(featureGraphic)) {
  warnings.push("Falta store-assets/feature-graphic.png (1024×500).");
}

console.log("EPSEA — validación de release\n");

if (issues.length === 0 && warnings.length === 0) {
  console.log("OK: configuración mínima lista para build de producción.\n");
  process.exit(0);
}

if (issues.length > 0) {
  console.log("Errores (corrige antes del build):");
  for (const item of issues) console.log(`  ✗ ${item}`);
  console.log("");
}

if (warnings.length > 0) {
  console.log("Advertencias (requieren acción fuera del repo o assets):");
  for (const item of warnings) console.log(`  ! ${item}`);
  console.log("");
}

console.log("Guía completa: docs/PLAY_STORE_RELEASE.md\n");
process.exit(issues.length > 0 ? 1 : 0);
