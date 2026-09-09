const PRODUCTION_API_URL = "https://epsea.ineansastem.com/agro/api/v1";
const STAGING_API_URL = "https://epsea.ineansastem.com/agro-test/api/v1";

function resolveDefaultApiUrl(): string {
  const appEnv = process.env.EXPO_PUBLIC_APP_ENV;
  if (appEnv === "development" || appEnv === "preview") {
    return STAGING_API_URL;
  }
  return PRODUCTION_API_URL;
}

/** Base URL of the EPSEA API (no trailing slash). */
export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? resolveDefaultApiUrl()
).replace(/\/$/, "");
