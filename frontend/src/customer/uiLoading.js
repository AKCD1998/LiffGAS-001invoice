const OVERLAY_SELECTOR = '[data-loading-overlay="true"]';
const PREV_DISABLED_ATTR = "data-loading-prev-disabled";
const INTERACTIVE_SELECTOR = "button, input, select, textarea";

function setOverlayText(overlayEl, text) {
  const textEl = overlayEl.querySelector("[data-loading-text]");
  if (!textEl) {
    return;
  }
  textEl.textContent = String(text || "กำลังโหลดข้อมูล...").trim() || "กำลังโหลดข้อมูล...";
}

function disableInteractiveElements(rootEl) {
  const elements = rootEl.querySelectorAll(INTERACTIVE_SELECTOR);
  elements.forEach((element) => {
    if (element.closest(OVERLAY_SELECTOR)) {
      return;
    }
    const prevDisabled = element.disabled ? "1" : "0";
    element.setAttribute(PREV_DISABLED_ATTR, prevDisabled);
    element.disabled = true;
  });
}

function restoreInteractiveElements(rootEl) {
  const elements = rootEl.querySelectorAll(`[${PREV_DISABLED_ATTR}]`);
  elements.forEach((element) => {
    const prevDisabled = element.getAttribute(PREV_DISABLED_ATTR);
    element.disabled = prevDisabled === "1";
    element.removeAttribute(PREV_DISABLED_ATTR);
  });
}

export function ensureLoadingOverlay(rootEl) {
  if (!rootEl) {
    return null;
  }

  const existing = rootEl.querySelector(OVERLAY_SELECTOR);
  if (existing) {
    return existing;
  }

  const overlayEl = document.createElement("div");
  overlayEl.className = "loading-overlay hidden";
  overlayEl.setAttribute("data-loading-overlay", "true");
  overlayEl.setAttribute("aria-hidden", "true");
  overlayEl.style.display = "none";
  overlayEl.innerHTML = `
    <div class="loading-overlay__panel" role="status" aria-live="polite">
      <div class="loading-spinner" aria-hidden="true"></div>
      <p class="loading-overlay__text" data-loading-text>กำลังโหลดข้อมูล...</p>
    </div>
  `;

  rootEl.appendChild(overlayEl);
  return overlayEl;
}

export function showLoading(rootEl, text) {
  if (!rootEl) {
    return;
  }
  const overlayEl = ensureLoadingOverlay(rootEl);
  if (!overlayEl) {
    return;
  }

  setOverlayText(overlayEl, text || "กำลังบันทึก...");
  overlayEl.classList.remove("hidden");
  overlayEl.style.display = "flex";
  overlayEl.setAttribute("aria-hidden", "false");
  disableInteractiveElements(rootEl);
}

export function hideLoading(rootEl) {
  if (!rootEl) {
    return;
  }

  const overlayEl = rootEl.querySelector(OVERLAY_SELECTOR);
  if (overlayEl) {
    overlayEl.classList.add("hidden");
    overlayEl.style.display = "none";
    overlayEl.setAttribute("aria-hidden", "true");
  }
  restoreInteractiveElements(rootEl);
}
