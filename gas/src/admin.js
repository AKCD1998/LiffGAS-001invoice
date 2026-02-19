const GOOGLE_TOKENINFO_ENDPOINT_ = "https://oauth2.googleapis.com/tokeninfo";
const ADMIN_AUTH_RATE_LIMIT_COUNT_ = 20;
const ADMIN_AUTH_RATE_LIMIT_WINDOW_SECONDS_ = 60;

function adminLoginWithGoogle_(payload) {
  const input = isPlainObject_(payload) ? payload : {};
  const lineUserId = truncateText_(input.lineUserId, 120);
  const googleIdToken = normalizeString_(input.googleIdToken);
  const clientTs = truncateText_(input.clientTs, 80);

  try {
    const result = verifyAdminContext_(lineUserId, googleIdToken, "adminLogin");

    safeAdminAuditLog_(lineUserId, "adminLoginSuccess", {
      code: "ADMIN_LOGIN_SUCCESS",
      email: result.email,
      role: "admin",
      verifyMode: getGoogleVerifyMode_(),
      clientTs: clientTs || undefined,
      tokenRef: result.tokenRef || undefined,
      tokenHash: result.tokenHash || undefined,
      tokenFromCache: result.fromCache === true,
    });

    return {
      isAdmin: true,
      email: result.email,
      name: result.name,
      picture: result.picture,
      role: "admin",
    };
  } catch (error) {
    const normalizedError = normalizeAdminAuthorizationError_(error);
    safeAdminAuditLog_(lineUserId || "", "adminLoginFail", {
      code: String((normalizedError && normalizedError.reasonCode) || normalizedError.code || "NOT_AUTHORIZED"),
      message: normalizedError.message,
      verifyMode: getGoogleVerifyMode_(),
      clientTs: clientTs || undefined,
    });
    throw normalizedError;
  }
}

function verifyAdminContext_(lineUserId, googleIdToken, actionName) {
  const normalizedLineUserId = truncateText_(lineUserId, 120);
  const normalizedToken = normalizeString_(googleIdToken);

  if (!normalizedLineUserId || !normalizedToken) {
    throw createAdminAuthError_("MISSING_ADMIN_AUTH");
  }

  enforceRateLimitOrThrow_(
    `admin:${normalizeLowerString_(actionName || "auth")}`,
    normalizedLineUserId,
    ADMIN_AUTH_RATE_LIMIT_COUNT_,
    ADMIN_AUTH_RATE_LIMIT_WINDOW_SECONDS_,
  );

  ensureSheets_();

  const claims = verifyGoogleIdToken_(normalizedToken);
  enforceGoogleEmailPolicy_(claims.email);

  const adminRecord = getAdminAllowlistRecordByLineUserId_(normalizedLineUserId);
  if (!adminRecord || !adminRecord.isActive) {
    throw createAdminAuthError_("ALLOWLIST_DENIED", {
      verifiedEmail: claims.email,
      tokenHash: claims.tokenHash,
      tokenRef: claims.tokenRef,
    });
  }

  if (adminRecord.email && adminRecord.email !== claims.email) {
    throw createAdminAuthError_("ALLOWLIST_EMAIL_MISMATCH", {
      verifiedEmail: claims.email,
      tokenHash: claims.tokenHash,
      tokenRef: claims.tokenRef,
    });
  }

  return {
    isAdmin: true,
    email: claims.email,
    name: claims.name || "",
    picture: claims.picture || "",
    role: String(adminRecord.role || "admin").trim() || "admin",
    tokenHash: claims.tokenHash,
    tokenRef: claims.tokenRef,
    fromCache: claims.fromCache === true,
  };
}

function adminMeByLineUserId_(lineUserId, googleIdToken) {
  const authContext = verifyAdminContext_(lineUserId, googleIdToken, "adminMe");
  return {
    lineUserId: truncateText_(lineUserId, 120),
    isAdmin: true,
    role: authContext.role || "admin",
    email: authContext.email || "",
  };
}

function verifyGoogleIdToken_(googleIdToken) {
  const verifyMode = getGoogleVerifyMode_();
  if (verifyMode !== "tokeninfo") {
    throw createAdminError_(500, "UNSUPPORTED_VERIFY_MODE", "Unsupported verify mode.");
  }

  const tokenHash = hashSha256Hex_(googleIdToken);
  const cacheKey = getGoogleTokenCacheKey_(tokenHash);
  const nowUnix = Math.floor(Date.now() / 1000);
  const cachedClaims = getCacheJson_(cacheKey);

  if (isPlainObject_(cachedClaims)) {
    const cachedExp = Number(cachedClaims.exp || 0);
    if (Number.isFinite(cachedExp) && cachedExp > nowUnix + 10) {
      return {
        email: normalizeLowerString_(cachedClaims.email),
        name: truncateText_(cachedClaims.name, 200),
        picture: truncateText_(cachedClaims.picture, 500),
        sub: truncateText_(cachedClaims.sub, 80),
        exp: cachedExp,
        tokenHash: tokenHash.slice(0, 40),
        tokenRef: maskTokenRef_(googleIdToken),
        fromCache: true,
      };
    }
  }

  const claims = fetchGoogleTokenClaims_(googleIdToken);

  const email = normalizeLowerString_(claims.email);
  const emailVerifiedRaw = normalizeLowerString_(claims.email_verified);
  const expRaw = Number(claims.exp || 0);

  if (!email) {
    throw createAdminAuthError_("GOOGLE_EMAIL_MISSING", {
      tokenHash: tokenHash.slice(0, 40),
      tokenRef: maskTokenRef_(googleIdToken),
    });
  }

  if (emailVerifiedRaw !== "true") {
    throw createAdminAuthError_("GOOGLE_EMAIL_NOT_VERIFIED", {
      tokenHash: tokenHash.slice(0, 40),
      tokenRef: maskTokenRef_(googleIdToken),
    });
  }

  if (!Number.isFinite(expRaw) || expRaw <= nowUnix) {
    throw createAdminAuthError_("GOOGLE_TOKEN_EXPIRED", {
      tokenHash: tokenHash.slice(0, 40),
      tokenRef: maskTokenRef_(googleIdToken),
    });
  }

  const normalizedClaims = {
    email: email,
    name: truncateText_(claims.name, 200),
    picture: truncateText_(claims.picture, 500),
    sub: truncateText_(claims.sub, 80),
    exp: expRaw,
    tokenHash: tokenHash.slice(0, 40),
    tokenRef: maskTokenRef_(googleIdToken),
    fromCache: false,
  };

  putCacheJson_(
    cacheKey,
    {
      email: normalizedClaims.email,
      name: normalizedClaims.name,
      picture: normalizedClaims.picture,
      sub: normalizedClaims.sub,
      exp: normalizedClaims.exp,
    },
    GOOGLE_TOKEN_CACHE_TTL_SECONDS_,
  );

  return normalizedClaims;
}

