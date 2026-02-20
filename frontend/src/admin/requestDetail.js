import { adminGetRequest, getErrorDisplayText } from "../api.js";
import { asPhoneString, sanitizeTelHref } from "../utils/phone.js";
import {
  ensureLoadingOverlay,
  hideLoading,
  showLoading,
} from "../customer/uiLoading.js";
import {
  formatDateCompact,
  formatDateTimeCompact,
} from "./timeFormat.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function displayText(value, fallback = "-") {
  const text = String(value ?? "").trim();
  return text ? escapeHtml(text) : fallback;
}

function normalizePercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  if (parsed < 0) {
    return 0;
  }
  if (parsed > 100) {
    return 100;
  }
  return Math.round(parsed);
}

function statusClass(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return normalized === "ready" ? "status status-ready" : "status status-draft";
}

function toBoolean(value) {
  if (value === true) {
    return true;
  }
  if (value === false || value === null || typeof value === "undefined") {
    return false;
  }
  const normalized = String(value).trim().toLowerCase();
  return (
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes" ||
    normalized === "y"
  );
}

function paymentMethodLabel(method) {
  const value = String(method || "").trim();
  if (value === "cash") {
    return "เงินสด";
  }
  if (value === "transfer") {
    return "โอนชำระ";
  }
  if (value === "cheque") {
    return "เช็ค";
  }
  if (value === "withholdingTax") {
    return "ใบหักภาษี ณ ที่จ่าย";
  }
  return value || "-";
}

function maskTaxId(taxId) {
  const normalized = String(taxId || "").replace(/\s+/g, "");
  if (!/^\d{13}$/.test(normalized)) {
    return normalized || "-";
  }
  const first = normalized.slice(0, 4);
  const last = normalized.slice(-2);
  return `${first}${"*".repeat(7)}${last}`;
}

function taxFlag(value) {
  return toBoolean(value) ? "✅" : "❌";
}

function buildDocumentDetailRows(item) {
  const rows = [];
  const quotationDate = formatDateCompact(item.doc_quotation_date);
  const invoiceDate = formatDateCompact(item.doc_invoice_date);
  const receiptTaxDate = formatDateCompact(item.doc_receipt_tax_date);
  if (toBoolean(item.doc_quotation)) {
    rows.push(
      `<li>ใบเสนอราคา - วันที่: ${displayText(quotationDate)}</li>`,
    );
  }
  if (toBoolean(item.doc_invoice)) {
    rows.push(
      `<li>ใบแจ้งหนี้ / ใบส่งสินค้า - วันที่: ${displayText(invoiceDate)}</li>`,
    );
  }
  if (toBoolean(item.doc_store)) {
    rows.push(
      `<li>เอกสารร้าน - รายละเอียด: ${displayText(item.doc_store_text)}</li>`,
    );
  }
  if (toBoolean(item.doc_receipt_tax)) {
    rows.push(
      `<li>ใบเสร็จรับเงิน / ใบกำกับภาษี - วันที่: ${displayText(receiptTaxDate)}</li>`,
    );
  }
  if (rows.length === 0) {
    rows.push("<li>-</li>");
  }
  return rows.join("");
}

function showToast(rootEl, message) {
  const toastEl = rootEl.querySelector("#adminDetailToast");
  if (!toastEl) {
    return;
  }
  toastEl.textContent = String(message || "").trim();
  toastEl.classList.remove("hidden");
  clearTimeout(showToast._timerId);
  showToast._timerId = setTimeout(() => {
    toastEl.classList.add("hidden");
  }, 1600);
}

function setBanner(el, message, type) {
  if (!el) {
    return;
  }
  const text = String(message || "").trim();
  el.className = "banner";
  if (!text) {
    el.textContent = "";
    el.classList.add("hidden");
    return;
  }
  if (type === "error") {
    el.classList.add("banner-error");
  } else if (type === "success") {
    el.classList.add("banner-success");
  } else {
    el.classList.add("banner-warning");
  }
  el.textContent = text;
}

