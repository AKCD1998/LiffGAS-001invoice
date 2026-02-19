import { initLineContext } from "./liff-client.js";
import { ROUTES, currentRoute, navigate, onRouteChange } from "./router.js";
import {
  getDraft as fetchDraft,
  getErrorDisplayText,
  isGasConfigured,
} from "./api.js";
import { renderCustomerSection1 } from "./customer/section1.js";
import { renderCustomerSection2 } from "./customer/section2.js";
import { renderCustomerSection3 } from "./customer/section3.js";
import { renderCustomerSection5 } from "./customer/section5.js";
import { renderCustomerSummary } from "./customer/summary.js";
import {
  clearAdminAuth,
  clearAdminToken,
  clearDraft,
  getAdminAuth,
  getAdminToken,
  getDraft,
  mergeDraftPatch,
  setAdminAuth,
  setAdminToken,
  setDraft,
} from "./state.js";
import { renderAdminLogin } from "./admin/login.js";
import { renderAdminDashboard } from "./admin/dashboard.js";
import { renderAdminRequestDetail } from "./admin/requestDetail.js";

const app = document.getElementById("app");
let envFooterEl = null;

let lineContext = {
  lineUserId: null,
  displayName: "",
  source: "booting",
};

const memoryState = {
  lastCustomerSection1Save: null,
  lastCustomerSection2Save: null,
  lastCustomerSection3Save: null,
  lastCustomerSection5Save: null,
  customerHomeNotice: "",
  section1Notice: "",
  resumingDraft: false,
  adminNotice: "",
};

