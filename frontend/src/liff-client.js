import { APP_CONFIG } from "./config.js";

export async function initLineContext() {
  const context = {
    lineUserId: null,
    displayName: "",
    source: "unknown",
  };

  const hasLiffSdk = typeof window !== "undefined" && typeof window.liff !== "undefined";
  const liffConfigured =
    APP_CONFIG.LIFF_ID && APP_CONFIG.LIFF_ID !== "YOUR_LIFF_ID";

  if (!hasLiffSdk || !liffConfigured) {
    context.lineUserId = APP_CONFIG.DEV_LINE_USER_ID;
    context.source = "dev-stub";
    return context;
  }

  await window.liff.init({ liffId: APP_CONFIG.LIFF_ID });

  if (!window.liff.isLoggedIn()) {
    window.liff.login({ redirectUri: window.location.href });
    return context;
  }

  const profile = await window.liff.getProfile();
  context.lineUserId = profile.userId ?? null;
  context.displayName = profile.displayName ?? "";
  context.source = "liff";
  return context;
}
