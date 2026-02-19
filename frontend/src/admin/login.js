import { adminLogin, getErrorDisplayText, isGasConfigured } from "../api.js";
import { GAS_WEBAPP_URL, GOOGLE_CLIENT_ID } from "../config.js";

function isGoogleClientConfigured() {
  const clientId = String(GOOGLE_CLIENT_ID || "").trim();
  return clientId !== "" && clientId !== "REPLACE_ME";
}

function waitForGis(timeoutMs) {
  const timeout = Number(timeoutMs) || 7000;
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      const gis = window.google && window.google.accounts && window.google.accounts.id;
      if (gis) {
        clearInterval(timer);
        resolve(gis);
        return;
      }
      if (Date.now() - startedAt > timeout) {
        clearInterval(timer);
        reject(new Error("ไม่สามารถโหลด Google Sign-In ได้"));
      }
    }, 120);
  });
}

function setStatus(el, message, type) {
  if (!el) {
    return;
  }
  const text = String(message || "").trim();
  el.textContent = text;
  el.className = "banner";
  if (!text) {
    el.classList.add("hidden");
    return;
  }
  if (type === "success") {
    el.classList.add("banner-success");
  } else if (type === "error") {
    el.classList.add("banner-error");
  } else {
    el.classList.add("banner-warning");
  }
}

function sanitizeAuthResult(result) {
  return {
    isAdmin: !!result?.isAdmin,
    email: String(result?.email || "").trim(),
    name: String(result?.name || "").trim(),
    picture: String(result?.picture || "").trim(),
    role: String(result?.role || "admin").trim() || "admin",
    ts: new Date().toISOString(),
  };
}

export function renderAdminLogin(options) {
  const rootEl = options.rootEl;
  const lineUserId = String(options.lineUserId || "").trim();
  const adminAuth = options.adminAuth || null;
  const notice = String(options.notice || "").trim();
  const onAuthSuccess = options.onAuthSuccess;
  const onOpenDashboard = options.onOpenDashboard;

  rootEl.innerHTML = `
    <main class="card">
      <h1 class="title">เข้าสู่ระบบผู้ดูแล</h1>
      <p class="subtitle">ยืนยันตัวตนด้วยบัญชี Google Workspace</p>

      <div id="adminStatus" class="banner hidden"></div>

      <div class="admin-panel">
        <div id="googleButtonWrap" class="google-button-wrap"></div>
        <div class="button-row admin-actions">
          <button id="openDashboardButton" class="btn btn-secondary hidden">ไปที่แดชบอร์ด</button>
        </div>
      </div>

      <p class="meta">lineUserId: ${lineUserId || "-"}</p>
      <p class="meta">GAS: ${String(GAS_WEBAPP_URL || "").trim() || "-"}</p>
    </main>
  `;

  const statusEl = rootEl.querySelector("#adminStatus");
  const googleButtonWrapEl = rootEl.querySelector("#googleButtonWrap");
  const openDashboardButtonEl = rootEl.querySelector("#openDashboardButton");

  function showDashboardButton() {
    openDashboardButtonEl.classList.remove("hidden");
  }

  function hideDashboardButton() {
    openDashboardButtonEl.classList.add("hidden");
  }

  openDashboardButtonEl.addEventListener("click", () => {
    if (typeof onOpenDashboard === "function") {
      onOpenDashboard();
    }
  });

  if (adminAuth && adminAuth.isAdmin) {
    setStatus(
      statusEl,
      `ยืนยันตัวตนสำเร็จ ✅ (${adminAuth.email || "admin"})`,
      "success",
    );
    showDashboardButton();
    return;
  }

  hideDashboardButton();

  if (notice) {
    setStatus(statusEl, notice, "warning");
  }

  if (!isGoogleClientConfigured()) {
    setStatus(statusEl, "ยังไม่ตั้งค่า GOOGLE_CLIENT_ID", "warning");
    return;
  }

  if (!isGasConfigured()) {
    setStatus(statusEl, "ยังไม่ตั้งค่า GAS_WEBAPP_URL", "warning");
    return;
  }

  if (!lineUserId) {
    setStatus(statusEl, "ไม่พบ lineUserId จาก LIFF", "error");
    return;
  }

  setStatus(statusEl, "พร้อมยืนยันตัวตน Google", "warning");

  let authenticating = false;

  waitForGis()
    .then((gis) => {
      gis.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          if (authenticating) {
            return;
          }
          authenticating = true;
          setStatus(statusEl, "กำลังยืนยันตัวตน...", "warning");

          try {
            const token = String(response?.credential || "").trim();
            if (!token) {
              throw new Error("Google credential ไม่ถูกต้อง");
            }

            const result = await adminLogin({
              lineUserId: lineUserId,
              googleIdToken: token,
              clientTs: new Date().toISOString(),
            });

            const authState = sanitizeAuthResult(result);
            if (typeof onAuthSuccess === "function") {
              onAuthSuccess(authState, token);
            }
            setStatus(
              statusEl,
              `ยืนยันตัวตนสำเร็จ ✅ (${authState.email || "admin"})`,
              "success",
            );
            showDashboardButton();
          } catch (error) {
            setStatus(
              statusEl,
              `ยืนยันตัวตนไม่สำเร็จ: ${getErrorDisplayText(error, true)}`,
              "error",
            );
            hideDashboardButton();
          } finally {
            authenticating = false;
          }
        },
      });

      googleButtonWrapEl.innerHTML = "";
      gis.renderButton(googleButtonWrapEl, {
        type: "standard",
        shape: "pill",
        theme: "filled_blue",
        text: "signin_with",
        size: "large",
        width: 300,
      });
    })
    .catch((error) => {
      setStatus(statusEl, error.message || "โหลด Google Sign-In ไม่สำเร็จ", "error");
    });
}
