const AUDIT_META_MAX_LEN_ = 2000;
const DEFAULT_RATE_LIMIT_WINDOW_SECONDS_ = 60;
const DEFAULT_RATE_LIMIT_COUNT_ = 10;
const GOOGLE_TOKEN_CACHE_TTL_SECONDS_ = 300;
const DEFAULT_CORS_METHODS_ = "GET,POST,OPTIONS";
const DEFAULT_CORS_HEADERS_ = "Content-Type, Authorization";

let REQUEST_CONTEXT_ = {};

function isPlainObject_(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function nowIsoUtc_() {
  return new Date().toISOString();
}

function normalizeString_(value) {
  return String(value || "").trim();
}

function normalizeLowerString_(value) {
  return normalizeString_(value).toLowerCase();
}

function truncateText_(value, maxLength) {
  const limit = Number(maxLength);
  if (!Number.isFinite(limit) || limit < 1) {
    return normalizeString_(value);
  }
  const text = normalizeString_(value);
  if (text.length <= limit) {
    return text;
  }
  return text.slice(0, limit);
}

function clampText_(value, maxLength) {
  const raw = value === null || typeof value === "undefined" ? "" : String(value);
  const trimmed = raw.trim();
  const capped = truncateText_(trimmed, maxLength);
  return {
    value: capped,
    truncated: capped.length < trimmed.length,
  };
}

function createAppError_(status, code, message, meta) {
  const error = new Error(String(message || "Unexpected server-side error."));
  error.status = Number(status) || 500;
  error.code = String(code || "INTERNAL_ERROR");
  if (isPlainObject_(meta)) {
    Object.keys(meta).forEach((key) => {
      error[key] = meta[key];
    });
  }
  return error;
}

function normalizeExceptionToAppError_(error) {
  if (error && typeof error === "object" && error.status && error.code) {
    return error;
  }
  return createAppError_(
    Number((error && error.status) || 500),
    String((error && error.code) || "INTERNAL_ERROR"),
    String((error && error.message) || "Unexpected server-side error."),
  );
}

function getScriptProperty_(key, fallbackValue) {
  const fallback =
    typeof fallbackValue === "undefined" || fallbackValue === null
      ? ""
      : String(fallbackValue);
  const raw = PropertiesService.getScriptProperties().getProperty(String(key || ""));
  if (typeof raw !== "string") {
    return fallback;
  }
  return raw.trim();
}

function getScriptPropertyLower_(key, fallbackValue) {
  return getScriptProperty_(key, fallbackValue).toLowerCase();
}

function getScriptBooleanProperty_(key, fallbackValue) {
  const raw = getScriptPropertyLower_(
    key,
    typeof fallbackValue === "boolean" ? (fallbackValue ? "true" : "false") : "",
  );
  if (!raw) {
    return Boolean(fallbackValue);
  }
  return raw === "true";
}

function getScriptCsvValues_(key) {
  const raw = getScriptProperty_(key, "");
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((item) => normalizeString_(item))
    .filter((item) => !!item);
}

function hashSha256Hex_(value) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value || ""),
    Utilities.Charset.UTF_8,
  );
  return digest
    .map((byte) => {
      const normalized = byte < 0 ? byte + 256 : byte;
      return ("0" + normalized.toString(16)).slice(-2);
    })
    .join("");
}

function maskTokenRef_(token) {
  const text = String(token || "");
  if (!text) {
    return "";
  }
  if (text.length <= 6) {
    return text;
  }
  return text.slice(-6);
}

