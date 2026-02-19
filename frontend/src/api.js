import { GAS_WEBAPP_URL } from "./config.js";

const DEV_WARNING_MESSAGE = "โหมดทดสอบ: ยังไม่ตั้งค่า GAS_WEBAPP_URL";
const SIMULATED_REQUESTS = {};

const SIM_BOOLEAN_FIELDS = new Set([
  "sec1_done",
  "sec2_done",
  "sec3_done",
  "sec5_done",
  "taxId_format_ok",
  "taxId_checksum_ok",
  "doc_quotation",
  "doc_invoice",
  "doc_store",
  "doc_receipt_tax",
]);

const ERROR_MESSAGE_MAP = Object.freeze({
  BAD_JSON: "ข้อมูลไม่ถูกต้อง",
  RATE_LIMIT: "ส่งข้อมูลถี่เกินไป กรุณาลองใหม่อีกครั้ง",
  MAINTENANCE: "ระบบปิดปรับปรุงชั่วคราว",
  NOT_AUTHORIZED: "ไม่มีสิทธิ์ใช้งาน กรุณาเข้าสู่ระบบใหม่",
  NOT_FOUND: "ไม่พบข้อมูล",
});

function mapErrorCodeToThai(code) {
  const key = String(code || "").trim().toUpperCase();
  return ERROR_MESSAGE_MAP[key] || "";
}

function createApiError(options) {
  const source = options && typeof options === "object" ? options : {};
  const code = String(source.code || "UNKNOWN_ERROR").trim().toUpperCase();
  const debugMessage = String(source.debugMessage || source.message || "").trim();
  const mapped = mapErrorCodeToThai(code);
  const fallback = String(source.fallbackMessage || "เกิดข้อผิดพลาด").trim();
  const userMessage = mapped || debugMessage || fallback;

  const error = new Error(userMessage);
  error.code = code;
  error.status = Number(source.status) || 0;
  error.userMessage = userMessage;
  error.debugMessage = debugMessage;
  return error;
}

export function getErrorDisplayText(error, includeDebug = true) {
  const source = error && typeof error === "object" ? error : {};
  const code = String(source.code || "").trim().toUpperCase();
  const mapped = mapErrorCodeToThai(code);
  const userMessage = String(source.userMessage || mapped || source.message || "เกิดข้อผิดพลาด").trim();
  const debugMessage = String(source.debugMessage || "").trim();

  if (includeDebug && debugMessage && debugMessage !== userMessage) {
    return `${userMessage} (${debugMessage})`;
  }
  return userMessage;
}

export function isGasConfigured() {
  const url = String(GAS_WEBAPP_URL || "").trim();
  return url !== "" && url !== "REPLACE_ME";
}

function endpointUrl(path) {
  const baseUrl = String(GAS_WEBAPP_URL || "").trim().replace(/\/+$/, "");
  return `${baseUrl}?path=${encodeURIComponent(path)}`;
}

function queryString(params) {
  const entries = Object.entries(params || {}).filter(
    ([, value]) => value !== null && typeof value !== "undefined" && value !== "",
  );
  if (entries.length === 0) {
    return "";
  }
  const search = entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  return `&${search}`;
}

async function parseJsonResponse(response) {
  let body = {};
  try {
    body = await response.json();
  } catch (error) {
    throw createApiError({
      code: "BAD_JSON",
      debugMessage: "ไม่สามารถอ่านผลลัพธ์จากเซิร์ฟเวอร์ได้",
      status: response ? response.status : 0,
    });
  }

  if (!response.ok || !body.ok) {
    throw createApiError({
      code: body?.error?.code || `HTTP_${response.status}`,
      debugMessage: body?.error?.message || `เกิดข้อผิดพลาด (${response.status})`,
      status: body?.status || response.status,
    });
  }

  return body;
}

export async function getJson(path, params) {
  if (!isGasConfigured()) {
    throw createApiError({
      code: "CONFIG_REQUIRED",
      debugMessage: DEV_WARNING_MESSAGE,
      fallbackMessage: DEV_WARNING_MESSAGE,
    });
  }

  const response = await fetch(`${endpointUrl(path)}${queryString(params)}`, {
    method: "GET",
  });

  return parseJsonResponse(response);
}

function toBoolean(value) {
  if (value === true) {
    return true;
  }
  if (value === false || value === null || typeof value === "undefined") {
    return false;
  }
  const normalized = String(value).trim().toLowerCase();
  return (
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes" ||
    normalized === "y"
  );
}

