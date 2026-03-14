const adminState = {
  authRequired: false,
  authWarning: "",
  token: getStoredAdminToken(),
  analytics: null
};

const authPanel = document.querySelector("#auth-panel");
const authCopy = document.querySelector("#auth-copy");
const authForm = document.querySelector("#auth-form");
const tokenInput = document.querySelector("#admin-token");
const filtersForm = document.querySelector("#filters-form");
const fromDateInput = document.querySelector("#from-date");
const toDateInput = document.querySelector("#to-date");
const hourStartInput = document.querySelector("#hour-start");
const hourEndInput = document.querySelector("#hour-end");
const dashboardStatus = document.querySelector("#dashboard-status");
const timezoneNote = document.querySelector("#timezone-note");
const summaryGrid = document.querySelector("#summary-grid");
const highlightsList = document.querySelector("#highlights-list");
const resultMix = document.querySelector("#result-mix");
const usageByDay = document.querySelector("#usage-by-day");
const usageByHour = document.querySelector("#usage-by-hour");
const recentCompletions = document.querySelector("#recent-completions");

function populateHourSelects() {
  const options = Array.from({ length: 24 }, (_, index) => {
    const label = `${String(index).padStart(2, "0")}:00`;
    return `<option value="${index}">${label}</option>`;
  }).join("");

  hourStartInput.innerHTML = options;
  hourEndInput.innerHTML = options;
  hourStartInput.value = "0";
  hourEndInput.value = "23";
}

function setDefaultDates() {
  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - 29);
  fromDateInput.value = formatDateInputValue(fromDate);
  toDateInput.value = formatDateInputValue(today);
}

function formatDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getStoredAdminToken() {
  try {
    return window.sessionStorage.getItem("hannahOrMileyAdminToken") || "";
  } catch (error) {
    return "";
  }
}

function storeAdminToken(token) {
  try {
    if (token) {
      window.sessionStorage.setItem("hannahOrMileyAdminToken", token);
    } else {
      window.sessionStorage.removeItem("hannahOrMileyAdminToken");
    }
  } catch (error) {
    // Ignore storage failures.
  }
}

function setStatus(message, kind = "info") {
  dashboardStatus.textContent = message;
  dashboardStatus.className = `dashboard-status ${kind === "error" ? "is-error" : kind === "success" ? "is-success" : ""}`.trim();
}

async function loadAdminConfig() {
  const response = await fetch("./api/admin/config");
  const payload = await response.json();

  adminState.authRequired = payload.authRequired === true;
  adminState.authWarning = payload.warning || "";
  authPanel.hidden = !adminState.authRequired && !adminState.authWarning;
  authCopy.textContent = adminState.authRequired
    ? "Enter the admin access token for this deployment."
    : payload.warning || "Analytics are unlocked on this deployment.";

  if (!adminState.authRequired) {
    tokenInput.value = "";
  }
}

async function loadAnalytics() {
  const params = new URLSearchParams({
    fromDate: fromDateInput.value,
    toDate: toDateInput.value,
    hourStart: hourStartInput.value,
    hourEnd: hourEndInput.value,
    tzOffsetMinutes: String(new Date().getTimezoneOffset())
  });

  setStatus("Loading analytics...");

  const response = await fetch(`./api/admin/analytics?${params.toString()}`, {
    headers: adminState.token
      ? {
          "x-admin-token": adminState.token
        }
      : {}
  });
  const payload = await response.json().catch(() => ({}));

  if (response.status === 401) {
    throw new Error("Admin access token required.");
  }

  if (!response.ok) {
    throw new Error(payload.error || "Unable to load analytics.");
  }

  adminState.analytics = payload;
  renderDashboard(payload);
  setStatus(`Analytics updated. ${payload.eventCount} events matched the current filters.`, "success");
}

function renderDashboard(data) {
  timezoneNote.textContent =
    "Date and hour filters use this browser's timezone, applied to server timestamps.";
  renderSummaryCards(data.totals);
  renderHighlights(data.highlights, data.totals);
  renderResultMix(data.resultCounts, data.totals.completions);
  renderUsageBars(usageByDay, data.usageByDay, "day");
  renderUsageBars(usageByHour, data.usageByHour, "hour");
  renderRecentCompletions(data.recentCompletions);
}

function renderSummaryCards(totals) {
  const cards = [
    { label: "Page loads", value: formatNumber(totals.pageLoads) },
    { label: "Quiz starts", value: formatNumber(totals.starts) },
    { label: "Completions", value: formatNumber(totals.completions), meta: `${formatPercent(totals.completionRate)} completion rate` },
    { label: "Downloads", value: formatNumber(totals.downloads), meta: `${formatPercent(totals.downloadRate)} of completions` },
    { label: "Texts sent", value: formatNumber(totals.textsSent), meta: `${formatPercent(totals.textRate)} of completions` },
    { label: "Restarts", value: formatNumber(totals.restarts) },
    { label: "Avg finish", value: formatDuration(totals.averageCompletionSeconds) }
  ];

  summaryGrid.innerHTML = cards
    .map(
      (card) => `
        <article class="summary-card">
          <span class="summary-label">${card.label}</span>
          <span class="summary-value">${card.value}</span>
          ${card.meta ? `<div class="summary-meta">${card.meta}</div>` : ""}
        </article>
      `
    )
    .join("");
}

