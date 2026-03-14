const crypto = require("node:crypto");
const http = require("node:http");
const fs = require("node:fs");
const fsPromises = require("node:fs/promises");
const path = require("node:path");

const ROOT_DIR = __dirname;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT_DIR, "data"));
const ANALYTICS_FILE = path.join(DATA_DIR, "analytics-events.jsonl");
const RESULT_ASSETS = {
  MILEY: {
    mediaPath: "assets/results/miley-stewart-share.jpg",
    body: "Thanks for taking the Hannah or Miley quiz. Your result: You're Miley Stewart."
  },
  HANNAH: {
    mediaPath: "assets/results/hannah-montana-share.jpg",
    body: "Thanks for taking the Hannah or Miley quiz. Your result: You're Hannah Montana."
  },
  BOTH: {
    mediaPath: "assets/results/best-of-both-worlds-share.jpg",
    body: "Thanks for taking the Hannah or Miley quiz. Your result: Best of Both Worlds."
  }
};
const CLIENT_EVENT_TYPES = new Set([
  "app_loaded",
  "quiz_started",
  "quiz_completed",
  "quiz_restarted",
  "result_downloaded"
]);
const ALL_EVENT_TYPES = new Set([...CLIENT_EVENT_TYPES, "result_text_sent"]);
const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"]
]);
const rateLimitState = new Map();

loadDotEnv(path.join(ROOT_DIR, ".env"));

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (requestUrl.pathname === "/api/config" && req.method === "GET") {
      return sendJson(res, 200, buildQuizRuntimeConfig(req));
    }

    if (requestUrl.pathname === "/api/healthz" && req.method === "GET") {
      return sendJson(res, 200, {
        ok: true,
        dataDir: DATA_DIR
      });
    }

    if (requestUrl.pathname === "/api/events" && req.method === "POST") {
      return handleAnalyticsEvent(req, res);
    }

    if (requestUrl.pathname === "/api/send-result" && req.method === "POST") {
      return handleSendResult(req, res);
    }

    if (requestUrl.pathname === "/api/admin/config" && req.method === "GET") {
      return sendJson(res, 200, buildAdminRuntimeConfig());
    }

    if (requestUrl.pathname === "/api/admin/analytics" && req.method === "GET") {
      return handleAdminAnalytics(req, res, requestUrl);
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      return sendJson(res, 405, { error: "Method not allowed." });
    }

    return serveStaticFile(requestUrl.pathname, res, req.method === "HEAD");
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: "Unexpected server error." });
  }
});

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";

server.listen(port, host, () => {
  console.log(`Hannah or Miley quiz running at http://${host}:${port}`);
});

async function handleAnalyticsEvent(req, res) {
  if (!hasAllowedOrigin(req)) {
    return sendJson(res, 403, { error: "Origin not allowed." });
  }

  let payload;

  try {
    payload = JSON.parse(await readRequestBody(req, 8_192));
  } catch (error) {
    return sendJson(res, 400, { error: "Invalid request body." });
  }

  const type = sanitizeEventType(payload.type);

  if (!CLIENT_EVENT_TYPES.has(type)) {
    return sendJson(res, 400, { error: "Unsupported analytics event type." });
  }

  const attemptId = sanitizeId(payload.attemptId);
  const sessionId = sanitizeId(payload.sessionId);
  const resultKey = sanitizeResultKey(payload.resultKey);
  const meta = sanitizeEventMeta(payload.meta);

  if (!sessionId) {
    return sendJson(res, 400, { error: "Missing session identifier." });
  }

  if ((type === "quiz_completed" || type === "result_downloaded") && !resultKey) {
    return sendJson(res, 400, { error: "Missing result key." });
  }

  await appendAnalyticsEvent({
    id: createId(),
    at: new Date().toISOString(),
    type,
    attemptId,
    sessionId,
    resultKey,
    meta
  });

  return sendJson(res, 200, { ok: true });
}

