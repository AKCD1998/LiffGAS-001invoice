import { getErrorDisplayText, saveSection } from "../api.js";
import { asPhoneString } from "../utils/phone.js";
import { ensureLoadingOverlay, hideLoading, showLoading } from "./uiLoading.js";

export function isValidThaiTaxId13(taxId13) {
  const normalized = String(taxId13 || "").trim();
  if (!/^\d{13}$/.test(normalized)) {
    return false;
  }

  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += Number(normalized[i]) * (13 - i);
  }

  const mod = sum % 11;
  const check = (11 - mod) % 10;
  return check === Number(normalized[12]);
}

function getTaxIdValidation(taxId) {
  const normalized = String(taxId || "").trim();
  const taxIdFormatOk = /^\d{13}$/.test(normalized);
  const taxIdChecksumOk = taxIdFormatOk && isValidThaiTaxId13(normalized);
  return {
    normalized,
    taxIdFormatOk,
    taxIdChecksumOk,
  };
}

function fieldValueById(form, fieldId) {
  const input = form.querySelector(`[name="${fieldId}"]`);
  return input ? String(input.value || "").trim() : "";
}

export function renderCustomerSection1(options) {
  const rootEl = options.rootEl;
  const lineUserId = options.lineUserId || "";
  const onBack = options.onBack;
  const onSaved = options.onSaved;
  const lastSaved = options.lastSaved || null;
  const initialData =
    options.initialData && typeof options.initialData === "object"
      ? options.initialData
      : {};
  const initialNotice = String(options.initialNotice || "").trim();

  rootEl.innerHTML = `
    <main class="card">
      <h1 class="title">ข้อมูลสำนักงาน (ส่วนที่ 1)</h1>
      <p class="subtitle">กรอกข้อมูลพื้นฐานสำหรับออกเอกสาร</p>

      <div id="section1-warning" class="banner banner-warning hidden"></div>
      <div id="section1-success" class="banner banner-success hidden"></div>
      <div id="section1-error" class="banner banner-error hidden"></div>

      <form id="section1-form" class="form-grid" novalidate>
        <label class="field-label" for="officeName">ชื่อสำนักงาน</label>
        <input id="officeName" name="officeName" class="input" type="text" required />

        <label class="field-label" for="taxInvoiceAddress">ที่อยู่ (สำหรับการออกใบกำกับภาษี)</label>
        <textarea id="taxInvoiceAddress" name="taxInvoiceAddress" class="input textarea" rows="3" required></textarea>

        <label class="field-label" for="taxId13">เลขประจำตัวผู้เสียภาษี 13 หลัก</label>
        <input id="taxId13" name="taxId13" class="input" type="text" inputmode="numeric" maxlength="13" required />
        <p id="taxIdMessage" class="input-hint"></p>

        <label class="field-label" for="officePhone">เบอร์โทรสำนักงาน</label>
        <input id="officePhone" name="officePhone" class="input" type="tel" required />

        <div class="button-row">
          <button type="button" id="backButton" class="btn btn-ghost">กลับ</button>
          <button type="submit" id="nextButton" class="btn btn-primary" disabled>ถัดไป</button>
        </div>
      </form>

      <p class="meta">lineUserId: ${lineUserId || "-"}</p>
      <p class="meta">lastSaved: ${lastSaved?.updatedAt || "-"}</p>
    </main>
  `;

  const formEl = rootEl.querySelector("#section1-form");
  const officeNameInputEl = rootEl.querySelector("#officeName");
  const taxInvoiceAddressInputEl = rootEl.querySelector("#taxInvoiceAddress");
  const taxIdInputEl = rootEl.querySelector("#taxId13");
  const officePhoneInputEl = rootEl.querySelector("#officePhone");
  const taxIdMessageEl = rootEl.querySelector("#taxIdMessage");
  const nextButtonEl = rootEl.querySelector("#nextButton");
  const backButtonEl = rootEl.querySelector("#backButton");
  const warningEl = rootEl.querySelector("#section1-warning");
  const successEl = rootEl.querySelector("#section1-success");
  const errorEl = rootEl.querySelector("#section1-error");
  ensureLoadingOverlay(rootEl);

  let taxIdTouched = false;
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

  officeNameInputEl.value = String(initialData.officeName || "");
  taxInvoiceAddressInputEl.value = String(initialData.taxInvoiceAddress || "");
  taxIdInputEl.value = String(initialData.taxId13 || "").replace(/\D/g, "").slice(0, 13);
  officePhoneInputEl.value = asPhoneString(initialData.officePhone, "officePhone");
  taxIdTouched = taxIdInputEl.value !== "";

  if (initialNotice) {
    showBanner(warningEl, initialNotice);
  }

  function getCurrentFormState() {
    const officeName = fieldValueById(formEl, "officeName");
    const taxInvoiceAddress = fieldValueById(formEl, "taxInvoiceAddress");
    const taxId13 = fieldValueById(formEl, "taxId13");
    const officePhone = asPhoneString(
      fieldValueById(formEl, "officePhone"),
      "officePhone",
    );
    const taxValidation = getTaxIdValidation(taxId13);
    const allRequiredFilled =
      officeName !== "" &&
      taxInvoiceAddress !== "" &&
      taxValidation.normalized !== "" &&
      officePhone !== "";

    const canSubmit =
      allRequiredFilled &&
      taxValidation.taxIdFormatOk &&
      taxValidation.taxIdChecksumOk;

    return {
      officeName,
      taxInvoiceAddress,
      officePhone,
      taxId13: taxValidation.normalized,
      taxIdFormatOk: taxValidation.taxIdFormatOk,
      taxIdChecksumOk: taxValidation.taxIdChecksumOk,
      canSubmit,
    };
  }

  function renderValidationState() {
    const formState = getCurrentFormState();
    if (!taxIdTouched && formState.taxId13 === "") {
      taxIdMessageEl.textContent = "";
      taxIdMessageEl.className = "input-hint";
    } else if (!formState.taxIdFormatOk) {
      taxIdMessageEl.textContent = "กรุณากรอกเลข 13 หลัก";
      taxIdMessageEl.className = "input-hint input-hint-error";
    } else if (!formState.taxIdChecksumOk) {
      taxIdMessageEl.textContent =
        "เลขผู้เสียภาษีไม่ถูกต้อง (checksum ไม่ผ่าน)";
      taxIdMessageEl.className = "input-hint input-hint-error";
    } else {
      taxIdMessageEl.textContent = "";
      taxIdMessageEl.className = "input-hint";
    }

    nextButtonEl.disabled = !formState.canSubmit || saving;
  }

  function setSavingState(isSaving) {
    saving = isSaving;
    nextButtonEl.textContent = isSaving ? "กำลังบันทึก..." : "ถัดไป";
    if (isSaving) {
      showLoading(rootEl, "กำลังบันทึก...");
    } else {
      hideLoading(rootEl);
    }
    renderValidationState();
  }

  formEl.addEventListener("input", (event) => {
    if (event.target === taxIdInputEl) {
      taxIdInputEl.value = taxIdInputEl.value.replace(/\D/g, "").slice(0, 13);
      taxIdTouched = true;
    }
    renderValidationState();
  });

  taxIdInputEl.addEventListener("blur", () => {
    taxIdTouched = true;
    renderValidationState();
  });

  backButtonEl.addEventListener("click", () => {
    if (typeof onBack === "function") {
      onBack();
    }
  });

  formEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    taxIdTouched = true;
    renderValidationState();

    const formState = getCurrentFormState();
    if (!formState.canSubmit || saving) {
      return;
    }

    hideAllBanners();
    setSavingState(true);

    try {
      const payload = {
        lineUserId: lineUserId,
        section: 1,
        data: {
          officeName: formState.officeName,
          taxInvoiceAddress: formState.taxInvoiceAddress,
          taxId13: formState.taxId13,
          officePhone: formState.officePhone,
          taxId_format_ok: formState.taxIdFormatOk,
          taxId_checksum_ok: formState.taxIdChecksumOk,
          taxId_verify_status: "not_checked",
          taxId_verify_note: "",
        },
        clientTs: new Date().toISOString(),
      };

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
        onSaved(result, payload.data);
      }
    } catch (error) {
      showBanner(
        errorEl,
        `บันทึกไม่สำเร็จ: ${getErrorDisplayText(error, true)}`,
      );
    } finally {
      setSavingState(false);
    }
  });

  renderValidationState();
}