function renderItem(rootEl, item, requestId, onBack) {
  const progress = normalizePercent(item.progress_percent);
  const status = String(item.status || "").trim() || "draft";
  const officePhone = asPhoneString(item.officePhone, "officePhone");
  const contactPhone = asPhoneString(item.contactPhone, "contactPhone");
  const officePhoneHref = sanitizeTelHref(officePhone);
  const contactPhoneHref = sanitizeTelHref(contactPhone);
  const customerLineUserId = String(item.lineUserId || "").trim();

  rootEl.innerHTML = `
    <main class="card admin-detail">
      <h1 class="title">รายละเอียดคำขอ</h1>
      <p class="subtitle">${displayText(item.officeName)} (requestId: ${displayText(
        requestId,
      )})</p>

      <div class="summary-block">
        <p><strong>updatedAt:</strong> ${displayText(
          formatDateTimeCompact(item.updatedAt),
        )}</p>
        <p><strong>status:</strong> <span class="${statusClass(status)}">${displayText(
          status,
        )}</span></p>
        <div class="progress-wrap">
          <div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div>
          <span class="progress-text">${progress}%</span>
        </div>
      </div>

      <div class="summary-block">
        <h2>ช่องทางติดต่อ</h2>
        <p><strong>officePhone:</strong> ${
          officePhoneHref
            ? `<a href="tel:${escapeHtml(officePhoneHref)}">${displayText(
                officePhone,
                "",
              )}</a>`
            : "-"
        }</p>
        <p><strong>contactPhone:</strong> ${
          contactPhoneHref
            ? `<a href="tel:${escapeHtml(contactPhoneHref)}">${displayText(
                contactPhone,
                "",
              )}</a>`
            : "-"
        }</p>
        <p><strong>contactLineId:</strong> ${displayText(item.contactLineId)}</p>
        <p><strong>customer lineUserId:</strong> ${displayText(customerLineUserId)}</p>
        <button id="copyLineUserIdButton" class="btn btn-secondary btn-sm">คัดลอก lineUserId</button>
      </div>

      <div class="summary-block">
        <h2>เอกสารที่ขอ</h2>
        <p><strong>สรุป:</strong> ${displayText(item.docSummary)}</p>
        <ul class="summary-list">
          ${buildDocumentDetailRows(item)}
        </ul>
      </div>

      <div class="summary-block">
        <h2>การชำระเงิน</h2>
        <p><strong>ยอดเงินรวม:</strong> ${displayText(item.totalAmount)}</p>
        <p><strong>วิธีชำระ:</strong> ${displayText(paymentMethodLabel(item.paymentMethod))}</p>
        <p><strong>หมายเหตุ:</strong> ${displayText(item.paymentNotes)}</p>
      </div>

      <div class="summary-block">
        <h2>ข้อมูลลูกค้า (ส่วนที่ 1)</h2>
        <p><strong>ชื่อสำนักงาน:</strong> ${displayText(item.officeName)}</p>
        <p><strong>ที่อยู่ใบกำกับภาษี:</strong> ${displayText(item.taxInvoiceAddress)}</p>
        <p><strong>เลขผู้เสียภาษี:</strong> ${displayText(maskTaxId(item.taxId13), "-")}</p>
        <p><strong>format_ok:</strong> ${taxFlag(item.taxId_format_ok)}</p>
        <p><strong>checksum_ok:</strong> ${taxFlag(item.taxId_checksum_ok)}</p>
        <p><strong>verify_status:</strong> ${displayText(item.taxId_verify_status)}</p>
      </div>

      <div class="button-row admin-bottom-actions">
        <button id="adminDetailBackButton" class="btn btn-ghost">ย้อนกลับ</button>
      </div>
      <div id="adminDetailToast" class="detail-toast hidden">คัดลอกแล้ว ✅</div>
    </main>
  `;

  const backButton = rootEl.querySelector("#adminDetailBackButton");
  const copyButton = rootEl.querySelector("#copyLineUserIdButton");

  backButton.addEventListener("click", () => {
    if (typeof onBack === "function") {
      onBack();
    }
  });

  copyButton.addEventListener("click", async () => {
    const valueToCopy = customerLineUserId;
    if (!valueToCopy) {
      showToast(rootEl, "ไม่พบ lineUserId");
      return;
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(valueToCopy);
      } else {
        const temp = document.createElement("textarea");
        temp.value = valueToCopy;
        temp.style.position = "fixed";
        temp.style.opacity = "0";
        document.body.appendChild(temp);
        temp.focus();
        temp.select();
        document.execCommand("copy");
        document.body.removeChild(temp);
      }
      showToast(rootEl, "คัดลอกแล้ว ✅");
    } catch (error) {
      showToast(rootEl, "คัดลอกไม่สำเร็จ");
    }
  });
}

export function renderAdminRequestDetail(options) {
  const rootEl = options.rootEl;
  const lineUserId = String(options.lineUserId || "").trim();
  const adminToken = String(options.adminToken || "").trim();
  const requestId = String(options.requestId || "").trim();
  const onBack = options.onBack;
  const onBackToLogin = options.onBackToLogin;

  rootEl.innerHTML = `
    <main class="card admin-detail">
      <h1 class="title">รายละเอียดคำขอ</h1>
      <p class="subtitle">requestId: ${displayText(requestId)}</p>
      <div id="adminDetailBanner" class="banner hidden"></div>
      <div class="summary-block">
        <p>กำลังโหลดข้อมูล...</p>
      </div>
      <div class="button-row admin-bottom-actions">
        <button id="adminDetailBackButton" class="btn btn-ghost">ย้อนกลับ</button>
        <button id="adminDetailLoginButton" class="btn btn-secondary hidden">กลับหน้าเข้าสู่ระบบ</button>
      </div>
      <div id="adminDetailToast" class="detail-toast hidden"></div>
    </main>
  `;
  ensureLoadingOverlay(rootEl);

  const bannerEl = rootEl.querySelector("#adminDetailBanner");
  const backButton = rootEl.querySelector("#adminDetailBackButton");
  const loginButton = rootEl.querySelector("#adminDetailLoginButton");

  backButton.addEventListener("click", () => {
    if (typeof onBack === "function") {
      onBack();
    }
  });
  loginButton.addEventListener("click", () => {
    if (typeof onBackToLogin === "function") {
      onBackToLogin();
    }
  });

  if (!lineUserId || !adminToken) {
    hideLoading(rootEl);
    setBanner(bannerEl, "กรุณาเข้าสู่ระบบใหม่", "error");
    loginButton.classList.remove("hidden");
    return;
  }
  if (!requestId) {
    hideLoading(rootEl);
    setBanner(bannerEl, "ไม่พบคำขอ", "error");
    return;
  }

  showLoading(rootEl, "กำลังโหลดข้อมูล...");
  adminGetRequest(lineUserId, adminToken, requestId)
    .then((result) => {
      const item = result?.item;
      if (!item) {
        setBanner(bannerEl, "ไม่พบคำขอ", "error");
        return;
      }
      renderItem(rootEl, item, requestId, onBack);
    })
    .catch((error) => {
      const message = getErrorDisplayText(error, true);
      setBanner(bannerEl, message, "error");
      if (String(error?.code || "").toUpperCase() === "NOT_AUTHORIZED") {
        loginButton.classList.remove("hidden");
      }
    })
    .finally(() => {
      hideLoading(rootEl);
    });
}