function getCacheJson_(key) {
  const cacheKey = normalizeString_(key);
  if (!cacheKey) {
    return null;
  }

  const raw = CacheService.getScriptCache().get(cacheKey);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function putCacheJson_(key, value, ttlSeconds) {
  const cacheKey = normalizeString_(key);
  if (!cacheKey) {
    return;
  }

  const ttl = Number(ttlSeconds);
  const safeTtl = Number.isFinite(ttl) && ttl > 0 ? Math.floor(ttl) : 60;
  CacheService.getScriptCache().put(cacheKey, JSON.stringify(value || {}), safeTtl);
}

function getGoogleTokenCacheKey_(tokenHash) {
  return `gtok_${String(tokenHash || "").slice(0, 40)}`;
}

function enforceRateLimitOrThrow_(action, lineUserId, limit, windowSeconds) {
  const normalizedAction = normalizeLowerString_(action);
  const normalizedLineUserId = normalizeString_(lineUserId);
  if (!normalizedAction || !normalizedLineUserId) {
    return {
      exceeded: false,
      count: 0,
      limit: Number(limit) || DEFAULT_RATE_LIMIT_COUNT_,
      windowSeconds: Number(windowSeconds) || DEFAULT_RATE_LIMIT_WINDOW_SECONDS_,
    };
  }

  const maxCount = Number.isFinite(Number(limit)) ? Math.max(1, Math.floor(Number(limit))) : DEFAULT_RATE_LIMIT_COUNT_;
  const ttlSeconds =
    Number.isFinite(Number(windowSeconds)) && Number(windowSeconds) > 0
      ? Math.floor(Number(windowSeconds))
      : DEFAULT_RATE_LIMIT_WINDOW_SECONDS_;

  const keySeed = `${normalizedAction}:${normalizedLineUserId}`;
  const key = `rl_${hashSha256Hex_(keySeed).slice(0, 40)}`;
  const nowMs = Date.now();
  const windowMs = ttlSeconds * 1000;
  const cached = getCacheJson_(key);
  let count = 0;
  let windowStartMs = nowMs;

  if (cached && Number.isFinite(Number(cached.windowStartMs))) {
    const cachedWindowStart = Number(cached.windowStartMs);
    if (nowMs - cachedWindowStart < windowMs) {
      windowStartMs = cachedWindowStart;
      count = Number(cached.count) || 0;
    }
  }

  count += 1;
  putCacheJson_(
    key,
    {
      count: count,
      windowStartMs: windowStartMs,
    },
    ttlSeconds,
  );

  if (count > maxCount) {
    throw createAppError_(429, "RATE_LIMIT", "ส่งข้อมูลถี่เกินไป กรุณาลองใหม่อีกครั้ง", {
      retryAfterSec: ttlSeconds,
      rateLimitAction: normalizedAction,
      rateLimitCount: count,
    });
  }

  return {
    exceeded: false,
    count: count,
    limit: maxCount,
    windowSeconds: ttlSeconds,
  };
}

function isMaintenanceModeEnabled_() {
  return getScriptBooleanProperty_("MAINTENANCE_MODE", false);
}

function parseJsonBodyStrict_(e) {
  const raw =
    e && e.postData && typeof e.postData.contents === "string"
      ? e.postData.contents
      : "";

  if (!raw || !raw.trim()) {
    return {};
  }

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw createAppError_(400, "BAD_JSON", "ข้อมูลไม่ถูกต้อง");
  }

  if (!isPlainObject_(parsed)) {
    throw createAppError_(400, "BAD_JSON", "ข้อมูลไม่ถูกต้อง");
  }

  return parsed;
}

function setRequestContext_(context) {
  REQUEST_CONTEXT_ = isPlainObject_(context) ? Object.assign({}, context) : {};
}

function getRequestContext_() {
  return Object.assign({}, REQUEST_CONTEXT_ || {});
}

function resolveRequestOrigin_(e, payload) {
  const payloadOrigin = isPlainObject_(payload) ? normalizeString_(payload.origin) : "";
  if (payloadOrigin) {
    return payloadOrigin;
  }

  if (e && e.parameter) {
    const queryOrigin = normalizeString_(e.parameter.origin);
    if (queryOrigin) {
      return queryOrigin;
    }
  }

  return "";
}

