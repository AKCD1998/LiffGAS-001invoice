const LINE_PUSH_ENDPOINT_ = "https://api.line.me/v2/bot/message/push";

function pushProgressIfNeeded_(requestObj) {
  const request = requestObj && typeof requestObj === "object" ? requestObj : {};
  const lineUserId = String(request.lineUserId || "").trim();
  const requestId = String(request.requestId || "").trim();
  const progressPercent = normalizeNumberForPush_(request.progress_percent);
  const lastNotifiedProgress = normalizeNumberForPush_(
    request.lastNotifiedProgress,
  );

  if (!lineUserId) {
    return {
      shouldUpdateLastNotified: false,
      lastNotifiedProgress: lastNotifiedProgress,
    };
  }

  const pushEnabled = getScriptBooleanProperty_("LINE_PUSH_ENABLED", false);
  if (!pushEnabled) {
    appendAuditLog_(lineUserId, "linePushSkippedDisabled", requestId, {
      progressPercent: progressPercent,
      lastNotifiedProgress: lastNotifiedProgress,
    });
    return {
      shouldUpdateLastNotified: false,
      lastNotifiedProgress: lastNotifiedProgress,
    };
  }

  if (progressPercent <= lastNotifiedProgress) {
    appendAuditLog_(lineUserId, "linePushSkippedNoIncrease", requestId, {
      progressPercent: progressPercent,
      lastNotifiedProgress: lastNotifiedProgress,
    });
    return {
      shouldUpdateLastNotified: false,
      lastNotifiedProgress: lastNotifiedProgress,
    };
  }

  const messageText = buildProgressMessageText_(progressPercent);
  const messages = [{ type: "text", text: messageText }];
  const dryRun = getScriptBooleanProperty_("LINE_PUSH_DRY_RUN", true);

  if (dryRun) {
    appendAuditLog_(lineUserId, "linePushDryRun", requestId, {
      progressPercent: progressPercent,
      lastNotifiedProgress: lastNotifiedProgress,
      messages: messages,
    });
    return {
      shouldUpdateLastNotified: true,
      lastNotifiedProgress: progressPercent,
    };
  }

  const accessToken = getScriptProperty_("LINE_CHANNEL_ACCESS_TOKEN", "");
  if (!accessToken) {
    appendAuditLog_(lineUserId, "linePushFailed", requestId, {
      reason: "Missing Script Property LINE_CHANNEL_ACCESS_TOKEN",
      progressPercent: progressPercent,
    });
    return {
      shouldUpdateLastNotified: false,
      lastNotifiedProgress: lastNotifiedProgress,
    };
  }

  const pushResult = callLinePush_(lineUserId, messages, accessToken);
  if (!pushResult.ok) {
    appendAuditLog_(lineUserId, "linePushFailed", requestId, {
      progressPercent: progressPercent,
      statusCode: pushResult.statusCode,
      responseBody: truncateForAudit_(pushResult.responseBody, 500),
    });
    return {
      shouldUpdateLastNotified: false,
      lastNotifiedProgress: lastNotifiedProgress,
    };
  }

  appendAuditLog_(lineUserId, "linePushSent", requestId, {
    progressPercent: progressPercent,
    statusCode: pushResult.statusCode,
    messages: messages,
  });

  return {
    shouldUpdateLastNotified: true,
    lastNotifiedProgress: progressPercent,
  };
}

function buildProgressMessageText_(progressPercent) {
  const progress = normalizeNumberForPush_(progressPercent);
  let baseText = "";

  if (progress === 25) {
    baseText = "บันทึกข้อมูลลูกค้าแล้ว ✅ (1/4) ต่อไป: เลือกประเภทเอกสาร";
  } else if (progress === 50) {
    baseText = "เลือกประเภทเอกสารแล้ว ✅ (2/4) ต่อไป: รายละเอียดการชำระเงิน";
  } else if (progress === 75) {
    baseText = "บันทึกรายละเอียดการชำระแล้ว ✅ (3/4) ต่อไป: ช่องทางติดต่อ";
  } else if (progress === 100) {
    baseText = "ข้อมูลครบแล้ว ✅ ทีมงานจะติดต่อกลับ ขอบคุณค่ะ";
  } else {
    baseText = "อัปเดตความคืบหน้าแล้ว ✅";
  }

  const liffBaseUrl = getScriptProperty_("LIFF_APP_BASE_URL", "");
  if (liffBaseUrl) {
    return `${baseText}\nเปิดแบบฟอร์ม: ${liffBaseUrl}`;
  }
  return baseText;
}

function callLinePush_(to, messages, accessToken) {
  try {
    const payload = {
      to: to,
      messages: messages || [],
    };

    const response = UrlFetchApp.fetch(LINE_PUSH_ENDPOINT_, {
      method: "post",
      contentType: "application/json",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    const statusCode = response.getResponseCode();
    const responseBody = response.getContentText();
    return {
      ok: statusCode >= 200 && statusCode < 300,
      statusCode: statusCode,
      responseBody: responseBody,
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: 0,
      responseBody: String((error && error.message) || error || ""),
    };
  }
}

function normalizeNumberForPush_(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return 0;
  }
  return normalized;
}

function truncateForAudit_(text, maxLen) {
  const raw = String(text || "");
  const limit = Number(maxLen);
  if (!Number.isFinite(limit) || limit < 1) {
    return raw;
  }
  if (raw.length <= limit) {
    return raw;
  }
  return `${raw.slice(0, limit)}...(truncated)`;
}
