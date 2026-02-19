const PHONE_FIELD_NAMES = Object.freeze(["officePhone", "contactPhone"]);

function warnIfNumberPhone(value, fieldName) {
  if (typeof value !== "number") {
    return;
  }

  const name = String(fieldName || "phone");
  if (typeof console !== "undefined" && typeof console.warn === "function") {
    console.warn(`[phone] ${name} should be string but received number`, value);
  }
}

export function asPhoneString(value, fieldName) {
  if (value === null || typeof value === "undefined") {
    return "";
  }
  warnIfNumberPhone(value, fieldName);
  return String(value).trim();
}

export function sanitizeTelHref(value) {
  const text = asPhoneString(value, "tel");
  return text.replace(/[^\d+]/g, "");
}

export function normalizePhoneFields(source) {
  const input =
    source && typeof source === "object" && !Array.isArray(source) ? source : {};
  const next = { ...input };

  PHONE_FIELD_NAMES.forEach((fieldName) => {
    if (!Object.prototype.hasOwnProperty.call(next, fieldName)) {
      return;
    }
    next[fieldName] = asPhoneString(next[fieldName], fieldName);
  });

  return next;
}