function fetchGoogleTokenClaims_(googleIdToken) {
  const url = `${GOOGLE_TOKENINFO_ENDPOINT_}?id_token=${encodeURIComponent(googleIdToken)}`;

  let response = null;
  try {
    response = UrlFetchApp.fetch(url, {
      method: "get",
      muteHttpExceptions: true,
    });
  } catch (error) {
    throw createAdminError_(
      502,
      "GOOGLE_VERIFY_UNAVAILABLE",
      "Google token verification service is unavailable.",
    );
  }

  const statusCode = response.getResponseCode();
  const responseText = response.getContentText();
  if (statusCode < 200 || statusCode >= 300) {
    throw createAdminAuthError_("GOOGLE_TOKEN_INVALID", {
      googleStatusCode: statusCode,
      googleBody: truncateText_(responseText, 500),
    });
  }

  let claims = null;
  try {
    claims = JSON.parse(responseText);
  } catch (error) {
    throw createAdminError_(
      502,
      "GOOGLE_VERIFY_INVALID_RESPONSE",
      "Invalid response from Google token verification.",
    );
  }

  return isPlainObject_(claims) ? claims : {};
}

function enforceGoogleEmailPolicy_(email) {
  const normalizedEmail = normalizeLowerString_(email);
  if (!normalizedEmail) {
    throw createAdminAuthError_("GOOGLE_EMAIL_MISSING");
  }

  const allowedDomain = getScriptPropertyLower_("GOOGLE_ALLOWED_DOMAIN");
  const allowedEmails = getAllowedGoogleEmails_();

  const domainAllowed =
    !!allowedDomain && normalizedEmail.endsWith(`@${allowedDomain}`);
  const explicitAllowed = allowedEmails.indexOf(normalizedEmail) >= 0;

  if (!allowedDomain && allowedEmails.length === 0) {
    throw createAdminError_(
      500,
      "GOOGLE_POLICY_NOT_CONFIGURED",
      "Google email policy is not configured.",
    );
  }

  if (!domainAllowed && !explicitAllowed) {
    throw createAdminAuthError_("GOOGLE_EMAIL_NOT_ALLOWED", {
      verifiedEmail: normalizedEmail,
    });
  }
}

function getAllowedGoogleEmails_() {
  const values = getScriptCsvValues_("GOOGLE_ALLOWED_EMAILS");
  return values
    .map((item) => normalizeLowerString_(item))
    .filter((item) => !!item);
}

function getGoogleVerifyMode_() {
  return getScriptPropertyLower_("GOOGLE_IDTOKEN_VERIFY_MODE", "tokeninfo") || "tokeninfo";
}

function safeAdminAuditLog_(actorLineUserId, action, meta, targetRequestId) {
  audit_(
    action,
    truncateText_(actorLineUserId, 120),
    truncateText_(targetRequestId, 120),
    meta || {},
  );
}

function createAdminAuthError_(reasonCode, meta) {
  const details = isPlainObject_(meta) ? Object.assign({}, meta) : {};
  details.reasonCode = String(reasonCode || "NOT_AUTHORIZED");
  return createAdminError_(403, "NOT_AUTHORIZED", "ไม่ได้รับอนุญาต", details);
}

function normalizeAdminAuthorizationError_(error) {
  const incoming = normalizeExceptionToAppError_(error);
  if (incoming.code === "NOT_FOUND") {
    return createAdminError_(404, "NOT_FOUND", "ไม่พบคำขอ");
  }
  if (incoming.code === "RATE_LIMIT") {
    return incoming;
  }
  if (incoming.code === "GOOGLE_POLICY_NOT_CONFIGURED") {
    return incoming;
  }

  if (incoming.code !== "NOT_AUTHORIZED") {
    return createAdminAuthError_(incoming.code || "NOT_AUTHORIZED", {
      originalStatus: incoming.status,
      originalCode: incoming.code,
    });
  }

  return incoming;
}

function createAdminError_(status, code, message, meta) {
  return createAppError_(status, code, message, meta);
}