function extractRequestMeta_(e, payload) {
  const query = (e && e.parameter) || {};
  const ip = truncateText_(query.ip || query.clientIp || "", 120);
  const ua = truncateText_(query.ua || query.userAgent || "", 350);
  const origin = truncateText_(resolveRequestOrigin_(e, payload), 200);

  return {
    ip: ip,
    ua: ua,
    origin: origin,
  };
}

function setRequestContextFromEvent_(method, path, e, payload) {
  const meta = extractRequestMeta_(e, payload);
  setRequestContext_(
    Object.assign({}, meta, {
      method: normalizeUpperMethod_(method),
      path: normalizePath_(path),
      requestId: normalizeString_(payload && payload.requestId),
      section: payload && payload.section,
    }),
  );
}

function normalizeUpperMethod_(method) {
  return normalizeString_(method).toUpperCase() || "GET";
}

function normalizePath_(path) {
  return String(path || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function allowedOriginsSet_() {
  const values = getScriptCsvValues_("ALLOWED_ORIGINS").map((item) =>
    normalizeOrigin_(item),
  );

  const map = {};
  values.forEach((origin) => {
    if (!origin) {
      return;
    }
    map[origin] = true;
  });

  return map;
}

function normalizeOrigin_(origin) {
  return normalizeString_(origin).replace(/\/+$/, "");
}

function resolveAllowedOriginValue_() {
  const context = getRequestContext_();
  const requestOrigin = normalizeOrigin_(context.origin);
  const allowMap = allowedOriginsSet_();
  const allowedOriginValues = Object.keys(allowMap);

  if (allowedOriginValues.length === 0) {
    return "*";
  }

  if (!requestOrigin) {
    return "null";
  }

  return allowMap[requestOrigin] ? requestOrigin : "null";
}

function corsConfigForCurrentRequest_() {
  return {
    allowOrigin: resolveAllowedOriginValue_(),
    allowMethods: DEFAULT_CORS_METHODS_,
    allowHeaders: DEFAULT_CORS_HEADERS_,
  };
}

function normalizeAuditChanges_(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = {};
  const result = [];
  value.forEach((item) => {
    const text = truncateText_(item, 80);
    if (!text || seen[text]) {
      return;
    }
    seen[text] = true;
    result.push(text);
  });
  return result.slice(0, 25);
}

function normalizeAuditSection_(value) {
  if (value === null || typeof value === "undefined" || value === "") {
    return "";
  }
  const asNumber = Number(value);
  if (Number.isInteger(asNumber)) {
    return asNumber;
  }
  return truncateText_(value, 20);
}

function buildAuditMeta_(targetRequestId, metaObj) {
  const context = getRequestContext_();
  const sourceMeta = isPlainObject_(metaObj) ? metaObj : {};

  const base = {
    ip: truncateText_(sourceMeta.ip || context.ip || "", 120),
    ua: truncateText_(sourceMeta.ua || context.ua || "", 350),
    origin: truncateText_(sourceMeta.origin || context.origin || "", 200),
    path: truncateText_(sourceMeta.path || context.path || "", 120),
    requestId: truncateText_(
      sourceMeta.requestId || targetRequestId || context.requestId || "",
      120,
    ),
    section: normalizeAuditSection_(
      typeof sourceMeta.section !== "undefined" ? sourceMeta.section : context.section,
    ),
    changes: normalizeAuditChanges_(sourceMeta.changes || sourceMeta.changedKeys),
    errorCode: truncateText_(
      sourceMeta.errorCode || sourceMeta.code || "",
      100,
    ),
  };

  const reservedKeys = {
    ip: true,
    ua: true,
    origin: true,
    path: true,
    requestId: true,
    section: true,
    changes: true,
    changedKeys: true,
    errorCode: true,
    code: true,
  };

  const extra = {};
  Object.keys(sourceMeta).forEach((key) => {
    if (reservedKeys[key]) {
      return;
    }
    const value = sourceMeta[key];
    if (value === null || typeof value === "undefined") {
      return;
    }
    if (typeof value === "string") {
      extra[key] = truncateText_(value, 350);
      return;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      extra[key] = value;
      return;
    }
    if (Array.isArray(value)) {
      extra[key] = value.slice(0, 20);
      return;
    }
    if (isPlainObject_(value)) {
      extra[key] = value;
      return;
    }
    extra[key] = truncateText_(String(value), 350);
  });

  if (Object.keys(extra).length > 0) {
    base.extra = extra;
  }

  return base;
}

function cappedJsonStringify_(value, maxLength) {
  const limit = Number(maxLength);
  const max = Number.isFinite(limit) && limit > 1 ? Math.floor(limit) : AUDIT_META_MAX_LEN_;
  const raw = JSON.stringify(value || {});
  if (raw.length <= max) {
    return raw;
  }

  const overflow = raw.length - max;
  const minimal = {
    truncated: true,
    overflow: overflow,
    preview: raw.slice(0, Math.max(1, max - 120)),
  };
  return JSON.stringify(minimal);
}

function audit_(action, actorLineUserId, targetRequestId, metaObj) {
  try {
    const auditSheet = getSheetByName_(SHEET_NAMES_.AUDIT_LOG);
    const headers = getSheetHeaders_(auditSheet);
    if (!headers || headers.length === 0) {
      return false;
    }

    const normalizedTargetRequestId = truncateText_(targetRequestId, 120);
    const rowObject = {
      ts: nowIsoUtc_(),
      actorLineUserId: truncateText_(actorLineUserId, 120),
      action: truncateText_(action, 80),
      targetRequestId: normalizedTargetRequestId,
      metaJson: cappedJsonStringify_(
        buildAuditMeta_(normalizedTargetRequestId, metaObj),
        AUDIT_META_MAX_LEN_,
      ),
    };

    const rowValues = headers.map((header) => {
      const value = rowObject[header];
      return value === null || typeof value === "undefined" ? "" : value;
    });

    auditSheet
      .getRange(auditSheet.getLastRow() + 1, 1, 1, headers.length)
      .setValues([rowValues]);

    return true;
  } catch (error) {
    Logger.log(
      `[audit-skip] action=${String(action || "")} reason=${String(
        (error && error.message) || error || "",
      )}`,
    );
    return false;
  }
}

function toErrorCode_(error) {
  return String((error && error.code) || "INTERNAL_ERROR");
}

function toErrorMessage_(error) {
  return String((error && error.message) || "Unexpected server-side error.");
}

function toErrorStatus_(error) {
  const status = Number((error && error.status) || 500);
  return Number.isFinite(status) && status > 0 ? status : 500;
}

function requiredFieldPresent_(value) {
  if (value === null || typeof value === "undefined") {
    return false;
  }
  if (typeof value === "string") {
    return value.trim() !== "";
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value === "boolean") {
    return true;
  }
  return true;
}

function assertRequiredFields_(input, requiredFields, errorCodePrefix) {
  const source = isPlainObject_(input) ? input : {};
  const missing = [];

  (requiredFields || []).forEach((fieldName) => {
    if (!requiredFieldPresent_(source[fieldName])) {
      missing.push(fieldName);
    }
  });

  if (missing.length > 0) {
    const firstMissing = String(missing[0] || "FIELD").toUpperCase();
    throw createAppError_(
      400,
      `${String(errorCodePrefix || "MISSING").toUpperCase()}_${firstMissing}`,
      `${missing[0]} is required.`,
      {
        missingFields: missing,
      },
    );
  }
}

function toBoolStrict_(value) {
  if (value === true) {
    return true;
  }
  if (value === false || value === null || typeof value === "undefined") {
    return false;
  }
  if (typeof value === "number") {
    return value === 1;
  }
  const normalized = normalizeLowerString_(value);
  return (
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes" ||
    normalized === "y" ||
    normalized === "on"
  );
}