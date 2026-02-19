const REQUEST_SECTION_FIELD_MAP_ = Object.freeze({
  1: [
    "officeName",
    "taxInvoiceAddress",
    "taxId13",
    "officePhone",
    "taxId_format_ok",
    "taxId_checksum_ok",
    "taxId_verify_status",
    "taxId_verify_note",
  ],
  2: [
    "doc_quotation",
    "doc_quotation_date",
    "doc_invoice",
    "doc_invoice_date",
    "doc_store",
    "doc_store_text",
    "doc_receipt_tax",
    "doc_receipt_tax_date",
  ],
  3: ["totalAmount", "paymentMethod", "paymentNotes"],
  5: ["contactLineId", "contactPhone"],
});

const REQUEST_BOOLEAN_FIELD_MAP_ = Object.freeze({
  sec1_done: true,
  sec2_done: true,
  sec3_done: true,
  sec5_done: true,
  taxId_format_ok: true,
  taxId_checksum_ok: true,
  doc_quotation: true,
  doc_invoice: true,
  doc_store: true,
  doc_receipt_tax: true,
});

const REQUEST_NUMBER_FIELD_MAP_ = Object.freeze({
  progress_percent: true,
  lastNotifiedProgress: true,
  totalAmount: true,
});

const VALID_REQUEST_SECTIONS_ = Object.freeze([1, 2, 3, 5]);
const REQUEST_TEXT_MAX_LENGTH_MAP_ = Object.freeze({
  officeName: 200,
  taxInvoiceAddress: 200,
  taxId13: 13,
  officePhone: 50,
  taxId_verify_status: 30,
  taxId_verify_note: 500,
  doc_quotation_date: 30,
  doc_invoice_date: 30,
  doc_store_text: 500,
  doc_receipt_tax_date: 30,
  totalAmount: 50,
  paymentMethod: 30,
  paymentNotes: 500,
  contactLineId: 50,
  contactPhone: 50,
});
const REQUEST_MAX_DEFAULT_TEXT_LENGTH_ = 500;
const REQUEST_SAVE_RATE_LIMIT_COUNT_ = 10;
const REQUEST_SAVE_RATE_LIMIT_WINDOW_SECONDS_ = 60;

function saveSectionRequest_(payload) {
  const input = isPlainObject_(payload) ? payload : {};
  const lineUserId = truncateText_(input.lineUserId, 120);
  const section = normalizeSection_(input.section);
  const data = isPlainObject_(input.data) ? input.data : null;
  const clientTs = truncateText_(input.clientTs, 80);

  if (!lineUserId) {
    throw createRequestError_(
      400,
      "MISSING_LINE_USER_ID",
      "lineUserId is required.",
    );
  }

  if (!isValidSection_(section)) {
    throw createRequestError_(
      400,
      "INVALID_SECTION",
      "section must be one of: 1, 2, 3, 5.",
    );
  }

  if (!data) {
    throw createRequestError_(
      400,
      "MISSING_DATA",
      "data object is required.",
    );
  }

  if (isMaintenanceModeEnabled_()) {
    audit_("maintenanceBlocked", lineUserId, "", {
      path: "saveSection",
      section: section,
      errorCode: "MAINTENANCE",
    });
    throw createRequestError_(
      503,
      "MAINTENANCE",
      "ระบบปิดปรับปรุงชั่วคราว",
    );
  }

  enforceRateLimitOrThrow_(
    "saveSection",
    lineUserId,
    REQUEST_SAVE_RATE_LIMIT_COUNT_,
    REQUEST_SAVE_RATE_LIMIT_WINDOW_SECONDS_,
  );

  ensureSheets_();

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const upsertResult = upsertRequest_({
      lineUserId: lineUserId,
      section: section,
      data: data,
      clientTs: clientTs,
    });

    appendAuditLog_(
      lineUserId,
      "saveSection",
      upsertResult.requestId,
      Object.assign(
        {
          section: section,
          changes: Object.keys(upsertResult.changed || {}),
        },
        clientTs ? { clientTs: clientTs } : {},
      ),
    );

    return {
      requestId: upsertResult.requestId,
      lineUserId: upsertResult.lineUserId,
      updatedAt: upsertResult.updatedAt,
      status: upsertResult.status,
      progress: upsertResult.progress,
      changed: upsertResult.changed,
    };
  } finally {
    lock.releaseLock();
  }
}

function getDraftByLineUserId_(lineUserId) {
  const normalizedLineUserId = String(lineUserId || "").trim();
  if (!normalizedLineUserId) {
    throw createRequestError_(
      400,
      "MISSING_LINE_USER_ID",
      "lineUserId is required.",
    );
  }

  const requestsSheet = getSheetByName_(SHEET_NAMES_.REQUESTS);
  const headers = getSheetHeaders_(requestsSheet);
  if (headers.length === 0) {
    return { found: false };
  }

  const existingRow = findRowByLineUserId_(
    requestsSheet,
    headers,
    normalizedLineUserId,
  );
  if (!existingRow) {
    return { found: false };
  }

  return {
    found: true,
    request: normalizeDraftRecord_(headers, existingRow.row),
  };
}