async function handleSendResult(req, res) {
  if (!hasAllowedOrigin(req)) {
    return sendJson(res, 403, { error: "Origin not allowed." });
  }

  const runtimeConfig = buildQuizRuntimeConfig(req);

  if (!runtimeConfig.smsEnabled) {
    return sendJson(res, 400, { error: runtimeConfig.smsReason });
  }

  const clientIp = getClientIp(req);

  if (!recordRateLimitAttempt(clientIp)) {
    return sendJson(res, 429, { error: "Too many text requests from this device. Try again in a few minutes." });
  }

  let payload;

  try {
    payload = JSON.parse(await readRequestBody(req, 8_192));
  } catch (error) {
    return sendJson(res, 400, { error: "Invalid request body." });
  }

  const resultKey = sanitizeResultKey(payload.resultKey);
  const phoneNumber = normalizePhoneNumber(payload.phoneNumber || "");
  const consent = payload.consent === true;
  const attemptId = sanitizeId(payload.attemptId);
  const sessionId = sanitizeId(payload.sessionId);
  const asset = RESULT_ASSETS[resultKey];

  if (!asset) {
    return sendJson(res, 400, { error: "Unknown quiz result." });
  }

  if (!phoneNumber) {
    return sendJson(res, 400, {
      error: "Enter a valid phone number. US numbers can be entered as 10 digits; international numbers should include + and country code."
    });
  }

  if (!consent) {
    return sendJson(res, 400, { error: "Guest consent is required before sending a text." });
  }

  const localAssetPath = path.join(ROOT_DIR, asset.mediaPath);

  try {
    await fsPromises.access(localAssetPath);
  } catch (error) {
    return sendJson(res, 500, { error: "The result JPEG is missing on the server." });
  }

  try {
    const publicBaseUrl = getPublicBaseUrl(req);
    const mediaUrl = new URL(asset.mediaPath, `${publicBaseUrl}/`).toString();
    const twilioPayload = new URLSearchParams({
      To: phoneNumber,
      Body: asset.body,
      MediaUrl: mediaUrl
    });

    if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
      twilioPayload.set("MessagingServiceSid", process.env.TWILIO_MESSAGING_SERVICE_SID);
    } else {
      twilioPayload.set("From", process.env.TWILIO_FROM_NUMBER);
    }

    const twilioResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
          ).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: twilioPayload
      }
    );
    const twilioJson = await twilioResponse.json().catch(() => ({}));

    if (!twilioResponse.ok) {
      const message = twilioJson.message || "Twilio rejected the MMS request.";
      return sendJson(res, 502, { error: message });
    }

    await appendAnalyticsEvent({
      id: createId(),
      at: new Date().toISOString(),
      type: "result_text_sent",
      attemptId,
      sessionId,
      resultKey,
      meta: {
        provider: "twilio"
      }
    });

    return sendJson(res, 200, {
      ok: true,
      sid: twilioJson.sid
    });
  } catch (error) {
    console.error(error);
    return sendJson(res, 502, { error: "Unable to reach Twilio right now." });
  }
}

async function handleAdminAnalytics(req, res, requestUrl) {
  if (!isAdminAuthorized(req)) {
    return sendJson(res, 401, { error: "Admin access token required." });
  }

  const events = await readAnalyticsEvents();
  const filters = normalizeAnalyticsFilters(requestUrl.searchParams);
  const analytics = buildAnalyticsSummary(events, filters);

  return sendJson(res, 200, analytics);
}

async function serveStaticFile(requestPath, res, isHeadRequest) {
  const relativePath = requestPath === "/" ? "index.html" : decodeURIComponent(requestPath.slice(1));
  const resolvedPath = path.resolve(ROOT_DIR, relativePath);

  if (resolvedPath !== ROOT_DIR && !resolvedPath.startsWith(`${ROOT_DIR}${path.sep}`)) {
    return sendJson(res, 403, { error: "Forbidden." });
  }

  try {
    const fileBuffer = await fsPromises.readFile(resolvedPath);
    const extension = path.extname(resolvedPath).toLowerCase();
    const contentType = MIME_TYPES.get(extension) || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": extension === ".jpg" || extension === ".jpeg" ? "public, max-age=300" : "no-cache"
    });

    if (!isHeadRequest) {
      res.end(fileBuffer);
      return;
    }

    res.end();
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return sendJson(res, 404, { error: "File not found." });
    }

    throw error;
  }
}

