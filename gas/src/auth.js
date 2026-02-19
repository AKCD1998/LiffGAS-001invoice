function getRoleByLineUserId_(lineUserId) {
  if (!lineUserId) {
    return {
      role: "unknown",
      isAdmin: false,
    };
  }

  const record = getAdminAllowlistRecordByLineUserId_(lineUserId);
  if (record && record.isActive) {
    return {
      role: record.role || "admin",
      isAdmin: true,
    };
  }

  return {
    role: "customer",
    isAdmin: false,
  };
}

function getAdminAllowlistRecordByLineUserId_(lineUserId) {
  const normalizedLineUserId = String(lineUserId || "").trim();
  if (!normalizedLineUserId) {
    return null;
  }

  const adminsSheet = getSheetByName_(SHEET_NAMES_.ADMINS);
  const rows = adminsSheet.getDataRange().getValues();
  if (!rows || rows.length <= 1) {
    return null;
  }

  const header = rows[0].map((value) => normalizeHeaderName_(value));
  const idxLineUserId = header.indexOf("lineuserid");
  const idxEmail = header.indexOf("email");
  const idxRole = header.indexOf("role");
  const idxIsActive = header.indexOf("isactive");

  if (idxLineUserId < 0 || idxIsActive < 0) {
    throw new Error("Admins sheet headers are invalid.");
  }

  let fallbackRecord = null;
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const rowLineUserId = String(row[idxLineUserId] || "").trim();
    if (!rowLineUserId || rowLineUserId !== normalizedLineUserId) {
      continue;
    }

    const record = {
      lineUserId: rowLineUserId,
      email: idxEmail >= 0 ? String(row[idxEmail] || "").trim().toLowerCase() : "",
      role: idxRole >= 0 ? String(row[idxRole] || "").trim().toLowerCase() || "admin" : "admin",
      isActive: toBoolean_(row[idxIsActive]),
    };

    if (record.isActive) {
      return record;
    }

    if (!fallbackRecord) {
      fallbackRecord = record;
    }
  }

  return fallbackRecord;
}

function normalizeHeaderName_(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function toBoolean_(value) {
  if (value === true) {
    return true;
  }
  if (value === false || value === null || typeof value === "undefined") {
    return false;
  }
  if (typeof value === "number") {
    return value === 1;
  }
  const normalized = String(value).trim().toLowerCase();
  return (
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes" ||
    normalized === "y"
  );
}
