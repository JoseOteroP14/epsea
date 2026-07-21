/** Base URL of the EPSEA API (no trailing slash). */
export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ??
  "https://epsea.ineansastem.com/agro-test/api/v1"
).replace(/\/$/, "");
