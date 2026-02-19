import { adminListRequests, getErrorDisplayText } from "../api.js";

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
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 0;
  }
  if (n < 0) {
    return 0;
  }
  if (n > 100) {
    return 100;
  }
  return Math.round(n);
}

function statusClass(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "ready") {
    return "status status-ready";
  }
  return "status status-draft";
}

function normalizeTel(value) {
  return String(value || "").replace(/[^\d+]/g, "");
}

function renderRows(items) {
  if (!items || items.length === 0) {
    return `
      <tr>
        <td colspan="7" class="empty-cell">ไม่พบข้อมูล</td>
      </tr>
    `;
  }

  return items
    .map((item) => {
      const progress = normalizePercent(item.progress_percent);
      const status = String(item.status || "").trim() || "draft";
      const contactCandidate = item.officePhone || item.contactPhone || "";
      const telHref = normalizeTel(contactCandidate);
      const contactHtml = telHref
        ? `<a href="tel:${escapeHtml(telHref)}">${displayText(contactCandidate)}</a>`
        : "-";

      return `
        <tr>
          <td>${displayText(item.updatedAt)}</td>
          <td>${displayText(item.officeName)}</td>
          <td>
            <div class="progress-wrap">
              <div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div>
              <span class="progress-text">${progress}%</span>
            </div>
          </td>
          <td><span class="${statusClass(status)}">${displayText(status, "draft")}</span></td>
          <td>${displayText(item.docSummary)}</td>
          <td>${contactHtml}</td>
          <td>
            <button class="btn btn-ghost btn-sm" data-request-id="${escapeHtml(
              item.requestId || "",
            )}">ดูรายละเอียด</button>
          </td>
        </tr>
      `;
    })
    .join("");
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

function filterItems(items, term) {
  const query = String(term || "").trim().toLowerCase();
  if (!query) {
    return items.slice();
  }

  return items.filter((item) => {
    const officeName = String(item.officeName || "").toLowerCase();
    const officePhone = String(item.officePhone || "").toLowerCase();
    const contactPhone = String(item.contactPhone || "").toLowerCase();
    return (
      officeName.includes(query) ||
      officePhone.includes(query) ||
      contactPhone.includes(query)
    );
  });
}

export function renderAdminDashboard(options) {
  const rootEl = options.rootEl;
  const lineUserId = String(options.lineUserId || "").trim();
  const adminAuth = options.adminAuth || null;
  const adminToken = String(options.adminToken || "").trim();
  const onLogout = options.onLogout;
  const onBack = options.onBack;
  const onOpenDetail = options.onOpenDetail;

  rootEl.innerHTML = `
    <main class="card admin-dashboard">
      <h1 class="title">แดชบอร์ดผู้ดูแลระบบ</h1>
      <p class="subtitle">รายการคำขอเอกสารจากลูกค้า</p>

      <div id="adminDashboardBanner" class="banner hidden"></div>

      <div class="admin-toolbar">
        <input id="adminSearchInput" class="input" type="search" placeholder="ค้นหา ชื่อสำนักงาน / เบอร์โทร" />
        <div class="admin-toolbar-actions">
          <button id="adminRefreshButton" class="btn btn-secondary btn-sm">รีเฟรช</button>
          <button id="adminLogoutButton" class="btn btn-ghost btn-sm">ออกจากระบบ</button>
        </div>
      </div>

      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>UpdatedAt</th>
              <th>OfficeName</th>
              <th>Progress</th>
              <th>Status</th>
              <th>DocSummary</th>
              <th>Contact</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="adminTableBody">
            <tr><td colspan="7" class="empty-cell">กำลังโหลดข้อมูล...</td></tr>
          </tbody>
        </table>
      </div>

      <div class="button-row admin-bottom-actions">
        <button id="adminBackButton" class="btn btn-ghost">กลับหน้าเข้าสู่ระบบ</button>
      </div>

      <p class="meta">lineUserId: ${displayText(lineUserId)}</p>
      <p class="meta">admin: ${displayText(adminAuth?.email || "")}</p>
    </main>
  `;

  const bannerEl = rootEl.querySelector("#adminDashboardBanner");
  const tableBodyEl = rootEl.querySelector("#adminTableBody");
  const searchInputEl = rootEl.querySelector("#adminSearchInput");
  const refreshButtonEl = rootEl.querySelector("#adminRefreshButton");
  const logoutButtonEl = rootEl.querySelector("#adminLogoutButton");
  const backButtonEl = rootEl.querySelector("#adminBackButton");

  const state = {
    loading: false,
    items: [],
    filtered: [],
  };

  function renderTable() {
    tableBodyEl.innerHTML = renderRows(state.filtered);
    tableBodyEl.querySelectorAll("[data-request-id]").forEach((button) => {
      button.addEventListener("click", (event) => {
        const requestId = String(event.currentTarget.dataset.requestId || "").trim();
        if (!requestId) {
          return;
        }
        if (typeof onOpenDetail === "function") {
          onOpenDetail(requestId);
        }
      });
    });
  }

  function applyFilter() {
    state.filtered = filterItems(state.items, searchInputEl.value);
    renderTable();
  }

  async function loadList() {
    if (state.loading) {
      return;
    }
    state.loading = true;
    setBanner(bannerEl, "กำลังโหลดข้อมูล...", "warning");
    refreshButtonEl.disabled = true;

    try {
      const response = await adminListRequests({
        lineUserId: lineUserId,
        googleIdToken: adminToken,
        limit: 50,
        cursor: null,
      });

      state.items = Array.isArray(response?.items) ? response.items : [];
      applyFilter();
      setBanner(bannerEl, "", "warning");
    } catch (error) {
      const message = getErrorDisplayText(error, true);
      setBanner(bannerEl, message, "error");
      state.items = [];
      applyFilter();
    } finally {
      state.loading = false;
      refreshButtonEl.disabled = false;
    }
  }

  if (!adminAuth || !adminAuth.isAdmin) {
    setBanner(bannerEl, "กรุณาเข้าสู่ระบบผู้ดูแลก่อน", "error");
    tableBodyEl.innerHTML = `<tr><td colspan="7" class="empty-cell">ไม่มีสิทธิ์เข้าถึง</td></tr>`;
  } else if (!adminToken) {
    setBanner(bannerEl, "กรุณาเข้าสู่ระบบใหม่", "error");
    tableBodyEl.innerHTML = `<tr><td colspan="7" class="empty-cell">ไม่พบโทเค็นการยืนยันตัวตน</td></tr>`;
  } else {
    loadList();
  }

  searchInputEl.addEventListener("input", applyFilter);

  refreshButtonEl.addEventListener("click", () => {
    loadList();
  });

  logoutButtonEl.addEventListener("click", () => {
    if (typeof onLogout === "function") {
      onLogout();
    }
  });

  backButtonEl.addEventListener("click", () => {
    if (typeof onBack === "function") {
      onBack();
    }
  });
}