function buildQuizRuntimeConfig(req) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const hasSender = Boolean(process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM_NUMBER);
  const publicBaseUrl = getPublicBaseUrl(req);
  const missingParts = [];

  if (!accountSid) {
    missingParts.push("TWILIO_ACCOUNT_SID");
  }

  if (!authToken) {
    missingParts.push("TWILIO_AUTH_TOKEN");
  }

  if (!hasSender) {
    missingParts.push("TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER");
  }

  if (!publicBaseUrl) {
    missingParts.push("PUBLIC_BASE_URL or a public HTTPS host");
  }

  return {
    smsEnabled: missingParts.length === 0,
    smsReason:
      missingParts.length === 0
        ? ""
        : `Text delivery is unavailable until ${missingParts.join(", ")} ${missingParts.length === 1 ? "is" : "are"} set.`,
    consentLabel:
      process.env.SMS_CONSENT_LABEL ||
      "I confirm this guest asked to receive this result by text."
  };
}

function buildAdminRuntimeConfig() {
  const authRequired = Boolean(process.env.ADMIN_ACCESS_TOKEN);

  return {
    authRequired,
    warning: authRequired
      ? ""
      : "Admin analytics are currently unlocked because ADMIN_ACCESS_TOKEN is not set. Add one before going live."
  };
}

function getPublicBaseUrl(req) {
  const configuredBaseUrl = (process.env.PUBLIC_BASE_URL || "").trim();

  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, "");
  }

  const requestOrigin = getRequestOrigin(req);

  if (!requestOrigin) {
    return "";
  }

  const originUrl = new URL(requestOrigin);

  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(originUrl.hostname)) {
    return "";
  }

  return requestOrigin;
}

function getRequestOrigin(req) {
  const hostHeader = req.headers["x-forwarded-host"] || req.headers.host;
  const protocolHeader = req.headers["x-forwarded-proto"];

  if (!hostHeader) {
    return "";
  }

  const hostValue = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  const protocolValue = Array.isArray(protocolHeader) ? protocolHeader[0] : protocolHeader;
  const protocol =
    protocolValue ||
    (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(hostValue) ? "http" : "https");

  return `${protocol}://${hostValue}`.replace(/\/+$/, "");
}

function hasAllowedOrigin(req) {
  const originHeader = req.headers.origin;

  if (!originHeader) {
    return true;
  }

  const allowedOrigins = [getRequestOrigin(req), getPublicBaseUrl(req)]
    .filter(Boolean)
    .map((url) => new URL(url).origin);

  return allowedOrigins.includes(originHeader);
}

function isAdminAuthorized(req) {
  const expectedToken = String(process.env.ADMIN_ACCESS_TOKEN || "").trim();

  if (!expectedToken) {
    return true;
  }

  const headerToken =
    req.headers["x-admin-token"] ||
    (typeof req.headers.authorization === "string" && req.headers.authorization.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : "");
  const providedToken = String(Array.isArray(headerToken) ? headerToken[0] : headerToken || "").trim();

  if (!providedToken) {
    return false;
  }

  const expectedBuffer = Buffer.from(expectedToken);
  const providedBuffer = Buffer.from(providedToken);

  return (
    expectedBuffer.length === providedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

function normalizePhoneNumber(value) {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    return "";
  }

  if (rawValue.startsWith("+")) {
    const normalized = `+${rawValue.slice(1).replace(/\D/g, "")}`;
    return /^\+[1-9]\d{9,14}$/.test(normalized) ? normalized : "";
  }

  const digitsOnly = rawValue.replace(/\D/g, "");

  if (digitsOnly.length === 10) {
    return `+1${digitsOnly}`;
  }

  if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) {
    return `+${digitsOnly}`;
  }

  return "";
}

function recordRateLimitAttempt(clientIp) {
  const now = Date.now();
  const windowMs = Number(process.env.SMS_RATE_LIMIT_WINDOW_MS || 300000);
  const maxAttempts = Number(process.env.SMS_RATE_LIMIT_MAX || 8);
  const key = clientIp || "unknown";
  const recentAttempts = (rateLimitState.get(key) || []).filter((timestamp) => now - timestamp < windowMs);

  if (recentAttempts.length >= maxAttempts) {
    rateLimitState.set(key, recentAttempts);
    return false;
  }

  recentAttempts.push(now);
  rateLimitState.set(key, recentAttempts);
  return true;
}

function getClientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string") {
    return forwardedFor.split(",")[0].trim();
  }

  return req.socket.remoteAddress || "";
}

async function appendAnalyticsEvent(event) {
  if (!ALL_EVENT_TYPES.has(event.type)) {
    return;
  }

  await fsPromises.mkdir(DATA_DIR, { recursive: true });
  await fsPromises.appendFile(ANALYTICS_FILE, `${JSON.stringify(event)}\n`, "utf8");
}

