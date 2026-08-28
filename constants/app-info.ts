/** Public app metadata used in UI and release docs. Override via EXPO_PUBLIC_* env vars. */
export const APP_INFO = {
  name: "EPSEA",
  organization: "Universidad de Córdoba",
  program: "Escuela de Producción y Sostenibilidad Agroalimentaria (EPSEA)",
  androidPackage: "com.epsea.unicordoba",
  supportEmail:
    process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? "epsea@unicordoba.edu.co",
  websiteUrl:
    process.env.EXPO_PUBLIC_WEBSITE_URL ??
    "https://www.unicordoba.edu.co",
  privacyPolicyUrl:
    process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ??
    "https://www.miagroalimentaria.com/#/politica",
} as const;

export function hasConfiguredPrivacyPolicyUrl(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL?.trim());
}
