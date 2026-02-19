const DEFAULT_LOCALE = "th-TH-u-ca-gregory";
const DEFAULT_FALLBACK = "-";
const warnedInvalidValues = new Set();

function warnInvalidOnce(value) {
  const raw = value === null || typeof value === "undefined" ? String(value) : String(value).trim();
  const key = `${typeof value}:${raw.slice(0, 80)}`;
  if (warnedInvalidValues.has(key)) {
    return;
  }
  warnedInvalidValues.add(key);
  if (typeof console !== "undefined" && typeof console.warn === "function") {
    console.warn("[timeFormat] invalid date/time value:", value);
  }
}

function parseDateValue(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const asMs = Math.abs(value) < 1e12 ? value * 1000 : value;
    const parsed = new Date(asMs);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  if (/^\d+$/.test(text)) {
    const numeric = Number(text);
    if (Number.isFinite(numeric)) {
      const asMs = text.length <= 10 ? numeric * 1000 : numeric;
      const parsedNumeric = new Date(asMs);
      return Number.isFinite(parsedNumeric.getTime()) ? parsedNumeric : null;
    }
  }

  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function sameLocalDate(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function getFormatter(locale, options) {
  return new Intl.DateTimeFormat(locale || DEFAULT_LOCALE, options);
}

function fallbackValue(opts) {
  const text = String((opts && opts.fallback) || DEFAULT_FALLBACK).trim();
  return text || DEFAULT_FALLBACK;
}

function resolveDate(value, opts) {
  const parsed = parseDateValue(value);
  if (parsed) {
    return parsed;
  }
  if (value !== null && typeof value !== "undefined" && String(value).trim() !== "") {
    warnInvalidOnce(value);
  }
  return null;
}

export function formatDateCompact(value, opts) {
  const date = resolveDate(value, opts);
  if (!date) {
    return fallbackValue(opts);
  }

  const formatter = getFormatter(opts && opts.locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return formatter.format(date);
}

export function formatTimeCompact(value, opts) {
  const date = resolveDate(value, opts);
  if (!date) {
    return fallbackValue(opts);
  }

  const formatter = getFormatter(opts && opts.locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(date);
}

export function formatDateTimeCompact(value, opts) {
  const date = resolveDate(value, opts);
  if (!date) {
    return fallbackValue(opts);
  }

  const now = opts && opts.now instanceof Date ? opts.now : new Date();
  const yesterday = new Date(now.getTime());
  yesterday.setDate(now.getDate() - 1);
  const timeText = formatTimeCompact(date, opts);

  if (!opts || opts.relative !== false) {
    if (sameLocalDate(date, now)) {
      return `วันนี้ ${timeText}`;
    }
    if (sameLocalDate(date, yesterday)) {
      return `เมื่อวาน ${timeText}`;
    }
  }

  return `${formatDateCompact(date, opts)} ${timeText}`;
}
