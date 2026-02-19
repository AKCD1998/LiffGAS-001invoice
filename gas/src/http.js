function routeRequest_(method, e) {
  const normalizedMethod = normalizeUpperMethod_(method);
  const path = getPath_(e);

  if (normalizedMethod === "OPTIONS") {
    setRequestContextFromEvent_(normalizedMethod, path, e, {});
    return handleOptions_();
  }

  if (normalizedMethod === "GET") {
    setRequestContextFromEvent_(normalizedMethod, path, e, {});
    try {
      return routeGetRequest_(path, e);
    } catch (error) {
      const normalizedError = normalizeExceptionToAppError_(error);
      audit_("requestFailed", getQueryParam_(e, "lineUserId"), "", {
        path: path,
        errorCode: toErrorCode_(normalizedError),
      });
      return jsonErrorFromException_(normalizedError);
    }
  }

  if (normalizedMethod === "POST") {
    let body = {};
    try {
      body = parseJsonBodyStrict_(e);
    } catch (error) {
      setRequestContextFromEvent_(normalizedMethod, path, e, {});
      const normalizedError = normalizeExceptionToAppError_(error);
      audit_("requestFailed", "", "", {
        path: path,
        errorCode: toErrorCode_(normalizedError),
      });
      return jsonErrorFromException_(normalizedError);
    }

    setRequestContextFromEvent_(normalizedMethod, path, e, body);

    try {
      return routePostRequest_(path, body, e);
    } catch (error) {
      const normalizedError = normalizeExceptionToAppError_(error);
      audit_("requestFailed", normalizeString_(body.lineUserId), normalizeString_(body.requestId), {
        path: path,
        section: body.section,
        errorCode: toErrorCode_(normalizedError),
      });
      return jsonErrorFromException_(normalizedError);
    }
  }

  const unsupportedError = createAppError_(
    405,
    "METHOD_NOT_ALLOWED",
    "Method is not supported.",
  );
  audit_("requestFailed", "", "", {
    path: path,
    errorCode: unsupportedError.code,
  });
  return jsonErrorFromException_(unsupportedError);
}

function handleOptions_() {
  return jsonSuccess_({
    preflight: true,
    message: "Preflight acknowledged.",
  });
}

function routeGetRequest_(path, e) {
  if (path === "health") {
    return handleHealth_();
  }

  if (path === "me") {
    return handleMe_(e);
  }

  if (path === "getdraft") {
    return handleGetDraft_(e);
  }

  if (path === "adminme") {
    return handleAdminMe_(e);
  }

  throw createAppError_(404, "NOT_FOUND", "Unknown route.");
}

function routePostRequest_(path, body, e) {
  if (path === "savesection") {
    return handleSaveSection_(body, e);
  }

  if (path === "adminlogin") {
    return handleAdminLogin_(body, e);
  }

  if (path === "adminlistrequests") {
    return handleAdminListRequests_(body, e);
  }

  if (path === "admingetrequest") {
    return handleAdminGetRequest_(body, e);
  }

  if (path === "" || path === "placeholder") {
    return jsonSuccess_({
      message: "POST placeholder ready.",
      received: body,
    });
  }

  throw createAppError_(404, "NOT_FOUND", "Unknown route.");
}

function handleHealth_() {
  return jsonSuccess_({
    service: "liff-gas-backend",
    timestamp: nowIsoUtc_(),
  });
}

function handleMe_(e) {
  const lineUserId = getQueryParam_(e, "lineUserId");
  let sheetReady = false;
  let sheetError = "";

  try {
    ensureSheets_();
    sheetReady = true;
  } catch (error) {
    sheetReady = false;
    sheetError = toErrorMessage_(error);
    audit_("sheetInitFailed", lineUserId, "", {
      path: "me",
      errorCode: "SHEET_INIT_FAILED",
      message: sheetError,
    });
  }

  let role = "unknown";
  let isAdmin = false;

  if (lineUserId && sheetReady) {
    const roleInfo = getRoleByLineUserId_(lineUserId);
    role = roleInfo.role;
    isAdmin = roleInfo.isAdmin;
  }

  return jsonSuccess_({
    lineUserId: lineUserId || null,
    role: role,
    isAdmin: isAdmin,
    sheetReady: sheetReady,
    sheetError: sheetError || undefined,
  });
}

function handleGetDraft_(e) {
  const lineUserId = getQueryParam_(e, "lineUserId");
  if (!lineUserId) {
    throw createAppError_(400, "MISSING_LINE_USER_ID", "lineUserId is required.");
  }

  ensureSheets_();
  const draftResult = getDraftByLineUserId_(lineUserId);
  return jsonSuccess_(draftResult);
}

function handleSaveSection_(body) {
  const saveResult = saveSectionRequest_(body);
  return jsonSuccess_(saveResult);
}

function handleAdminLogin_(body) {
  const result = adminLoginWithGoogle_(body);
  return jsonSuccess_(result);
}

function handleAdminMe_(e) {
  const lineUserId = getQueryParam_(e, "lineUserId");
  const googleIdToken = getQueryParam_(e, "googleIdToken");
  const result = adminMeByLineUserId_(lineUserId, googleIdToken);
  return jsonSuccess_(result);
}

function handleAdminListRequests_(body) {
  const result = adminListRequests_(body);
  return jsonSuccess_(result);
}

function handleAdminGetRequest_(body) {
  const result = adminGetRequest_(body);
  return jsonSuccess_(result);
}

function getPath_(e) {
  const rawPath =
    e && e.parameter && typeof e.parameter.path !== "undefined"
      ? e.parameter.path
      : "";
  return normalizePath_(rawPath);
}

function getQueryParam_(e, key) {
  if (!e || !e.parameter) {
    return "";
  }
  return String(e.parameter[key] || "").trim();
}

function jsonSuccess_(payload) {
  return jsonResponse_(
    Object.assign(
      {
        ok: true,
      },
      payload || {},
    ),
  );
}

function jsonError_(status, code, message) {
  return jsonResponse_({
    ok: false,
    status: status,
    error: {
      code: code,
      message: message,
    },
  });
}

function jsonErrorFromException_(error) {
  const normalizedError = normalizeExceptionToAppError_(error);
  return jsonError_(
    toErrorStatus_(normalizedError),
    toErrorCode_(normalizedError),
    toErrorMessage_(normalizedError),
  );
}

function jsonResponse_(payload) {
  const responseBody = Object.assign(
    {
      timestamp: nowIsoUtc_(),
      cors: corsConfigForCurrentRequest_(),
    },
    payload || {},
  );

  return ContentService.createTextOutput(JSON.stringify(responseBody)).setMimeType(
    ContentService.MimeType.JSON,
  );
}