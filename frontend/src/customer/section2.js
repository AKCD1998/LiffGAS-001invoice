import { getErrorDisplayText, saveSection } from "../api.js";

function checkboxValue(form, fieldId) {
  const input = form.querySelector(`[name="${fieldId}"]`);
  return !!(input && input.checked);
}

function textValue(form, fieldId) {
  const input = form.querySelector(`[name="${fieldId}"]`);
  return input ? String(input.value || "").trim() : "";
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

export function renderCustomerSection2(options) {
  const rootEl = options.rootEl;
  const lineUserId = options.lineUserId || "";
  const onBack = options.onBack;
  const onSaved = options.onSaved;
  const lastSaved = options.lastSaved || null;
  const initialData =
    options.initialData && typeof options.initialData === "object"
      ? options.initialData
      : {};

  rootEl.innerHTML = `
    <main class="card">
      <h1 class="title">ประเภทเอกสารที่ต้องการ (ส่วนที่ 2)</h1>
      <p class="subtitle">เลือกเอกสารที่ต้องการอย่างน้อย 1 รายการ</p>

      <div id="section2-warning" class="banner banner-warning hidden"></div>
      <div id="section2-success" class="banner banner-success hidden"></div>
      <div id="section2-error" class="banner banner-error hidden"></div>

      <form id="section2-form" class="form-grid" novalidate>
        <p id="section2-selection-error" class="input-hint input-hint-error"></p>

        <div class="option-block">
          <label class="checkbox-label">
            <input type="checkbox" name="doc_quotation" />
            ใบเสนอราคา
          </label>
          <div class="option-detail" data-detail="doc_quotation">
            <label class="field-label" for="doc_quotation_date">วันที่</label>
            <input id="doc_quotation_date" name="doc_quotation_date" type="date" class="input" />
            <p id="doc_quotation_date_error" class="input-hint input-hint-error"></p>
          </div>
        </div>

        <div class="option-block">
          <label class="checkbox-label">
            <input type="checkbox" name="doc_invoice" />
            ใบแจ้งหนี้ / ใบส่งสินค้า
          </label>
          <div class="option-detail" data-detail="doc_invoice">
            <label class="field-label" for="doc_invoice_date">วันที่</label>
            <input id="doc_invoice_date" name="doc_invoice_date" type="date" class="input" />
            <p id="doc_invoice_date_error" class="input-hint input-hint-error"></p>
          </div>
        </div>

        <div class="option-block">
          <label class="checkbox-label">
            <input type="checkbox" name="doc_store" />
            เอกสารร้าน
          </label>
          <div class="option-detail" data-detail="doc_store">
            <label class="field-label" for="doc_store_text">โปรดระบุเอกสาร</label>
            <input id="doc_store_text" name="doc_store_text" type="text" class="input" />
            <p id="doc_store_text_error" class="input-hint input-hint-error"></p>
          </div>
        </div>

        <div class="option-block">
          <label class="checkbox-label">
            <input type="checkbox" name="doc_receipt_tax" />
            ใบเสร็จรับเงิน / ใบกำกับภาษี
          </label>
          <div class="option-detail" data-detail="doc_receipt_tax">
            <label class="field-label" for="doc_receipt_tax_date">วันที่</label>
            <input id="doc_receipt_tax_date" name="doc_receipt_tax_date" type="date" class="input" />
            <p id="doc_receipt_tax_date_error" class="input-hint input-hint-error"></p>
          </div>
        </div>

        <div class="button-row">
          <button type="button" id="backButton" class="btn btn-ghost">ย้อนกลับ</button>
          <button type="submit" id="nextButton" class="btn btn-primary" disabled>ถัดไป</button>
        </div>
      </form>

      <p class="meta">lineUserId: ${lineUserId || "-"}</p>
      <p class="meta">lastSaved: ${lastSaved?.updatedAt || "-"}</p>
    </main>
  `;

  const formEl = rootEl.querySelector("#section2-form");
  const nextButtonEl = rootEl.querySelector("#nextButton");
  const backButtonEl = rootEl.querySelector("#backButton");
  const warningEl = rootEl.querySelector("#section2-warning");
  const successEl = rootEl.querySelector("#section2-success");
  const errorEl = rootEl.querySelector("#section2-error");
  const selectionErrorEl = rootEl.querySelector("#section2-selection-error");

  const quotationErrorEl = rootEl.querySelector("#doc_quotation_date_error");
  const invoiceErrorEl = rootEl.querySelector("#doc_invoice_date_error");
  const storeErrorEl = rootEl.querySelector("#doc_store_text_error");
  const receiptTaxErrorEl = rootEl.querySelector("#doc_receipt_tax_date_error");

  let saving = false;

  function showBanner(element, message) {
    if (!element) {
      return;
    }
    element.textContent = message || "";
    if (message) {
      element.classList.remove("hidden");
    } else {
      element.classList.add("hidden");
    }
  }

  function hideAllBanners() {
    showBanner(warningEl, "");
    showBanner(successEl, "");
    showBanner(errorEl, "");
  }

  const quotationCheckboxEl = formEl.querySelector('[name="doc_quotation"]');
  const quotationDateEl = formEl.querySelector('[name="doc_quotation_date"]');
  const invoiceCheckboxEl = formEl.querySelector('[name="doc_invoice"]');
  const invoiceDateEl = formEl.querySelector('[name="doc_invoice_date"]');
  const storeCheckboxEl = formEl.querySelector('[name="doc_store"]');
  const storeTextEl = formEl.querySelector('[name="doc_store_text"]');
  const receiptCheckboxEl = formEl.querySelector('[name="doc_receipt_tax"]');
  const receiptDateEl = formEl.querySelector('[name="doc_receipt_tax_date"]');

  quotationCheckboxEl.checked = toBoolean(initialData.doc_quotation);
  quotationDateEl.value = String(initialData.doc_quotation_date || "");
  invoiceCheckboxEl.checked = toBoolean(initialData.doc_invoice);
  invoiceDateEl.value = String(initialData.doc_invoice_date || "");
  storeCheckboxEl.checked = toBoolean(initialData.doc_store);
  storeTextEl.value = String(initialData.doc_store_text || "");
  receiptCheckboxEl.checked = toBoolean(initialData.doc_receipt_tax);
  receiptDateEl.value = String(initialData.doc_receipt_tax_date || "");

  function collectState() {
    const docQuotation = checkboxValue(formEl, "doc_quotation");
    const docQuotationDate = textValue(formEl, "doc_quotation_date");
    const docInvoice = checkboxValue(formEl, "doc_invoice");
    const docInvoiceDate = textValue(formEl, "doc_invoice_date");
    const docStore = checkboxValue(formEl, "doc_store");
    const docStoreText = textValue(formEl, "doc_store_text");
    const docReceiptTax = checkboxValue(formEl, "doc_receipt_tax");
    const docReceiptTaxDate = textValue(formEl, "doc_receipt_tax_date");

    const errors = {
      selection: "",
      doc_quotation_date: "",
      doc_invoice_date: "",
      doc_store_text: "",
      doc_receipt_tax_date: "",
    };

    const selectedCount =
      (docQuotation ? 1 : 0) +
      (docInvoice ? 1 : 0) +
      (docStore ? 1 : 0) +
      (docReceiptTax ? 1 : 0);

    if (selectedCount === 0) {
      errors.selection = "กรุณาเลือกอย่างน้อย 1 ประเภทเอกสาร";
    }

    if (docQuotation && !docQuotationDate) {
      errors.doc_quotation_date = "กรุณาระบุวันที่";
    }
    if (docInvoice && !docInvoiceDate) {
      errors.doc_invoice_date = "กรุณาระบุวันที่";
    }
    if (docStore && !docStoreText) {
      errors.doc_store_text = "กรุณาระบุเอกสาร";
    }
    if (docReceiptTax && !docReceiptTaxDate) {
      errors.doc_receipt_tax_date = "กรุณาระบุวันที่";
    }

    const hasError = Object.values(errors).some((msg) => msg !== "");
    return {
      docQuotation,
      docQuotationDate,
      docInvoice,
      docInvoiceDate,
      docStore,
      docStoreText,
      docReceiptTax,
      docReceiptTaxDate,
      errors,
      canSubmit: !hasError,
    };
  }

  function renderDetailVisibility() {
    const details = formEl.querySelectorAll("[data-detail]");
    details.forEach((detailEl) => {
      const key = detailEl.getAttribute("data-detail");
      const checkbox = formEl.querySelector(`[name="${key}"]`);
      const checked = !!(checkbox && checkbox.checked);
      detailEl.classList.toggle("hidden", !checked);
    });
  }

  function renderValidation() {
    const state = collectState();
    selectionErrorEl.textContent = state.errors.selection;
    quotationErrorEl.textContent = state.errors.doc_quotation_date;
    invoiceErrorEl.textContent = state.errors.doc_invoice_date;
    storeErrorEl.textContent = state.errors.doc_store_text;
    receiptTaxErrorEl.textContent = state.errors.doc_receipt_tax_date;
    nextButtonEl.disabled = !state.canSubmit || saving;
  }

  function setSavingState(isSaving) {
    saving = isSaving;
    nextButtonEl.textContent = isSaving ? "กำลังบันทึก..." : "ถัดไป";
    renderValidation();
  }

  formEl.addEventListener("input", () => {
    renderDetailVisibility();
    renderValidation();
  });

  backButtonEl.addEventListener("click", () => {
    if (typeof onBack === "function") {
      onBack();
    }
  });

  formEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    renderDetailVisibility();
    renderValidation();

    const state = collectState();
    if (!state.canSubmit || saving) {
      return;
    }

    hideAllBanners();
    setSavingState(true);

    const payload = {
      lineUserId: lineUserId,
      section: 2,
      data: {
        doc_quotation: state.docQuotation,
        doc_quotation_date: state.docQuotation ? state.docQuotationDate : "",
        doc_invoice: state.docInvoice,
        doc_invoice_date: state.docInvoice ? state.docInvoiceDate : "",
        doc_store: state.docStore,
        doc_store_text: state.docStore ? state.docStoreText : "",
        doc_receipt_tax: state.docReceiptTax,
        doc_receipt_tax_date: state.docReceiptTax ? state.docReceiptTaxDate : "",
      },
      clientTs: new Date().toISOString(),
    };

    try {
      const result = await saveSection(payload);
      const progressPercent =
        result?.progress?.progress_percent != null
          ? result.progress.progress_percent
          : "-";
      showBanner(successEl, `บันทึกแล้ว ✅ (ความคืบหน้า ${progressPercent}%)`);
      if (result?.warning) {
        showBanner(warningEl, result.warning);
      }
      if (typeof onSaved === "function") {
        setTimeout(() => onSaved(result, payload.data), 450);
      }
    } catch (error) {
      showBanner(errorEl, `บันทึกไม่สำเร็จ: ${getErrorDisplayText(error, true)}`);
    } finally {
      setSavingState(false);
    }
  });

  renderDetailVisibility();
  renderValidation();
}