function renderHighlights(highlights, totals) {
  const items = [
    {
      label: "Peak day",
      value: highlights.peakDay ? `${highlights.peakDay.label}` : "No data",
      meta: highlights.peakDay ? `${highlights.peakDay.completions} completions` : "No completions in range"
    },
    {
      label: "Peak hour",
      value: highlights.peakHour ? `${highlights.peakHour.label}` : "No data",
      meta: highlights.peakHour ? `${highlights.peakHour.completions} completions` : "No completions in range"
    },
    {
      label: "Text adoption",
      value: formatPercent(totals.textRate),
      meta: `${formatNumber(totals.textsSent)} guests texted a result card`
    },
    {
      label: "Download adoption",
      value: formatPercent(totals.downloadRate),
      meta: `${formatNumber(totals.downloads)} guests saved a result card`
    }
  ];

  highlightsList.innerHTML = items
    .map(
      (item) => `
        <div class="highlight-item">
          <div class="highlight-label">${item.label}</div>
          <div class="highlight-value">${item.value}</div>
          <div class="bar-meta">${item.meta}</div>
        </div>
      `
    )
    .join("");
}

function renderResultMix(counts, completions) {
  const items = [
    { key: "MILEY", label: "Miley Stewart", value: counts.MILEY || 0 },
    { key: "HANNAH", label: "Hannah Montana", value: counts.HANNAH || 0 },
    { key: "BOTH", label: "Best of Both Worlds", value: counts.BOTH || 0 }
  ];
  const maxValue = Math.max(1, ...items.map((item) => item.value));

  resultMix.innerHTML =
    items
      .map((item) => {
        const width = (item.value / maxValue) * 100;
        const percent = completions > 0 ? item.value / completions : 0;

        return `
          <div class="result-item">
            <div class="bar-head">
              <div>
                <div class="result-label">${item.label}</div>
                <div class="result-value">${formatNumber(item.value)}</div>
              </div>
              <div class="bar-label">${formatPercent(percent)}</div>
            </div>
            <div class="result-track">
              <div class="result-fill" style="width: ${width}%"></div>
            </div>
          </div>
        `;
      })
      .join("") || `<div class="empty-state">No completions yet for the selected window.</div>`;
}

function renderUsageBars(container, items, mode) {
  const relevantMetric = "completions";
  const maxValue = Math.max(1, ...items.map((item) => item[relevantMetric] || 0));

  container.innerHTML = items
    .map((item) => {
      const width = ((item[relevantMetric] || 0) / maxValue) * 100;
      const label = mode === "hour" ? `${item.label}:00` : item.label;

      return `
        <div class="bar-item">
          <div class="bar-head">
            <span class="bar-label">${label}</span>
            <strong>${formatNumber(item.completions)} completions</strong>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width: ${width}%"></div>
          </div>
          <div class="bar-meta">
            Starts ${formatNumber(item.starts)} • Downloads ${formatNumber(item.downloads)} • Texts ${formatNumber(item.textsSent)}
          </div>
        </div>
      `;
    })
    .join("");
}

function renderRecentCompletions(items) {
  if (!items.length) {
    recentCompletions.innerHTML = `
      <tr>
        <td colspan="3"><div class="empty-state">No quiz completions in the selected window.</div></td>
      </tr>
    `;
    return;
  }

  recentCompletions.innerHTML = items
    .map(
      (item) => `
        <tr>
          <td>${formatTimestamp(item.timestamp)}</td>
          <td>${formatResultLabel(item.resultKey)}</td>
          <td>${formatDuration(item.durationSeconds)}</td>
        </tr>
      `
    )
    .join("");
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(value || 0);
}

function formatPercent(value) {
  return `${Math.round((value || 0) * 100)}%`;
}

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) {
    return "—";
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${String(remainder).padStart(2, "0")}s`;
}

function formatTimestamp(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatResultLabel(resultKey) {
  if (resultKey === "MILEY") {
    return "Miley Stewart";
  }

  if (resultKey === "HANNAH") {
    return "Hannah Montana";
  }

  if (resultKey === "BOTH") {
    return "Best of Both Worlds";
  }

  return resultKey || "—";
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  adminState.token = tokenInput.value.trim();
  storeAdminToken(adminState.token);

  try {
    await loadAnalytics();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Unable to unlock analytics.", "error");
  }
});

filtersForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    await loadAnalytics();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Unable to refresh analytics.", "error");
  }
});

async function initializeAdmin() {
  populateHourSelects();
  setDefaultDates();

  try {
    await loadAdminConfig();
  } catch (error) {
    setStatus("Unable to load admin configuration.", "error");
    return;
  }

  if (adminState.authRequired && adminState.token) {
    tokenInput.value = adminState.token;
  }

  if (!adminState.authRequired || adminState.token) {
    try {
      await loadAnalytics();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to load analytics.", "error");
    }
  } else {
    setStatus("Admin token required to view analytics.");
  }

  if (!adminState.authRequired && adminState.authWarning) {
    setStatus(adminState.authWarning);
  }
}

initializeAdmin();
