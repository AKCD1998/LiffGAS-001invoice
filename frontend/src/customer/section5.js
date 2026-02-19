import { getErrorDisplayText, saveSection } from "../api.js";

function textValue(form, fieldId) {
  const input = form.querySelector(`[name="${fieldId}"]`);
  return input ? String(input.value || "").trim() : "";
}

export function renderCustomerSection5(options) {
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
      <h1 class="title">ข้อมูลติดต่อ (ส่วนที่ 5)</h1>
      <p class="subtitle">ระบุช่องทางติดต่ออย่างน้อย 1 ช่องทาง</p>

      <div id="section5-warning" class="banner banner-warning hidden"></div>
      <div id="section5-success" class="banner banner-success hidden"></div>
      <div id="section5-complete" class="banner banner-complete hidden"></div>
      <div id="section5-error" class="banner banner-error hidden"></div>

      <form id="section5-form" class="form-grid" novalidate>
        <label class="field-label" for="contactLineId">ไลน์ ID</label>
        <input id="contactLineId" name="contactLineId" type="text" class="input" />

        <label class="field-label" for="contactPhone">เบอร์โทรศัพท์</label>
        <input id="contactPhone" name="contactPhone" type="tel" class="input" />

        <p id="contactError" class="input-hint input-hint-error"></p>

        <div class="message-box">
          หากกรอกเรียบร้อยแล้ว รบกวนแจ้งกลับสักนิดนะคะ ขอบคุณค่ะ
        </div>

        <div class="button-row">
          <button type="button" id="backButton" class="btn btn-ghost">ย้อนกลับ</button>
          <button type="submit" id="saveFinishButton" class="btn btn-primary" disabled>บันทึกและจบ</button>
        </div>
      </form>

      <p class="meta">lineUserId: ${lineUserId || "-"}</p>
      <p class="meta">lastSaved: ${lastSaved?.updatedAt || "-"}</p>
    </main>
  `;

  const formEl = rootEl.querySelector("#section5-form");
  const nextButtonEl = rootEl.querySelector("#saveFinishButton");
  const backButtonEl = rootEl.querySelector("#backButton");
  const warningEl = rootEl.querySelector("#section5-warning");
  const successEl = rootEl.querySelector("#section5-success");
  const completeEl = rootEl.querySelector("#section5-complete");
  const errorEl = rootEl.querySelector("#section5-error");
  const contactErrorEl = rootEl.querySelector("#contactError");
  const contactLineIdEl = rootEl.querySelector('[name="contactLineId"]');
  const contactPhoneEl = rootEl.querySelector('[name="contactPhone"]');

  contactLineIdEl.value = String(initialData.contactLineId || "");
  contactPhoneEl.value = String(initialData.contactPhone || "");

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
    showBanner(completeEl, "");
    showBanner(errorEl, "");
  }

  function collectState() {
    const contactLineId = textValue(formEl, "contactLineId");
    const contactPhone = textValue(formEl, "contactPhone");
    const hasAnyContact = contactLineId !== "" || contactPhone !== "";
    return {
      contactLineId,
      contactPhone,
      canSubmit: hasAnyContact,
      error: hasAnyContact
        ? ""
        : "กรุณาระบุช่องทางติดต่ออย่างน้อย 1 อย่าง",
    };
  }

  function renderValidation() {
    const state = collectState();
    contactErrorEl.textContent = state.error;
    nextButtonEl.disabled = !state.canSubmit || saving;
  }

  function setSavingState(isSaving) {
    saving = isSaving;
    nextButtonEl.textContent = isSaving ? "กำลังบันทึก..." : "บันทึกและจบ";
    renderValidation();
  }

  formEl.addEventListener("input", renderValidation);

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
      section: 5,
      data: {
        contactLineId: state.contactLineId,
        contactPhone: state.contactPhone,
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

      const isReady =
        progressPercent === 100 ||
        String(result?.status || "").trim().toLowerCase() === "ready" ||
        String(result?.changed?.status || "").trim().toLowerCase() === "ready";
      if (isReady) {
        showBanner(completeEl, "ข้อมูลครบแล้ว ✅ ทีมงานจะติดต่อกลับ");
      }

      if (typeof onSaved === "function") {
        setTimeout(() => onSaved(result, payload.data), 650);
      }
    } catch (error) {
      showBanner(errorEl, `บันทึกไม่สำเร็จ: ${getErrorDisplayText(error, true)}`);
    } finally {
      setSavingState(false);
    }
  });

  renderValidation();
}
