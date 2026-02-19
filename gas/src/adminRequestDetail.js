function adminGetRequest_(payload) {
  const input = isPlainObject_(payload) ? payload : {};
  const lineUserId = truncateText_(input.lineUserId, 120);
  const googleIdToken = normalizeString_(input.googleIdToken);
  const requestId = truncateText_(input.requestId, 120);
  let authContext = null;

  try {
    if (!lineUserId || !googleIdToken) {
      throw createAdminAuthError_("MISSING_ADMIN_AUTH");
    }
    if (!requestId) {
      throw createAppError_(400, "MISSING_REQUEST_ID", "requestId is required.");
    }

    authContext = verifyAdminContext_(lineUserId, googleIdToken, "adminGetRequest");

    const requestsSheet = getSheetByName_(SHEET_NAMES_.REQUESTS);
    const headers = getSheetHeaders_(requestsSheet);
    if (headers.length === 0 || requestsSheet.getLastRow() < 2) {
      throw createAdminError_(404, "NOT_FOUND", "ไม่พบคำขอ");
    }

    const requestIdIndex = headers.indexOf("requestId");
    if (requestIdIndex < 0) {
      throw createAdminError_(
        500,
        "INVALID_REQUESTS_SCHEMA",
        "Requests sheet missing requestId column.",
      );
    }

    const rowCount = requestsSheet.getLastRow() - 1;
    const rows = requestsSheet.getRange(2, 1, rowCount, headers.length).getValues();
    let foundRow = null;
    for (let i = 0; i < rows.length; i += 1) {
      const rowRequestId = String(rows[i][requestIdIndex] || "").trim();
      if (rowRequestId === requestId) {
        foundRow = rows[i];
        break;
      }
    }

    if (!foundRow) {
      throw createAdminError_(404, "NOT_FOUND", "ไม่พบคำขอ");
    }

    const mapped = mapAdminRequestRow_(headers, foundRow);
    const item = Object.assign({}, mapped, {
      docSummary: buildAdminDocSummary_(mapped),
      progress_percent: normalizeNumberValue_(mapped.progress_percent) || 0,
      status: String(mapped.status || "").trim() || "draft",
    });

    safeAdminAuditLog_(
      lineUserId,
      "adminGetRequest",
      {
        result: "success",
        email: authContext.email,
        tokenFromCache: authContext.fromCache === true,
        requestId: requestId,
        changes: [],
      },
      requestId,
    );

    return { item: item };
  } catch (error) {
    const normalizedError = normalizeAdminAuthorizationError_(error);
    safeAdminAuditLog_(
      lineUserId || "",
      "adminGetRequest",
      {
        result: "fail",
        email: authContext ? authContext.email : undefined,
        tokenFromCache: authContext ? authContext.fromCache === true : undefined,
        requestId: requestId || undefined,
        code: String(
          (normalizedError && normalizedError.reasonCode) ||
            normalizedError.code ||
            "",
        ),
        errorCode: String(normalizedError.code || ""),
        message: String(normalizedError.message || ""),
        originalCode: String((error && error.code) || ""),
      },
      requestId || "",
    );
    throw normalizedError;
  }
}
