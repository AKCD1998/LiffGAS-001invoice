import { normalizePhoneFields } from "./utils/phone.js";

const appState = {
  draft: null,
  adminAuth: null,
  adminToken: "",
};

export function setDraft(request) {
  if (!request || typeof request !== "object") {
    appState.draft = null;
    return;
  }
  appState.draft = normalizePhoneFields({ ...request });
}

export function getDraft() {
  return appState.draft ? { ...appState.draft } : null;
}

export function clearDraft() {
  appState.draft = null;
}

export function mergeDraftPatch(patch) {
  const safePatch =
    patch && typeof patch === "object" && !Array.isArray(patch) ? patch : {};
  if (!appState.draft) {
    appState.draft = {};
  }
  appState.draft = normalizePhoneFields({ ...appState.draft, ...safePatch });
  return { ...appState.draft };
}

export function setAdminAuth(authPayload) {
  const source =
    authPayload && typeof authPayload === "object" ? authPayload : {};
  appState.adminAuth = {
    isAdmin: !!source.isAdmin,
    email: String(source.email || "").trim(),
    name: String(source.name || "").trim(),
    picture: String(source.picture || "").trim(),
    role: String(source.role || "admin").trim() || "admin",
    ts: source.ts || new Date().toISOString(),
  };
}

export function getAdminAuth() {
  return appState.adminAuth ? { ...appState.adminAuth } : null;
}

export function clearAdminAuth() {
  appState.adminAuth = null;
}

export function setAdminToken(token) {
  appState.adminToken = String(token || "").trim();
}

export function getAdminToken() {
  return String(appState.adminToken || "").trim();
}

export function clearAdminToken() {
  appState.adminToken = "";
}