function findRowByLineUserId_(sheet, headers, lineUserId) {
  const index = headers.indexOf("lineUserId");
  if (index < 0) {
    throw createRequestError_(
      500,
      "INVALID_REQUESTS_SCHEMA",
      "Requests sheet is missing lineUserId column.",
    );
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (String(row[index] || "").trim() !== lineUserId) {
      continue;
    }
    return {
      rowNumber: i + 2,
      row: mapRowToObject_(headers, row),
    };
  }

  return null;
}

function upsertRequest_(params) {
  const requestsSheet = getSheetByName_(SHEET_NAMES_.REQUESTS);
  const headers = getSheetHeaders_(requestsSheet);

  if (headers.length === 0) {
    throw createRequestError_(
      500,
      "INVALID_REQUESTS_SCHEMA",
      "Requests sheet has no headers.",
    );
  }

  const lineUserId = params.lineUserId;
  const section = params.section;
  const data = params.data || {};
  const nowIso = nowIsoUtc_();
  const stableRequestId = buildStableRequestId_(lineUserId);

  const existingRow = findRowByLineUserId_(requestsSheet, headers, lineUserId);
  const rowObject = existingRow
    ? existingRow.row
    : createDefaultRequestRow_(lineUserId, stableRequestId, nowIso);
  const beforeRow = Object.assign({}, rowObject);

  if (!rowObject.requestId) {
    rowObject.requestId = stableRequestId;
  }
  if (!rowObject.lineUserId) {
    rowObject.lineUserId = lineUserId;
  }
  if (!rowObject.createdAt) {
    rowObject.createdAt = nowIso;
  }
  if (!rowObject.taxId_verify_status) {
    rowObject.taxId_verify_status = "not_checked";
  }

  const partialUpdate = applyPartialUpdate_(rowObject, section, data);
  if ((partialUpdate.truncatedFields || []).length > 0) {
    appendAuditLog_(lineUserId, "inputTruncated", rowObject.requestId, {
      section: section,
      changes: partialUpdate.truncatedFields,
    });
  }
  const progress = computeProgress_(rowObject);

  rowObject.sec1_done = progress.sec1_done;
  rowObject.sec2_done = progress.sec2_done;
  rowObject.sec3_done = progress.sec3_done;
  rowObject.sec5_done = progress.sec5_done;
  rowObject.progress_percent = progress.progress_percent;
  rowObject.status = progress.progress_percent === 100 ? "ready" : "draft";
  rowObject.updatedAt = nowIso;

  const rowValues = headers.map((header) => valueForSheetCell_(rowObject[header]));
  let targetRowNumber = 0;
  if (existingRow) {
    targetRowNumber = existingRow.rowNumber;
    requestsSheet
      .getRange(existingRow.rowNumber, 1, 1, headers.length)
      .setValues([rowValues]);
  } else {
    targetRowNumber = requestsSheet.getLastRow() + 1;
    requestsSheet
      .getRange(targetRowNumber, 1, 1, headers.length)
      .setValues([rowValues]);
  }

  let linePushResult = {
    shouldUpdateLastNotified: false,
    lastNotifiedProgress: Number(rowObject.lastNotifiedProgress || 0),
  };
  try {
    linePushResult = pushProgressIfNeeded_(rowObject);
  } catch (error) {
    appendAuditLog_(rowObject.lineUserId, "linePushFailed", rowObject.requestId, {
      reason: String((error && error.message) || error || ""),
      progressPercent: rowObject.progress_percent,
    });
  }
  if (
    linePushResult &&
    linePushResult.shouldUpdateLastNotified &&
    Number(linePushResult.lastNotifiedProgress) >
      Number(rowObject.lastNotifiedProgress || 0)
  ) {
    rowObject.lastNotifiedProgress = Number(linePushResult.lastNotifiedProgress);
    const lastNotifiedProgressIndex = headers.indexOf("lastNotifiedProgress");
    if (lastNotifiedProgressIndex >= 0 && targetRowNumber > 0) {
      requestsSheet
        .getRange(targetRowNumber, lastNotifiedProgressIndex + 1)
        .setValue(rowObject.lastNotifiedProgress);
    }
  }

  const keysToInspect = uniqueList_(
    Object.keys(partialUpdate.changed).concat([
      "requestId",
      "lineUserId",
      "status",
      "sec1_done",
      "sec2_done",
      "sec3_done",
      "sec5_done",
      "progress_percent",
      "lastNotifiedProgress",
      "updatedAt",
    ]),
  );

  if (!existingRow) {
    keysToInspect.push("createdAt");
  }

  const changed = {};
  keysToInspect.forEach((key) => {
    if (isSameCellValue_(beforeRow[key], rowObject[key])) {
      return;
    }
    changed[key] = rowObject[key];
  });

  return {
    requestId: rowObject.requestId,
    lineUserId: rowObject.lineUserId,
    updatedAt: rowObject.updatedAt,
    status: rowObject.status,
    progress: progress,
    changed: changed,
  };
}

