import { getErrorDisplayText, saveSection } from "../api.js";

function textValue(form, fieldId) {
  const input = form.querySelector(`[name="${fieldId}"]`);
  return input ? String(input.value || "").trim() : "";
}

function selectedPaymentMethod(form) {
  const selected = form.querySelector('input[name="paymentMethod"]:checked');
  return selected ? String(selected.value || "").trim() : "";
}

function normalizeAmount(rawValue) {
  return String(rawValue || "")
    .trim()
    .replace(/,/g, "");
}

function validateAmount(rawValue) {
  const normalized = normalizeAmount(rawValue);
  if (!normalized) {
    return {
      isValid: false,
      normalized: "",
      message: "กรุณาระบุยอดเงินรวม",
    };
  }

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      isValid: false,
      normalized: normalized,
      message: "ยอดเงินไม่ถูกต้อง",
    };
  }

  return {
    isValid: true,
    normalized: normalized,
    message: "",
  };
}

export function renderCustomerSection3(options) {
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
      <h1 class="title">รายละเอียดการชำระเงิน (ส่วนที่ 3)</h1>
      <p class="subtitle">ระบุยอดเงินและวิธีชำระ</p>

      <div id="section3-warning" class="banner banner-warning hidden"></div>
      <div id="section3-success" class="banner banner-success hidden"></div>
      <div id="section3-error" class="banner banner-error hidden"></div>

      <form id="section3-form" class="form-grid" novalidate>
        <label class="field-label" for="totalAmount">ยอดเงินรวม</label>
        <input
          id="totalAmount"
          name="totalAmount"
          type="text"
          inputmode="decimal"
          class="input"
          placeholder="เช่น 12,500.00"
        />
        <p id="totalAmountError" class="input-hint input-hint-error"></p>

        <label class="field-label">เลือกวิธีชำระ</label>
        <div class="option-block">
          <label class="checkbox-label">
            <input type="radio" name="paymentMethod" value="cash" />
            เงินสด
          </label>
          <label class="checkbox-label">
            <input type="radio" name="paymentMethod" value="transfer" />
            โอนชำระ
          </label>
          <label class="checkbox-label">
            <input type="radio" name="paymentMethod" value="cheque" />
            เช็ค
          </label>
          <label class="checkbox-label">
            <input type="radio" name="paymentMethod" value="withholdingTax" />
            ใบหักภาษี ณ ที่จ่าย
          </label>
        </div>
        <p id="paymentMethodError" class="input-hint input-hint-error"></p>

        <label class="field-label" for="paymentNotes">หมายเหตุเพิ่มเติม</label>
        <textarea id="paymentNotes" name="paymentNotes" class="input textarea" rows="3"></textarea>

        <div class="button-row">
          <button type="button" id="backButton" class="btn btn-ghost">ย้อนกลับ</button>
          <button type="submit" id="nextButton" class="btn btn-primary" disabled>ถัดไป</button>
        </div>
      </form>

      <p class="meta">lineUserId: ${lineUserId || "-"}</p>
      <p class="meta">lastSaved: ${lastSaved?.updatedAt || "-"}</p>
    </main>
  `;

  const formEl = rootEl.querySelector("#section3-form");
  const nextButtonEl = rootEl.querySelector("#nextButton");
  const backButtonEl = rootEl.querySelector("#backButton");
  const warningEl = rootEl.querySelector("#section3-warning");
  const successEl = rootEl.querySelector("#section3-success");
  const errorEl = rootEl.querySelector("#section3-error");
  const totalAmountErrorEl = rootEl.querySelector("#totalAmountError");
  const paymentMethodErrorEl = rootEl.querySelector("#paymentMethodError");
  const totalAmountInputEl = rootEl.querySelector('[name="totalAmount"]');
  const paymentNotesInputEl = rootEl.querySelector('[name="paymentNotes"]');

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

  totalAmountInputEl.value = String(initialData.totalAmount || "");
  paymentNotesInputEl.value = String(initialData.paymentNotes || "");
  if (initialData.paymentMethod) {
    const method = String(initialData.paymentMethod || "").trim();
    const methodInput = formEl.querySelector(
      `input[name="paymentMethod"][value="${method}"]`,
    );
    if (methodInput) {
      methodInput.checked = true;
    }
  }

  function collectState() {
    const totalAmountRaw = textValue(formEl, "totalAmount");
    const amountValidation = validateAmount(totalAmountRaw);
    const paymentMethod = selectedPaymentMethod(formEl);
    const paymentNotes = textValue(formEl, "paymentNotes");

    const errors = {
      totalAmount: amountValidation.message,
      paymentMethod: paymentMethod ? "" : "กรุณาเลือกวิธีชำระ",
    };

    const canSubmit = errors.totalAmount === "" && errors.paymentMethod === "";

    return {
      totalAmountRaw,
      totalAmountNormalized: amountValidation.normalized,
      paymentMethod,
      paymentNotes,
      errors,
      canSubmit,
    };
  }

  function renderValidation() {
    const state = collectState();
    totalAmountErrorEl.textContent = state.errors.totalAmount;
    paymentMethodErrorEl.textContent = state.errors.paymentMethod;
    nextButtonEl.disabled = !state.canSubmit || saving;
  }

  function setSavingState(isSaving) {
    saving = isSaving;
    nextButtonEl.textContent = isSaving ? "กำลังบันทึก..." : "ถัดไป";
    renderValidation();
  }

  formEl.addEventListener("input", renderValidation);
  formEl.addEventListener("change", renderValidation);

  backButtonEl.addEventListener("click", () => {
    if (typeof onBack === "function") {
      onBack();
    }
  });

  formEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    renderValidation();

    const state = collectState();
    if (!state.canSubmit || saving) {
      return;
    }

    hideAllBanners();
    setSavingState(true);

    const payload = {
      lineUserId: lineUserId,
      section: 3,
      data: {
        totalAmount: state.totalAmountNormalized,
        paymentMethod: state.paymentMethod,
        paymentNotes: state.paymentNotes,
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

  renderValidation();
}
