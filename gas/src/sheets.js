const SHEET_ID_PROPERTY_KEY_ = "SHEET_ID";

const SHEET_NAMES_ = Object.freeze({
  REQUESTS: "Requests",
  ADMINS: "Admins",
  AUDIT_LOG: "AuditLog",
  LINE_USERS: "LineUsers",
});

const SHEET_HEADERS_ = Object.freeze({
  [SHEET_NAMES_.REQUESTS]: [
    "requestId",
    "lineUserId",
    "status",
    "sec1_done",
    "sec2_done",
    "sec3_done",
    "sec5_done",
    "progress_percent",
    "lastNotifiedProgress",
    "officeName",
    "taxInvoiceAddress",
    "taxId13",
    "officePhone",
    "taxId_format_ok",
    "taxId_checksum_ok",
    "taxId_verify_status",
    "taxId_verify_note",
    "doc_quotation",
    "doc_quotation_date",
    "doc_invoice",
    "doc_invoice_date",
    "doc_store",
    "doc_store_text",
    "doc_receipt_tax",
    "doc_receipt_tax_date",
    "totalAmount",
    "paymentMethod",
    "paymentNotes",
    "contactLineId",
    "contactPhone",
    "createdAt",
    "updatedAt",
  ],
  [SHEET_NAMES_.ADMINS]: [
    "lineUserId",
    "email",
    "role",
    "isActive",
    "createdAt",
    "updatedAt",
  ],
  [SHEET_NAMES_.AUDIT_LOG]: [
    "ts",
    "actorLineUserId",
    "action",
    "targetRequestId",
    "metaJson",
  ],
  [SHEET_NAMES_.LINE_USERS]: [
    "lineUserId",
    "displayName",
    "pictureUrl",
    "updatedAt",
  ],
});

const SHEET_CRITICAL_HEADERS_ = Object.freeze({
  [SHEET_NAMES_.REQUESTS]: [
    "requestId",
    "lineUserId",
    "status",
    "sec1_done",
    "sec2_done",
    "sec3_done",
    "sec5_done",
    "progress_percent",
    "lastNotifiedProgress",
    "createdAt",
    "updatedAt",
  ],
  [SHEET_NAMES_.ADMINS]: ["lineUserId", "isActive"],
  [SHEET_NAMES_.AUDIT_LOG]: ["ts", "action", "metaJson"],
  [SHEET_NAMES_.LINE_USERS]: ["lineUserId", "updatedAt"],
});

function getSheetId_() {
  return PropertiesService.getScriptProperties().getProperty(
    SHEET_ID_PROPERTY_KEY_,
  );
}

function openConfiguredSpreadsheet_() {
  const sheetId = getSheetId_();
  if (!sheetId) {
    throw new Error(
      "Missing Script Property SHEET_ID. Set it before calling API routes.",
    );
  }
  return SpreadsheetApp.openById(sheetId);
}

function ensureSheets_() {
  const spreadsheet = openConfiguredSpreadsheet_();
  const requiredSheetNames = [
    SHEET_NAMES_.REQUESTS,
    SHEET_NAMES_.ADMINS,
    SHEET_NAMES_.AUDIT_LOG,
    SHEET_NAMES_.LINE_USERS,
  ];

  requiredSheetNames.forEach((sheetName) => {
    const headers = SHEET_HEADERS_[sheetName];
    let sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(sheetName);
    }
    ensureHeaderRow_(sheet, headers);
  });

  return true;
}

function ensureHeaderRow_(sheet, headers) {
  if (!headers || headers.length === 0) {
    return;
  }

  const lastColumn = sheet.getLastColumn();
  if (lastColumn === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return;
  }

  const currentHeaderRow = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const normalizedCurrentHeaders = currentHeaderRow.map((value) =>
    String(value || "").trim(),
  );

  const schemaMismatch = detectSchemaMismatch_(
    sheet.getName(),
    headers,
    normalizedCurrentHeaders,
  );
  if (schemaMismatch.hasMismatch) {
    logSchemaMismatch_(sheet.getName(), schemaMismatch);
  }

  const missingHeaders = headers.filter(
    (header) => normalizedCurrentHeaders.indexOf(String(header).trim()) < 0,
  );

  if (missingHeaders.length > 0) {
    const mergedHeaders = normalizedCurrentHeaders.concat(missingHeaders);
    sheet.getRange(1, 1, 1, mergedHeaders.length).setValues([mergedHeaders]);
  }

  sheet.setFrozenRows(1);
}

function detectSchemaMismatch_(sheetName, expectedHeaders, currentHeaders) {
  const required = Array.isArray(expectedHeaders) ? expectedHeaders : [];
  const existing = Array.isArray(currentHeaders) ? currentHeaders : [];
  const criticalHeaders = SHEET_CRITICAL_HEADERS_[sheetName] || [];

  const missingCritical = criticalHeaders.filter(
    (header) => existing.indexOf(header) < 0,
  );

  const movedCritical = [];
  criticalHeaders.forEach((header) => {
    const expectedIndex = required.indexOf(header);
    const currentIndex = existing.indexOf(header);
    if (expectedIndex < 0 || currentIndex < 0) {
      return;
    }
    if (expectedIndex !== currentIndex) {
      movedCritical.push(`${header}:${currentIndex + 1}`);
    }
  });

  const hasMismatch = missingCritical.length > 0 || movedCritical.length > 0;
  return {
    hasMismatch: hasMismatch,
    missingCritical: missingCritical,
    movedCritical: movedCritical,
  };
}

function logSchemaMismatch_(sheetName, mismatch) {
  const meta = {
    path: "ensureSheets",
    requestId: "",
    section: "",
    changes: (mismatch && mismatch.missingCritical) || [],
    errorCode: "SCHEMA_MISMATCH",
    sheetName: sheetName,
    movedCritical: (mismatch && mismatch.movedCritical) || [],
  };

  Logger.log(
    `[schemaMismatch] sheet=${sheetName} missing=${JSON.stringify(
      meta.changes,
    )} moved=${JSON.stringify(meta.movedCritical)}`,
  );

  audit_("schemaMismatch", "", "", meta);
}

function getSheetByName_(sheetName) {
  const spreadsheet = openConfiguredSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error("Sheet not found: " + sheetName);
  }
  return sheet;
}

function getSheetHeaders_(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) {
    return [];
  }
  return sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map((value) => String(value || "").trim());
}
