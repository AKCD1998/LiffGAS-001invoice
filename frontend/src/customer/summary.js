import { asPhoneString, sanitizeTelHref } from "../utils/phone.js";

function escapeHtml(value) {
  const raw = String(value ?? "");
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function displayValue(value) {
  const text = String(value ?? "").trim();
  return text === "" ? "-" : escapeHtml(text);
}

function toBoolean(value) {
  if (value === true) {
    return true;
  }
  if (value === false || value === null || typeof value === "undefined") {
    return false;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

function selectedDocumentsSummary(draft) {
  const items = [];
  if (toBoolean(draft.doc_quotation)) {
    items.push(`ใบเสนอราคา (${displayValue(draft.doc_quotation_date)})`);
  }
  if (toBoolean(draft.doc_invoice)) {
    items.push(`ใบแจ้งหนี้ / ใบส่งสินค้า (${displayValue(draft.doc_invoice_date)})`);
  }
  if (toBoolean(draft.doc_store)) {
    items.push(`เอกสารร้าน (${displayValue(draft.doc_store_text)})`);
  }
  if (toBoolean(draft.doc_receipt_tax)) {
    items.push(
      `ใบเสร็จรับเงิน / ใบกำกับภาษี (${displayValue(draft.doc_receipt_tax_date)})`,
    );
  }
  return items.length > 0 ? items : ["-"];
}

function progressText(draft) {
  const progress = draft && draft.progress_percent != null ? draft.progress_percent : 0;
  return `${escapeHtml(progress)}%`;
}

function phoneSummaryHtml(value, fieldName) {
  const rawPhone = asPhoneString(value, fieldName);
  if (!rawPhone) {
    return "-";
  }

  const telHref = sanitizeTelHref(rawPhone);
  if (!telHref) {
    return escapeHtml(rawPhone);
  }

  return `<a href="tel:${escapeHtml(telHref)}">${escapeHtml(rawPhone)}</a>`;
}

export function renderCustomerSummary(options) {
  const rootEl = options.rootEl;
  const draft =
    options.draft && typeof options.draft === "object" ? options.draft : null;

  if (!draft) {
    rootEl.innerHTML = `
      <main class="card">
        <h1 class="title">สรุปข้อมูล</h1>
        <p class="subtitle">ไม่พบข้อมูลแบบร่าง</p>
        <div class="button-row">
          <button class="btn btn-secondary" data-route="/customer">กลับหน้าลูกค้า</button>
        </div>
      </main>
    `;
    return;
  }

  const docItems = selectedDocumentsSummary(draft)
    .map((item) => `<li>${item}</li>`)
    .join("");

  rootEl.innerHTML = `
    <main class="card">
      <h1 class="title">สรุปข้อมูลคำขอ</h1>
      <p class="subtitle">ตรวจสอบข้อมูลที่บันทึกล่าสุด</p>

      <div class="summary-block">
        <h2>ส่วนที่ 1</h2>
        <p><strong>ชื่อสำนักงาน:</strong> ${displayValue(draft.officeName)}</p>
        <p><strong>ที่อยู่:</strong> ${displayValue(draft.taxInvoiceAddress)}</p>
        <p><strong>เลขผู้เสียภาษี:</strong> ${displayValue(draft.taxId13)}</p>
        <p><strong>เบอร์โทรสำนักงาน:</strong> ${phoneSummaryHtml(
          draft.officePhone,
          "officePhone",
        )}</p>
      </div>

      <div class="summary-block">
        <h2>ส่วนที่ 2</h2>
        <ul class="summary-list">${docItems}</ul>
      </div>

      <div class="summary-block">
        <h2>ส่วนที่ 3</h2>
        <p><strong>ยอดเงินรวม:</strong> ${displayValue(draft.totalAmount)}</p>
        <p><strong>วิธีชำระ:</strong> ${displayValue(draft.paymentMethod)}</p>
        <p><strong>หมายเหตุ:</strong> ${displayValue(draft.paymentNotes)}</p>
      </div>

      <div class="summary-block">
        <h2>ส่วนที่ 5</h2>
        <p><strong>ไลน์ ID:</strong> ${displayValue(draft.contactLineId)}</p>
        <p><strong>เบอร์โทรศัพท์:</strong> ${phoneSummaryHtml(
          draft.contactPhone,
          "contactPhone",
        )}</p>
      </div>

      <div class="summary-block">
        <h2>สถานะ</h2>
        <p><strong>ความคืบหน้า:</strong> ${progressText(draft)}</p>
        <p><strong>สถานะ:</strong> ${displayValue(draft.status)}</p>
        <p><strong>updatedAt:</strong> ${displayValue(draft.updatedAt)}</p>
      </div>

      <div class="button-row">
        <button class="btn btn-secondary" data-route="/customer">กลับหน้าลูกค้า</button>
      </div>
    </main>
  `;
}