function toBoolean(value) {
  if (value === true) {
    return true;
  }
  if (value === false || value === null || typeof value === "undefined") {
    return false;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

function pickNextRouteFromDraft(draft) {
  if (!draft || typeof draft !== "object") {
    return ROUTES.CUSTOMER_SECTION1;
  }
  if (!toBoolean(draft.sec1_done)) {
    return ROUTES.CUSTOMER_SECTION1;
  }
  if (!toBoolean(draft.sec2_done)) {
    return ROUTES.CUSTOMER_SECTION2;
  }
  if (!toBoolean(draft.sec3_done)) {
    return ROUTES.CUSTOMER_SECTION3;
  }
  if (!toBoolean(draft.sec5_done)) {
    return ROUTES.CUSTOMER_SECTION5;
  }
  return ROUTES.CUSTOMER_SUMMARY;
}

function mergeResultToDraft(result, sectionData) {
  const patch = {
    ...(sectionData || {}),
    requestId: result?.requestId || undefined,
    lineUserId: result?.lineUserId || lineContext.lineUserId || "",
    updatedAt: result?.updatedAt || new Date().toISOString(),
  };

  if (result?.progress) {
    patch.sec1_done = result.progress.sec1_done;
    patch.sec2_done = result.progress.sec2_done;
    patch.sec3_done = result.progress.sec3_done;
    patch.sec5_done = result.progress.sec5_done;
    patch.progress_percent = result.progress.progress_percent;
  }

  const statusFromResult =
    result?.status ||
    result?.changed?.status ||
    (result?.progress?.progress_percent === 100 ? "ready" : "");
  if (statusFromResult) {
    patch.status = statusFromResult;
  }

  mergeDraftPatch(patch);
}

function adminAbsoluteUrl() {
  const base = `${window.location.origin}${window.location.pathname}${window.location.search}`;
  return `${base}#${ROUTES.ADMIN}`;
}

function getLiffSdk() {
  return typeof window !== "undefined" ? window.liff : null;
}

function isInLiffClient() {
  const liffSdk = getLiffSdk();
  if (!liffSdk || typeof liffSdk.isInClient !== "function") {
    return false;
  }
  try {
    return !!liffSdk.isInClient();
  } catch (error) {
    return false;
  }
}

function isLikelyLineInAppBrowser() {
  const ua = String(window.navigator?.userAgent || "");
  return /Line\//i.test(ua);
}

function openExternalFallback(url) {
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    window.location.href = url;
  }
}

function openAdminEntry() {
  const targetUrl = adminAbsoluteUrl();
  const inLiffClient = isInLiffClient();
  const shouldOpenExternal = inLiffClient || isLikelyLineInAppBrowser();

  if (!shouldOpenExternal) {
    navigate(ROUTES.ADMIN);
    return;
  }

  if (typeof window.alert === "function") {
    window.alert("กำลังเปิดในเบราว์เซอร์เพื่อเข้าสู่ระบบผู้ดูแล");
  }

  const liffSdk = getLiffSdk();
  if (inLiffClient && liffSdk && typeof liffSdk.openWindow === "function") {
    try {
      liffSdk.openWindow({
        url: targetUrl,
        external: true,
      });
      return;
    } catch (error) {
      console.warn("LIFF openWindow failed, fallback to window.open", error);
    }
  }

  openExternalFallback(targetUrl);
}

function renderHome() {
  app.innerHTML = `
    <main class="card">
      <h1 class="title">SC Group - ระบบขอเอกสาร</h1>
      <p class="subtitle">เลือกโหมดการใช้งาน</p>

      <div class="button-row">
        <button class="btn btn-primary" data-route="${ROUTES.CUSTOMER}">เป็นลูกค้า</button>
        <button id="openAdminExternalButton" class="btn btn-secondary" type="button">เป็นผู้ดูแลระบบ</button>
      </div>

      <p class="meta">lineUserId: ${lineContext.lineUserId ?? "กำลังโหลด..."}</p>
      <p class="meta">source: ${lineContext.source}</p>
    </main>
  `;

  const openAdminButton = app.querySelector("#openAdminExternalButton");
  if (openAdminButton) {
    openAdminButton.addEventListener("click", () => {
      openAdminEntry();
    });
  }
}

function ensureEnvFooter() {
  if (!envFooterEl) {
    envFooterEl = document.createElement("div");
    envFooterEl.id = "envFooter";
    envFooterEl.className = "env-footer hidden";
    document.body.appendChild(envFooterEl);
  }

  if (isGasConfigured()) {
    envFooterEl.classList.add("hidden");
    envFooterEl.textContent = "";
    return;
  }

  envFooterEl.textContent = "DEV MODE";
  envFooterEl.classList.remove("hidden");
}

function renderCustomerHome() {
  const notice = String(memoryState.customerHomeNotice || "").trim();
  const noticeClass = notice ? "" : "hidden";
  const resumeLabel = memoryState.resumingDraft
    ? "กำลังโหลดแบบร่าง..."
    : "แก้ไขแบบร่างล่าสุด";

  app.innerHTML = `
    <main class="card">
      <h1 class="title">โหมดลูกค้า</h1>
      <p class="subtitle">เลือกวิธีเริ่มต้นการกรอกข้อมูล</p>
      <div class="banner banner-warning ${noticeClass}">${notice}</div>
      <div class="button-row">
        <button id="startNewButton" class="btn btn-primary">เริ่มกรอกใหม่</button>
        <button id="resumeDraftButton" class="btn btn-secondary">${resumeLabel}</button>
        <button class="btn btn-ghost" data-route="${ROUTES.HOME}">กลับหน้าหลัก</button>
      </div>
      <p class="meta">lineUserId: ${lineContext.lineUserId ?? "-"}</p>
    </main>
  `;
}

async function resumeLatestDraft() {
  const lineUserId = String(lineContext.lineUserId || "").trim();
  if (!lineUserId) {
    clearDraft();
    memoryState.section1Notice = "ยังไม่พบ lineUserId กรุณาเริ่มกรอกใหม่";
    navigate(ROUTES.CUSTOMER_SECTION1);
    return;
  }

  try {
    const result = await fetchDraft(lineUserId);
    if (result?.found && result.request) {
      setDraft(result.request);
      memoryState.customerHomeNotice = "";
      navigate(pickNextRouteFromDraft(result.request));
      return;
    }

    clearDraft();
    memoryState.section1Notice = "ยังไม่มีแบบร่าง กรุณาเริ่มกรอกใหม่";
    navigate(ROUTES.CUSTOMER_SECTION1);
  } catch (error) {
    memoryState.customerHomeNotice = `โหลดแบบร่างไม่สำเร็จ: ${getErrorDisplayText(
      error,
      true,
    )}`;
    renderRoute(ROUTES.CUSTOMER);
  }
}

function bindCustomerHomeActions() {
  const startButton = app.querySelector("#startNewButton");
  const resumeButton = app.querySelector("#resumeDraftButton");

  if (startButton) {
    startButton.addEventListener("click", () => {
      clearDraft();
      memoryState.customerHomeNotice = "";
      memoryState.section1Notice = "";
      navigate(ROUTES.CUSTOMER_SECTION1);
    });
  }

  if (resumeButton) {
    resumeButton.addEventListener("click", async () => {
      if (memoryState.resumingDraft) {
        return;
      }
      memoryState.resumingDraft = true;
      renderRoute(ROUTES.CUSTOMER);
      await resumeLatestDraft();
      memoryState.resumingDraft = false;
      if (currentRoute() === ROUTES.CUSTOMER) {
        renderRoute(ROUTES.CUSTOMER);
      }
    });
  }
}

function renderRoute(route) {
  if (route === ROUTES.CUSTOMER) {
    renderCustomerHome();
    bindCustomerHomeActions();
  } else if (route === ROUTES.CUSTOMER_SECTION1) {
    const draft = getDraft() || {};
    const initialNotice = memoryState.section1Notice;
    memoryState.section1Notice = "";

    renderCustomerSection1({
      rootEl: app,
      lineUserId: lineContext.lineUserId || "",
      initialData: draft,
      initialNotice: initialNotice,
      lastSaved: memoryState.lastCustomerSection1Save,
      onBack: () => navigate(ROUTES.CUSTOMER),
      onSaved: (result, sectionData) => {
        memoryState.lastCustomerSection1Save = result;
        mergeResultToDraft(result, sectionData);
        setTimeout(() => navigate(ROUTES.CUSTOMER_SECTION2), 450);
      },
    });
  } else if (route === ROUTES.CUSTOMER_SECTION2) {
    const draft = getDraft() || {};
    renderCustomerSection2({
      rootEl: app,
      lineUserId: lineContext.lineUserId || "",
      initialData: draft,
      lastSaved: memoryState.lastCustomerSection2Save,
      onBack: () => navigate(ROUTES.CUSTOMER_SECTION1),
      onSaved: (result, sectionData) => {
        memoryState.lastCustomerSection2Save = result;
        mergeResultToDraft(result, sectionData);
        navigate(ROUTES.CUSTOMER_SECTION3);
      },
    });
  } else if (route === ROUTES.CUSTOMER_SECTION3) {
    const draft = getDraft() || {};
    renderCustomerSection3({
      rootEl: app,
      lineUserId: lineContext.lineUserId || "",
      initialData: draft,
      lastSaved: memoryState.lastCustomerSection3Save,
      onBack: () => navigate(ROUTES.CUSTOMER_SECTION2),
      onSaved: (result, sectionData) => {
        memoryState.lastCustomerSection3Save = result;
        mergeResultToDraft(result, sectionData);
        navigate(ROUTES.CUSTOMER_SECTION5);
      },
    });
  } else if (route === ROUTES.CUSTOMER_SECTION5) {
    const draft = getDraft() || {};
    renderCustomerSection5({
      rootEl: app,
      lineUserId: lineContext.lineUserId || "",
      initialData: draft,
      lastSaved: memoryState.lastCustomerSection5Save,
      onBack: () => navigate(ROUTES.CUSTOMER_SECTION3),
      onSaved: (result, sectionData) => {
        memoryState.lastCustomerSection5Save = result;
        mergeResultToDraft(result, sectionData);
        navigate(ROUTES.CUSTOMER_SUMMARY);
      },
    });
  } else if (route === ROUTES.CUSTOMER_SUMMARY) {
    renderCustomerSummary({
      rootEl: app,
      draft: getDraft(),
    });
  } else if (route === ROUTES.ADMIN) {
    renderAdminLogin({
      rootEl: app,
      lineUserId: lineContext.lineUserId || "",
      adminAuth: getAdminAuth(),
      notice: memoryState.adminNotice,
      onAuthSuccess: (authState, token) => {
        setAdminAuth(authState);
        setAdminToken(token);
        memoryState.adminNotice = "ยืนยันตัวตนสำเร็จ ✅";
      },
      onOpenDashboard: () => navigate(ROUTES.ADMIN_DASHBOARD),
    });
  } else if (route === ROUTES.ADMIN_DASHBOARD) {
    const adminAuth = getAdminAuth();
    const adminToken = getAdminToken();

    renderAdminDashboard({
      rootEl: app,
      adminAuth: adminAuth,
      adminToken: adminToken,
      lineUserId: lineContext.lineUserId || "",
      onLogout: () => {
        clearAdminAuth();
        clearAdminToken();
        memoryState.adminNotice = "ออกจากระบบแล้ว";
        navigate(ROUTES.ADMIN);
      },
      onBack: () => navigate(ROUTES.ADMIN),
      onOpenDetail: (requestId) =>
        navigate(`${ROUTES.ADMIN_REQUEST_PREFIX}${encodeURIComponent(requestId)}`),
    });
  } else if (route.startsWith(ROUTES.ADMIN_REQUEST_PREFIX)) {
    const requestId = decodeURIComponent(
      route.slice(ROUTES.ADMIN_REQUEST_PREFIX.length),
    );
    const adminToken = getAdminToken();
    const adminAuth = getAdminAuth();
    if (!adminAuth || !adminAuth.isAdmin || !adminToken) {
      memoryState.adminNotice = "กรุณาเข้าสู่ระบบใหม่";
    }

    renderAdminRequestDetail({
      rootEl: app,
      lineUserId: lineContext.lineUserId || "",
      adminToken: adminToken,
      requestId: requestId,
      onBack: () => navigate(ROUTES.ADMIN_DASHBOARD),
      onBackToLogin: () => navigate(ROUTES.ADMIN),
    });
  } else {
    renderHome();
  }

  app.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const targetRoute = event.currentTarget.dataset.route;
      navigate(targetRoute);
    });
  });

  ensureEnvFooter();
}

async function bootstrap() {
  try {
    lineContext = await initLineContext();
  } catch (error) {
    lineContext.source = "liff-error";
    console.error("LIFF bootstrap failed", error);
  }

  onRouteChange(renderRoute);
}

bootstrap();