async function readAnalyticsEvents() {
  try {
    const fileContents = await fsPromises.readFile(ANALYTICS_FILE, "utf8");

    return fileContents
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          return null;
        }
      })
      .filter(Boolean)
      .filter((event) => ALL_EVENT_TYPES.has(event.type));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function normalizeAnalyticsFilters(searchParams) {
  const tzOffsetMinutes = clampNumber(Number(searchParams.get("tzOffsetMinutes")), -840, 840, 0);
  const nowLocal = toOffsetDate(Date.now(), tzOffsetMinutes);
  const defaultToDate = formatOffsetDateKey(nowLocal);
  const defaultFromDate = formatOffsetDateKey(new Date(nowLocal.getTime() - 29 * 24 * 60 * 60 * 1000));
  const fromDate = sanitizeDateKey(searchParams.get("fromDate")) || defaultFromDate;
  const toDate = sanitizeDateKey(searchParams.get("toDate")) || defaultToDate;
  const hourStart = clampNumber(Number(searchParams.get("hourStart")), 0, 23, 0);
  const hourEnd = clampNumber(Number(searchParams.get("hourEnd")), 0, 23, 23);

  return {
    tzOffsetMinutes,
    fromDate: fromDate <= toDate ? fromDate : toDate,
    toDate: toDate >= fromDate ? toDate : fromDate,
    hourStart,
    hourEnd
  };
}

function buildAnalyticsSummary(events, filters) {
  const startByAttempt = new Map();
  const filteredEvents = events.filter((event) => matchesAnalyticsFilters(event, filters));

  for (const event of events) {
    if (event.type === "quiz_started" && event.attemptId && !startByAttempt.has(event.attemptId)) {
      startByAttempt.set(event.attemptId, Date.parse(event.at));
    }
  }

  const totals = {
    pageLoads: 0,
    starts: 0,
    completions: 0,
    restarts: 0,
    downloads: 0,
    textsSent: 0,
    completionRate: 0,
    downloadRate: 0,
    textRate: 0,
    averageCompletionSeconds: 0
  };
  const resultCounts = {
    MILEY: 0,
    HANNAH: 0,
    BOTH: 0
  };
  const usageByDay = new Map();
  const usageByHour = new Map();
  const completionDurations = [];
  const recentCompletions = [];

  for (let hour = 0; hour < 24; hour += 1) {
    usageByHour.set(hour, createUsageBucket(String(hour).padStart(2, "0")));
  }

  for (const event of filteredEvents) {
    const localDate = toOffsetDate(Date.parse(event.at), filters.tzOffsetMinutes);
    const dateKey = formatOffsetDateKey(localDate);
    const hour = localDate.getUTCHours();
    const dayBucket = usageByDay.get(dateKey) || createUsageBucket(dateKey);
    const hourBucket = usageByHour.get(hour) || createUsageBucket(String(hour).padStart(2, "0"));

    if (event.type === "app_loaded") {
      totals.pageLoads += 1;
      dayBucket.pageLoads += 1;
      hourBucket.pageLoads += 1;
    }

    if (event.type === "quiz_started") {
      totals.starts += 1;
      dayBucket.starts += 1;
      hourBucket.starts += 1;
    }

    if (event.type === "quiz_completed") {
      totals.completions += 1;
      dayBucket.completions += 1;
      hourBucket.completions += 1;

      if (resultCounts[event.resultKey] !== undefined) {
        resultCounts[event.resultKey] += 1;
      }

      const startedAt = event.attemptId ? startByAttempt.get(event.attemptId) : null;

      if (startedAt) {
        const durationSeconds = Math.max(0, Math.round((Date.parse(event.at) - startedAt) / 1000));
        completionDurations.push(durationSeconds);
      }

      recentCompletions.push({
        timestamp: event.at,
        localDate: dateKey,
        localHour: String(hour).padStart(2, "0"),
        resultKey: event.resultKey || "",
        durationSeconds: startedAt
          ? Math.max(0, Math.round((Date.parse(event.at) - startedAt) / 1000))
          : null
      });
    }

    if (event.type === "quiz_restarted") {
      totals.restarts += 1;
      dayBucket.restarts += 1;
      hourBucket.restarts += 1;
    }

    if (event.type === "result_downloaded") {
      totals.downloads += 1;
      dayBucket.downloads += 1;
      hourBucket.downloads += 1;
    }

    if (event.type === "result_text_sent") {
      totals.textsSent += 1;
      dayBucket.textsSent += 1;
      hourBucket.textsSent += 1;
    }

    usageByDay.set(dateKey, dayBucket);
    usageByHour.set(hour, hourBucket);
  }

  totals.completionRate = totals.starts > 0 ? totals.completions / totals.starts : 0;
  totals.downloadRate = totals.completions > 0 ? totals.downloads / totals.completions : 0;
  totals.textRate = totals.completions > 0 ? totals.textsSent / totals.completions : 0;
  totals.averageCompletionSeconds =
    completionDurations.length > 0
      ? Math.round(completionDurations.reduce((sum, value) => sum + value, 0) / completionDurations.length)
      : 0;

  const usageByDayList = [...usageByDay.values()].sort((left, right) => left.label.localeCompare(right.label));
  const usageByHourList = [...usageByHour.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, bucket]) => bucket);
  const peakDay = usageByDayList.reduce(
    (best, bucket) => (bucket.completions > (best?.completions || 0) ? bucket : best),
    null
  );
  const peakHour = usageByHourList.reduce(
    (best, bucket) => (bucket.completions > (best?.completions || 0) ? bucket : best),
    null
  );

  recentCompletions.sort((left, right) => right.timestamp.localeCompare(left.timestamp));

  return {
    filters,
    totals,
    resultCounts,
    usageByDay: usageByDayList,
    usageByHour: usageByHourList,
    recentCompletions: recentCompletions.slice(0, 20),
    highlights: {
      peakDay: peakDay ? { label: peakDay.label, completions: peakDay.completions } : null,
      peakHour: peakHour ? { label: `${peakHour.label}:00`, completions: peakHour.completions } : null
    },
    eventCount: filteredEvents.length
  };
}