function computeProgress_(row) {
  const sec1Done =
    isPresent_(row.officeName) &&
    isPresent_(row.taxInvoiceAddress) &&
    isPresent_(row.taxId13) &&
    isPresent_(row.officePhone) &&
    normalizeBooleanValue_(row.taxId_format_ok) &&
    normalizeBooleanValue_(row.taxId_checksum_ok);

  const sec2Done =
    normalizeBooleanValue_(row.doc_quotation) ||
    normalizeBooleanValue_(row.doc_invoice) ||
    normalizeBooleanValue_(row.doc_store) ||
    normalizeBooleanValue_(row.doc_receipt_tax);

  const sec3Done = isPresent_(row.totalAmount) && isPresent_(row.paymentMethod);

  const sec5Done = isPresent_(row.contactPhone) || isPresent_(row.contactLineId);

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

function applyPartialUpdate_(target, section, data) {
  const allowedFields = REQUEST_SECTION_FIELD_MAP_[section];
  if (!allowedFields) {
    return { changed: {}, truncatedFields: [] };
  }

  const changed = {};
  const truncatedFields = [];
  allowedFields.forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(data, field)) {
      return;
    }

    const normalizedResult = normalizeFieldValue_(field, data[field]);
    const normalized = normalizedResult.value;
    if (normalizedResult.truncated) {
      truncatedFields.push(field);
    }
    if (!isSameCellValue_(target[field], normalized)) {
      changed[field] = normalized;
    }
    target[field] = normalized;
  });

  return { changed: changed, truncatedFields: truncatedFields };
}

function appendAuditLog_(actorLineUserId, action, targetRequestId, meta) {
  audit_(action, actorLineUserId, targetRequestId, meta || {});
}

function normalizeDraftRecord_(headers, rowObject) {
  const normalized = {};
  headers.forEach((header) => {
    if (!header) {
      return;
    }
    normalized[header] = normalizeDraftValue_(header, rowObject[header]);
  });
  return normalized;
}

function normalizeDraftValue_(field, value) {
  if (REQUEST_BOOLEAN_FIELD_MAP_[field]) {
    return normalizeBooleanValue_(value);
  }

  if (value === null || typeof value === "undefined") {
    return "";
  }

  if (Object.prototype.toString.call(value) === "[object Date]") {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  return String(value);
}

function createDefaultRequestRow_(lineUserId, requestId, nowIso) {
  return {
    requestId: requestId,
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
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

function buildStableRequestId_(lineUserId) {
  return "req_" + String(lineUserId || "").trim();
}

function mapRowToObject_(headers, rowValues) {
  const row = {};
  headers.forEach((header, index) => {
    if (!header) {
      return;
    }
    row[header] = rowValues[index];
  });
  return row;
}

function normalizeFieldValue_(field, value) {
  if (REQUEST_BOOLEAN_FIELD_MAP_[field]) {
    return {
      value: normalizeBooleanValue_(value),
      truncated: false,
    };
  }

  if (REQUEST_NUMBER_FIELD_MAP_[field]) {
    return {
      value: normalizeNumberValue_(value),
      truncated: false,
    };
  }

  if (value === null || typeof value === "undefined") {
    return {
      value: "",
      truncated: false,
    };
  }

  let rawText = "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    rawText = String(value);
  } else {
    try {
      rawText = JSON.stringify(value);
    } catch (error) {
      rawText = String(value);
    }
  }
  const maxLength =
    REQUEST_TEXT_MAX_LENGTH_MAP_[field] || REQUEST_MAX_DEFAULT_TEXT_LENGTH_;
  return clampText_(rawText, maxLength);
}

function normalizeBooleanValue_(value) {
  return toBoolStrict_(value);
}

function normalizeNumberValue_(value) {
  if (value === null || typeof value === "undefined" || value === "") {
    return "";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : "";
  }
  const normalized = String(value).trim().replace(/,/g, "");
  if (!normalized) {
    return "";
  }
  const asNumber = Number(normalized);
  return Number.isFinite(asNumber) ? asNumber : "";
}

function normalizeSection_(value) {
  const asNumber = Number(value);
  return Number.isInteger(asNumber) ? asNumber : NaN;
}

function isValidSection_(value) {
  return VALID_REQUEST_SECTIONS_.indexOf(value) >= 0;
}

function isPresent_(value) {
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
    return value;
  }
  return String(value).trim() !== "";
}

function isSameCellValue_(left, right) {
  if (left === right) {
    return true;
  }
  const leftNormalized = normalizeComparableValue_(left);
  const rightNormalized = normalizeComparableValue_(right);
  return leftNormalized === rightNormalized;
}

function normalizeComparableValue_(value) {
  if (value === null || typeof value === "undefined") {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

function uniqueList_(items) {
  const result = [];
  const seen = {};
  (items || []).forEach((item) => {
    const key = String(item || "");
    if (!key || seen[key]) {
      return;
    }
    seen[key] = true;
    result.push(item);
  });
  return result;
}

function valueForSheetCell_(value) {
  if (value === null || typeof value === "undefined") {
    return "";
  }
  return value;
}

function createRequestError_(status, code, message) {
  return createAppError_(status, code, message);
}
