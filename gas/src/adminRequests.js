const ADMIN_LIST_DEFAULT_LIMIT_ = 50;
const ADMIN_LIST_MAX_LIMIT_ = 200;
const ADMIN_FORCE_TEXT_FIELDS_ = Object.freeze({
  requestId: true,
  lineUserId: true,
  taxId13: true,
  officePhone: true,
  contactPhone: true,
  contactLineId: true,
});

function adminListRequests_(payload) {
  const input = isPlainObject_(payload) ? payload : {};
  const lineUserId = truncateText_(input.lineUserId, 120);
  const googleIdToken = normalizeString_(input.googleIdToken);
  const limit = normalizeAdminListLimit_(input.limit);
  const cursor = normalizeAdminListCursor_(input.cursor);
  let authContext = null;

  try {
    if (!lineUserId || !googleIdToken) {
      throw createAdminAuthError_("MISSING_ADMIN_AUTH");
    }

    authContext = verifyAdminContext_(
      lineUserId,
      googleIdToken,
      "adminListRequests",
    );

    const requestsSheet = getSheetByName_(SHEET_NAMES_.REQUESTS);
    const headers = getSheetHeaders_(requestsSheet);
    if (headers.length === 0 || requestsSheet.getLastRow() < 2) {
      safeAdminAuditLog_(lineUserId, "adminListRequests", {
        result: "success",
        email: authContext.email,
        tokenFromCache: authContext.fromCache === true,
        itemCount: 0,
        limit: limit,
        cursor: cursor,
        changes: [],
      });
      return {
        items: [],
        nextCursor: null,
      };
    }

    const rowCount = requestsSheet.getLastRow() - 1;
    const rows = requestsSheet.getRange(2, 1, rowCount, headers.length).getValues();
    const requestObjects = rows
      .map((row) => mapAdminRequestRow_(headers, row))
      .filter((row) => !!String(row.lineUserId || "").trim());

    requestObjects.sort((left, right) => {
      const leftTs = parseAdminTimestamp_(left.updatedAt || left.createdAt);
      const rightTs = parseAdminTimestamp_(right.updatedAt || right.createdAt);
      return rightTs - leftTs;
    });

    const startIndex = Math.min(cursor, requestObjects.length);
    const endIndex = Math.min(startIndex + limit, requestObjects.length);
    const pageItems = requestObjects.slice(startIndex, endIndex).map(toAdminListItem_);
    const nextCursor = endIndex < requestObjects.length ? String(endIndex) : null;

    safeAdminAuditLog_(lineUserId, "adminListRequests", {
      result: "success",
      email: authContext.email,
      tokenFromCache: authContext.fromCache === true,
      itemCount: pageItems.length,
      limit: limit,
      cursor: cursor,
      nextCursor: nextCursor || undefined,
      changes: [],
    });

    return {
      items: pageItems,
      nextCursor: nextCursor,
    };
  } catch (error) {
    const normalizedError = normalizeAdminAuthorizationError_(error);
    safeAdminAuditLog_(lineUserId || "", "adminListRequests", {
      result: "fail",
      email: authContext ? authContext.email : undefined,
      tokenFromCache: authContext ? authContext.fromCache === true : undefined,
      code: String(
        (normalizedError && normalizedError.reasonCode) ||
          normalizedError.code ||
          "NOT_AUTHORIZED",
      ),
      errorCode: String(normalizedError.code || ""),
      message: String(normalizedError.message || "Not authorized."),
      originalCode: String((error && error.code) || ""),
    });
    throw normalizedError;
  }
}

function toAdminListItem_(request) {
  return {
    requestId: String(request.requestId || "").trim(),
    lineUserId: String(request.lineUserId || "").trim(),
    officeName: String(request.officeName || "").trim(),
    officePhone: String(request.officePhone || "").trim(),
    contactLineId: String(request.contactLineId || "").trim(),
    contactPhone: String(request.contactPhone || "").trim(),
    progress_percent: normalizeNumberValue_(request.progress_percent) || 0,
    status: String(request.status || "").trim() || "draft",
    updatedAt: normalizeDisplayTimestamp_(request.updatedAt || request.createdAt),
    docSummary: buildAdminDocSummary_(request),
    paymentMethod: String(request.paymentMethod || "").trim(),
    totalAmount: formatTotalAmountForAdmin_(request.totalAmount),
  };
}

function mapAdminRequestRow_(headers, rowValues) {
  const mapped = {};
  headers.forEach((header, index) => {
    const key = String(header || "").trim();
    if (!key) {
      return;
    }
    const value = rowValues[index];
    if (ADMIN_FORCE_TEXT_FIELDS_[key]) {
      mapped[key] =
        value === null || typeof value === "undefined"
          ? ""
          : String(value).trim();
      return;
    }
    if (isAdminBooleanField_(key)) {
      mapped[key] = toBoolean_(value);
      return;
    }
    if (Object.prototype.toString.call(value) === "[object Date]") {
      mapped[key] = value.toISOString();
      return;
    }
    mapped[key] = value === null || typeof value === "undefined" ? "" : value;
  });
  return mapped;
}

function buildAdminDocSummary_(request) {
  const items = [];
  if (toBoolean_(request.doc_quotation)) {
    items.push("ใบเสนอราคา");
  }
  if (toBoolean_(request.doc_invoice)) {
    items.push("ใบแจ้งหนี้/ใบส่งสินค้า");
  }
  if (toBoolean_(request.doc_store)) {
    items.push("เอกสารร้าน");
  }
  if (toBoolean_(request.doc_receipt_tax)) {
    items.push("ใบเสร็จ/ใบกำกับภาษี");
  }

  const text = items.join(", ");
  if (!text) {
    return "-";
  }
  return truncateAdminText_(text, 120);
}

function normalizeAdminListLimit_(rawLimit) {
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed)) {
    return ADMIN_LIST_DEFAULT_LIMIT_;
  }
  const rounded = Math.floor(parsed);
  if (rounded < 1) {
    return ADMIN_LIST_DEFAULT_LIMIT_;
  }
  return Math.min(rounded, ADMIN_LIST_MAX_LIMIT_);
}

function normalizeAdminListCursor_(rawCursor) {
  if (rawCursor === null || typeof rawCursor === "undefined" || rawCursor === "") {
    return 0;
  }
  const parsed = Number(rawCursor);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  const rounded = Math.floor(parsed);
  return rounded < 0 ? 0 : rounded;
}

function parseAdminTimestamp_(value) {
  if (!value) {
    return 0;
  }
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return value.getTime();
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDisplayTimestamp_(value) {
  if (!value) {
    return "";
  }
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return value.toISOString();
  }
  return String(value);
}

function truncateAdminText_(text, maxLen) {
  const raw = String(text || "");
  const limit = Number(maxLen);
  if (!Number.isFinite(limit) || limit < 1 || raw.length <= limit) {
    return raw;
  }
  return `${raw.slice(0, limit - 3)}...`;
}

function isAdminBooleanField_(field) {
  return (
    field === "sec1_done" ||
    field === "sec2_done" ||
    field === "sec3_done" ||
    field === "sec5_done" ||
    field === "taxId_format_ok" ||
    field === "taxId_checksum_ok" ||
    field === "doc_quotation" ||
    field === "doc_invoice" ||
    field === "doc_store" ||
    field === "doc_receipt_tax"
  );
}

function formatTotalAmountForAdmin_(value) {
  if (value === null || typeof value === "undefined" || value === "") {
    return "";
  }
  const asNumber = Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(asNumber)) {
    return String(value);
  }
  return String(asNumber);
}
