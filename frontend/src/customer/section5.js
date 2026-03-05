import { getErrorDisplayText, saveSection } from "../api.js";
import { ensureLoadingOverlay, hideLoading, showLoading } from "./uiLoading.js";

export function renderCustomerSection5(options) {
  const rootEl = options.rootEl;
  const lineUserId = options.lineUserId || "";
  const onBack = options.onBack;
  const onSaved = options.onSaved;
  const lastSaved = options.lastSaved || null;

  rootEl.innerHTML = `
    <main class="card">
      <h1 class="title">ยืนยันข้อมูล (ส่วนที่ 5)</h1>
      <p class="subtitle">ตรวจสอบความพร้อมก่อนบันทึกและจบ</p>

      <div id="section5-warning" class="banner banner-warning hidden"></div>
      <div id="section5-success" class="banner banner-success hidden"></div>
      <div id="section5-complete" class="banner banner-complete hidden"></div>
      <div id="section5-error" class="banner banner-error hidden"></div>

      <form id="section5-form" class="form-grid" novalidate>
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
  ensureLoadingOverlay(rootEl);

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

  function renderValidation() {
    nextButtonEl.disabled = saving;
  }

  function setSavingState(isSaving) {
    saving = isSaving;
    nextButtonEl.textContent = isSaving ? "กำลังบันทึก..." : "บันทึกและจบ";
    if (isSaving) {
      showLoading(rootEl, "กำลังบันทึก...");
    } else {
      hideLoading(rootEl);
    }
    renderValidation();
  }

  backButtonEl.addEventListener("click", () => {
    if (typeof onBack === "function") {
      onBack();
    }
  });

  formEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    renderValidation();
    if (saving) {
      return;
    }

    hideAllBanners();
    setSavingState(true);

    const payload = {
      lineUserId: lineUserId,
      section: 5,
      data: {},
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