function matchesAnalyticsFilters(event, filters) {
  const timestamp = Date.parse(event.at);

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const localDate = toOffsetDate(timestamp, filters.tzOffsetMinutes);
  const dateKey = formatOffsetDateKey(localDate);
  const hour = localDate.getUTCHours();

  if (dateKey < filters.fromDate || dateKey > filters.toDate) {
    return false;
  }

  if (filters.hourStart <= filters.hourEnd) {
    return hour >= filters.hourStart && hour <= filters.hourEnd;
  }

  return hour >= filters.hourStart || hour <= filters.hourEnd;
}

function createUsageBucket(label) {
  return {
    label,
    pageLoads: 0,
    starts: 0,
    completions: 0,
    restarts: 0,
    downloads: 0,
    textsSent: 0
  };
}

function toOffsetDate(timestamp, tzOffsetMinutes) {
  return new Date(timestamp - tzOffsetMinutes * 60 * 1000);
}

function formatOffsetDateKey(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sanitizeEventType(value) {
  return String(value || "").trim();
}

function sanitizeId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
}

function sanitizeResultKey(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return RESULT_ASSETS[normalized] ? normalized : "";
}

function sanitizeEventMeta(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return {};
  }

  const nextMeta = {};

  if (meta.answerCounts && typeof meta.answerCounts === "object" && !Array.isArray(meta.answerCounts)) {
    nextMeta.answerCounts = {
      A: clampNumber(Number(meta.answerCounts.A), 0, 100, 0),
      B: clampNumber(Number(meta.answerCounts.B), 0, 100, 0)
    };
  }

  if (typeof meta.provider === "string") {
    nextMeta.provider = meta.provider.slice(0, 40);
  }

  return nextMeta;
}

function sanitizeDateKey(value) {
  const nextValue = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/u.test(nextValue) ? nextValue : "";
}

function clampNumber(value, minimum, maximum, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

function createId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readRequestBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;

      if (body.length > maxBytes) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function loadDotEnv(envFilePath) {
  try {
    const envFile = fs.readFileSync(envFilePath, "utf8");
    const lines = envFile.split(/\r?\n/u);

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmedLine.indexOf("=");

      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmedLine.slice(0, separatorIndex).trim();
      let value = trimmedLine.slice(separatorIndex + 1).trim();

      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (!error || error.code !== "ENOENT") {
      console.error("Unable to load .env file:", error);
    }
  }
}