function createDefaultSimRequest(lineUserId) {
  const now = new Date().toISOString();
  return {
    requestId: `req_${lineUserId}`,
    lineUserId: lineUserId,
    status: "draft",
    sec1_done: false,
    sec2_done: false,
    sec3_done: false,
    sec5_done: false,
    progress_percent: 0,
    lastNotifiedProgress: 0,
    officeName: "",
    taxInvoiceAddress: "",
    taxId13: "",
    officePhone: "",
    taxId_format_ok: false,
    taxId_checksum_ok: false,
    taxId_verify_status: "not_checked",
    taxId_verify_note: "",
    doc_quotation: false,
    doc_quotation_date: "",
    doc_invoice: false,
    doc_invoice_date: "",
    doc_store: false,
    doc_store_text: "",
    doc_receipt_tax: false,
    doc_receipt_tax_date: "",
    totalAmount: "",
    paymentMethod: "",
    paymentNotes: "",
    contactLineId: "",
    contactPhone: "",
    createdAt: now,
    updatedAt: now,
  };
}

function isPresent(value) {
  if (value === null || typeof value === "undefined") {
    return false;
  }
  return String(value).trim() !== "";
}

function computeProgressFromRequest(request) {
  const sec1Done =
    isPresent(request.officeName) &&
    isPresent(request.taxInvoiceAddress) &&
    isPresent(request.taxId13) &&
    isPresent(request.officePhone) &&
    toBoolean(request.taxId_format_ok) &&
    toBoolean(request.taxId_checksum_ok);

  const sec2Done =
    toBoolean(request.doc_quotation) ||
    toBoolean(request.doc_invoice) ||
    toBoolean(request.doc_store) ||
    toBoolean(request.doc_receipt_tax);

  const sec3Done = isPresent(request.totalAmount) && isPresent(request.paymentMethod);
  const sec5Done = isPresent(request.contactLineId) || isPresent(request.contactPhone);

  const completedSections = [];
  if (sec1Done) {
    completedSections.push(1);
  }
  if (sec2Done) {
    completedSections.push(2);
  }
  if (sec3Done) {
    completedSections.push(3);
  }
  if (sec5Done) {
    completedSections.push(5);
  }

  const progressPercent = Math.round((completedSections.length / 4) * 100);
  return {
    sec1_done: sec1Done,
    sec2_done: sec2Done,
    sec3_done: sec3Done,
    sec5_done: sec5Done,
    progress_percent: progressPercent,
    completedSections: completedSections,
  };
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

async function postJson(path, payload) {
  if (!isGasConfigured()) {
    throw createApiError({
      code: "CONFIG_REQUIRED",
      debugMessage: DEV_WARNING_MESSAGE,
      fallbackMessage: DEV_WARNING_MESSAGE,
    });
  }

  // Apps Script Web App does not handle CORS preflight reliably.
  // Send POST as a simple request (no custom headers) to avoid OPTIONS.
  const response = await fetch(endpointUrl(path), {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });

  return parseJsonResponse(response);
}

export async function saveSection(payload) {
  if (!isGasConfigured()) {
    const lineUserId = String(payload?.lineUserId || "").trim() || "Udev";
    if (!SIMULATED_REQUESTS[lineUserId]) {
      SIMULATED_REQUESTS[lineUserId] = createDefaultSimRequest(lineUserId);
    }

    const request = SIMULATED_REQUESTS[lineUserId];
    const before = deepClone(request);
    const now = new Date().toISOString();
    const data = payload?.data || {};

    Object.keys(data).forEach((key) => {
      let value = data[key];
      if (SIM_BOOLEAN_FIELDS.has(key)) {
        value = toBoolean(value);
      } else if (value === null || typeof value === "undefined") {
        value = "";
      }
      request[key] = value;
    });

    const progress = computeProgressFromRequest(request);
    request.sec1_done = progress.sec1_done;
    request.sec2_done = progress.sec2_done;
    request.sec3_done = progress.sec3_done;
    request.sec5_done = progress.sec5_done;
    request.progress_percent = progress.progress_percent;
    request.status = progress.progress_percent === 100 ? "ready" : "draft";
    request.updatedAt = now;

    const changed = {};
    Object.keys(request).forEach((key) => {
      if (before[key] !== request[key]) {
        changed[key] = request[key];
      }
    });

    return {
      ok: true,
      requestId: request.requestId,
      lineUserId: request.lineUserId,
      updatedAt: request.updatedAt,
      progress: {
        sec1_done: request.sec1_done,
        sec2_done: request.sec2_done,
        sec3_done: request.sec3_done,
        sec5_done: request.sec5_done,
        progress_percent: request.progress_percent,
        completedSections: progress.completedSections,
      },
      status: request.status,
      changed: changed,
      warning: DEV_WARNING_MESSAGE,
      simulated: true,
    };
  }

  return postJson("saveSection", payload);
}

export async function getDraft(lineUserId) {
  const normalizedLineUserId = String(lineUserId || "").trim();
  if (!normalizedLineUserId) {
    throw createApiError({
      code: "MISSING_LINE_USER_ID",
      debugMessage: "lineUserId is required",
      fallbackMessage: "ข้อมูลไม่ถูกต้อง",
    });
  }

  if (!isGasConfigured()) {
    const request = SIMULATED_REQUESTS[normalizedLineUserId];
    if (!request) {
      return {
        ok: true,
        found: false,
        warning: DEV_WARNING_MESSAGE,
        simulated: true,
      };
    }

    return {
      ok: true,
      found: true,
      request: deepClone(request),
      warning: DEV_WARNING_MESSAGE,
      simulated: true,
    };
  }

  return getJson("getDraft", { lineUserId: normalizedLineUserId });
}

export async function adminLogin(payload) {
  if (!isGasConfigured()) {
    throw createApiError({
      code: "CONFIG_REQUIRED",
      debugMessage: "ยังไม่ตั้งค่า GAS_WEBAPP_URL",
      fallbackMessage: "ยังไม่ตั้งค่า GAS_WEBAPP_URL",
    });
  }
  const body = payload && typeof payload === "object" ? payload : {};
  const lineUserId = String(body.lineUserId || "").trim();
  const googleIdToken = String(body.googleIdToken || "").trim();

  try {
    return await postJson("adminLogin", body);
  } catch (error) {
    // Fallback for environments where Apps Script POST preflight is blocked.
    const canFallback =
      !!lineUserId &&
      !!googleIdToken &&
      error &&
      typeof error === "object" &&
      String(error.message || "").toLowerCase().indexOf("failed to fetch") >= 0;

    if (!canFallback) {
      throw error;
    }

    const me = await getJson("adminMe", {
      lineUserId: lineUserId,
      googleIdToken: googleIdToken,
    });

    return {
      isAdmin: !!me.isAdmin,
      role: String(me.role || "admin").trim() || "admin",
      email: String(me.email || "").trim(),
      name: "",
      picture: "",
      viaFallback: true,
    };
  }
}

export async function adminMe(lineUserId, googleIdToken) {
  const normalizedLineUserId = String(lineUserId || "").trim();
  const token = String(googleIdToken || "").trim();
  if (!normalizedLineUserId || !token) {
    throw createApiError({
      code: "NOT_AUTHORIZED",
      debugMessage: "กรุณาเข้าสู่ระบบใหม่",
      fallbackMessage: "กรุณาเข้าสู่ระบบใหม่",
    });
  }
  if (!isGasConfigured()) {
    throw createApiError({
      code: "CONFIG_REQUIRED",
      debugMessage: "ยังไม่ตั้งค่า GAS_WEBAPP_URL",
      fallbackMessage: "ยังไม่ตั้งค่า GAS_WEBAPP_URL",
    });
  }
  return getJson("adminMe", { lineUserId: normalizedLineUserId, googleIdToken: token });
}

export async function adminListRequests(payload) {
  if (!isGasConfigured()) {
    throw createApiError({
      code: "CONFIG_REQUIRED",
      debugMessage: "ยังไม่ตั้งค่า GAS_WEBAPP_URL",
      fallbackMessage: "ยังไม่ตั้งค่า GAS_WEBAPP_URL",
    });
  }

  const body = payload && typeof payload === "object" ? payload : {};
  const lineUserId = String(body.lineUserId || "").trim();
  const googleIdToken = String(body.googleIdToken || "").trim();
  if (!lineUserId || !googleIdToken) {
    throw createApiError({
      code: "NOT_AUTHORIZED",
      debugMessage: "กรุณาเข้าสู่ระบบใหม่",
      fallbackMessage: "กรุณาเข้าสู่ระบบใหม่",
    });
  }

  return postJson("adminListRequests", {
    lineUserId: lineUserId,
    googleIdToken: googleIdToken,
    limit: body.limit,
    cursor: body.cursor ?? null,
  });
}

export async function adminGetRequest(lineUserId, googleIdToken, requestId) {
  const adminLineUserId = String(lineUserId || "").trim();
  const token = String(googleIdToken || "").trim();
  const targetRequestId = String(requestId || "").trim();

  if (!isGasConfigured()) {
    throw createApiError({
      code: "CONFIG_REQUIRED",
      debugMessage: "ยังไม่ตั้งค่า GAS_WEBAPP_URL",
      fallbackMessage: "ยังไม่ตั้งค่า GAS_WEBAPP_URL",
    });
  }
  if (!adminLineUserId || !token) {
    throw createApiError({
      code: "NOT_AUTHORIZED",
      debugMessage: "กรุณาเข้าสู่ระบบใหม่",
      fallbackMessage: "กรุณาเข้าสู่ระบบใหม่",
    });
  }
  if (!targetRequestId) {
    throw createApiError({
      code: "NOT_FOUND",
      debugMessage: "ไม่พบคำขอ",
      fallbackMessage: "ไม่พบคำขอ",
    });
  }

  return postJson("adminGetRequest", {
    lineUserId: adminLineUserId,
    googleIdToken: token,
    requestId: targetRequestId,
  });
}
