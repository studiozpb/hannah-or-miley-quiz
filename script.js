const quizQuestions = [
  {
    prompt: "When you walk into a room, you…",
    accent: "First impression energy",
    artSlot: "Question 1 graphic",
    imageSrc: "",
    options: [
      { key: "A", label: "Option A", text: "Look for someone you know" },
      { key: "B", label: "Option B", text: "Low-key hope everyone notices you" }
    ]
  },
  {
    prompt: "Your ideal Friday night is…",
    accent: "Weekend mode",
    artSlot: "Question 2 graphic",
    imageSrc: "",
    options: [
      { key: "A", label: "Option A", text: "Cozy, chill, and with your favorite people" },
      { key: "B", label: "Option B", text: "Loud, fun, and a little chaotic" }
    ]
  },
  {
    prompt: "If someone handed you a microphone…",
    accent: "Main stage check",
    artSlot: "Question 3 graphic",
    imageSrc: "",
    options: [
      { key: "A", label: "Option A", text: "Panic internally" },
      { key: "B", label: "Option B", text: "Immediately start performing" }
    ]
  },
  {
    prompt: "Your style leans more…",
    accent: "Closet confession",
    artSlot: "Question 4 graphic",
    imageSrc: "",
    options: [
      { key: "A", label: "Option A", text: "Effortless and comfortable" },
      { key: "B", label: "Option B", text: "Bold and attention-grabbing" }
    ]
  },
  {
    prompt: "Your friends would describe you as…",
    accent: "Squad report",
    artSlot: "Question 5 graphic",
    imageSrc: "",
    options: [
      { key: "A", label: "Option A", text: "Loyal and grounded" },
      { key: "B", label: "Option B", text: "Confident and magnetic" }
    ]
  },
  {
    prompt: "When drama happens, you…",
    accent: "Conflict mode",
    artSlot: "Question 6 graphic",
    imageSrc: "",
    options: [
      { key: "A", label: "Option A", text: "Want to talk it through privately" },
      { key: "B", label: "Option B", text: "Feel like this could become a whole episode" }
    ]
  },
  {
    prompt: "You care more about being…",
    accent: "Core value",
    artSlot: "Question 7 graphic",
    imageSrc: "",
    options: [
      { key: "A", label: "Option A", text: "Understood" },
      { key: "B", label: "Option B", text: "Remembered" }
    ]
  },
  {
    prompt: "Your dream life includes…",
    accent: "Big picture",
    artSlot: "Question 8 graphic",
    imageSrc: "",
    options: [
      { key: "A", label: "Option A", text: "Meaningful relationships and balance" },
      { key: "B", label: "Option B", text: "Big moments and iconic memories" }
    ]
  },
  {
    prompt: "Be honest. Attention feels…",
    accent: "Spotlight truth",
    artSlot: "Question 9 graphic",
    imageSrc: "",
    options: [
      { key: "A", label: "Option A", text: "Slightly uncomfortable" },
      { key: "B", label: "Option B", text: "Kind of amazing" }
    ]
  },
  {
    prompt: "Deep down, you want…",
    accent: "Final reveal",
    artSlot: "Question 10 graphic",
    imageSrc: "",
    options: [
      { key: "A", label: "Option A", text: "To be loved for the real you" },
      { key: "B", label: "Option B", text: "To shine as bright as possible" }
    ]
  }
];

const resultMap = {
  MILEY: {
    badge: "Mostly A's",
    name: "You're Miley Stewart",
    titleAccent: "Authentic and grounded",
    artSlot: "Miley Stewart result graphic",
    imageSrc: "",
    downloadImageSrc: "./assets/results/miley-stewart-share.jpg",
    downloadFilename: "hannah-or-miley-miley-stewart.jpg",
    description:
      "You’re authentic, loyal, and grounded. You value real connections over the spotlight, but that doesn’t mean you don’t shine. Your power is being unapologetically yourself."
  },
  HANNAH: {
    badge: "Mostly B's",
    name: "You're Hannah Montana",
    titleAccent: "Bold and center stage",
    artSlot: "Hannah Montana result graphic",
    imageSrc: "",
    downloadImageSrc: "./assets/results/hannah-montana-share.jpg",
    downloadFilename: "hannah-or-miley-hannah-montana.jpg",
    description:
      "You’re bold, ambitious, and made for center stage. You don’t just enter a room, you arrive. You thrive in big moments and know how to own them."
  },
  BOTH: {
    badge: "Equal A's and B's",
    name: "Best of Both Worlds",
    titleAccent: "Heart and hype",
    artSlot: "Best of Both Worlds result graphic",
    imageSrc: "",
    downloadImageSrc: "./assets/results/best-of-both-worlds-share.jpg",
    downloadFilename: "hannah-or-miley-best-of-both-worlds.jpg",
    description:
      "You balance heart and hype. You can command a stage and still cherish your inner circle. Duality looks good on you."
  }
};

const DEFAULT_RUNTIME_CONFIG = Object.freeze({
  smsEnabled: false,
  smsReason: "Text delivery is not configured on this deployment.",
  consentLabel: "I confirm this guest asked to receive this result by text."
});
const OFFICIAL_ANNIVERSARY_LOGO_SRC = "./assets/brand/hm20-anniversary-logo-lockup.png";
const PAGE_TRANSITION_MS = 180;
const RESULT_IDLE_RESET_MS = 90_000;

const app = document.querySelector("#app");
let resultIdleTimerId = 0;
let removeResultIdleListeners = null;

const state = {
  hasStarted: false,
  currentIndex: 0,
  answers: Array(quizQuestions.length).fill(null),
  activeResultKey: null,
  runtimeConfig: { ...DEFAULT_RUNTIME_CONFIG },
  delivery: createDeliveryState(),
  analytics: createAnalyticsState()
};

function createDeliveryState() {
  return {
    phoneNumber: "",
    consent: false,
    pendingAction: "",
    feedbackKind: "idle",
    feedbackMessage: ""
  };
}

function createAnalyticsState() {
  return {
    sessionId: getOrCreateSessionId(),
    attemptId: createClientId(),
    hasLoggedStart: false,
    hasLoggedCompletion: false
  };
}

function render(direction = "none") {
  if (!state.hasStarted) {
    clearResultIdleReset();
    state.activeResultKey = null;
    renderIntro(direction);
    return;
  }

  const completed = state.answers.every(Boolean);

  if (completed) {
    renderResult(direction);
    return;
  }

  clearResultIdleReset();
  state.activeResultKey = null;
  renderQuestion(state.currentIndex, direction);
}

function renderIntro(direction = "none") {
  mountView({
    direction,
    screenId: "intro",
    markup: `
    <section class="page intro-page" aria-labelledby="welcome-title">
      <div class="intro-stack">
        <div class="intro-copy-block">
          <div class="page-tag">Welcome</div>
          <h2 id="welcome-title">Ready for the<span>Best of Both Worlds?</span></h2>
          <p class="result-copy">
            Answer ten quick questions to find out if your guest energy leans more Hannah,
            Miley, or a little of both.
          </p>
          <div class="cta-row intro-actions">
            <button class="primary-button" type="button" id="start-button">Start Quiz</button>
          </div>
        </div>
      </div>
    </section>
  `,
    setup(page) {
      page.querySelector("#start-button")?.addEventListener("click", beginQuiz);
    }
  });
}

function renderQuestion(index, direction = "none") {
  const question = quizQuestions[index];
  const selected = state.answers[index];
  const progressPercent = ((index + 1) / quizQuestions.length) * 100;
  const hasMedia = Boolean(question.imageSrc);
  const optionMarkup = question.options
    .map(
      (option) => `
        <button
          class="answer-button ${selected === option.key ? "is-selected" : ""}"
          type="button"
          data-answer="${option.key}"
        >
          <span class="answer-pill" aria-hidden="true">${option.key}</span>
          <span class="option-label">${option.label}</span>
          <span class="option-copy">${option.text}</span>
        </button>
      `
    )
    .join("");

  mountView({
    direction,
    screenId: `question-${index}`,
    markup: `
    <section class="page question-page ${hasMedia ? "has-media" : "no-media"}" aria-labelledby="question-title">
      <div class="content-stack">
        <div class="page-tag">Question ${index + 1} of ${quizQuestions.length}</div>
        <div class="progress-bar" aria-hidden="true">
          <div class="progress-value" style="width: ${progressPercent}%"></div>
        </div>
        <div>
          <p class="page-copy">${question.accent}</p>
          <h2 id="question-title">${formatHeading(question.prompt)}</h2>
        </div>
        <div class="answers" role="group" aria-label="${escapeAttribute(question.prompt)}">
          ${optionMarkup}
        </div>
        <div class="nav-row">
          <button class="nav-button" type="button" id="back-button" ${index === 0 ? "disabled" : ""}>
            Back
          </button>
          <div class="meta-note">Tap an answer to move to the next screen.</div>
        </div>
      </div>
      ${hasMedia ? `
      <aside class="media-panel has-image" aria-label="${question.artSlot}">
        ${renderMediaPanel(question)}
      </aside>
      ` : ""}
    </section>
  `,
    setup(page) {
      page.querySelectorAll("[data-answer]").forEach((button) => {
        button.addEventListener("click", () => handleAnswer(index, button.dataset.answer));
      });

      page.querySelector("#back-button")?.addEventListener("click", handleBack);
    }
  });
}

function beginQuiz() {
  state.hasStarted = true;
  state.currentIndex = 0;
  markQuizStarted();
  render("forward");
}

function renderResult(direction = "none") {
  const tallies = countAnswers();
  const resultKey = getResultKey(tallies);
  const result = resultMap[resultKey];
  const hasMedia = Boolean(result.imageSrc);
  const smsEnabled = state.runtimeConfig.smsEnabled;
  const canDownload = Boolean(result.downloadImageSrc);
  const canUseNativeShare = supportsLikelyNativeFileShare();
  const isDownloading = state.delivery.pendingAction === "download";
  const isSending = state.delivery.pendingAction === "sms";
  const deliveryTitle = smsEnabled ? "Save or text the result card" : "Save the result card";
  const feedbackMarkup = state.delivery.feedbackMessage
    ? `
        <p class="delivery-status is-${state.delivery.feedbackKind}" aria-live="polite">
          ${escapeHtml(state.delivery.feedbackMessage)}
        </p>
      `
    : "";
  const smsMarkup = smsEnabled
    ? `
          <form class="sms-form" id="sms-form" novalidate>
            <label class="field-label" for="phone-input">Text this result card</label>
            <div class="sms-row">
              <input
                class="text-input"
                id="phone-input"
                name="phoneNumber"
                type="tel"
                inputmode="tel"
                autocomplete="tel-national"
                placeholder="(555) 555-5555"
                value="${escapeAttribute(state.delivery.phoneNumber)}"
              />
              <button class="nav-button sms-submit" type="submit">
                ${isSending ? "Sending..." : "Text JPEG"}
              </button>
            </div>
            <label class="consent-row">
              <input id="sms-consent" name="consent" type="checkbox" ${state.delivery.consent ? "checked" : ""} />
              <span>${escapeHtml(state.runtimeConfig.consentLabel)}</span>
            </label>
            <p class="delivery-note">Standard message rates may apply. Send only with the guest's clear consent.</p>
          </form>
        `
    : "";

  state.activeResultKey = resultKey;

  if (!state.analytics.hasLoggedCompletion) {
    state.analytics.hasLoggedCompletion = true;
    void logAnalyticsEvent("quiz_completed", {
      resultKey,
      meta: {
        answerCounts: tallies
      }
    });
  }

  const markup = `
    <section class="page result-page ${hasMedia ? "has-media" : "no-media"}" aria-labelledby="result-title">
      <div class="content-stack">
        <div>
          <p class="result-copy">Quiz complete</p>
          <h2 id="result-title" class="result-headline">${result.name}<span>${result.titleAccent}</span></h2>
        </div>
        <p class="result-copy">${result.description}</p>
        <section class="delivery-panel" aria-labelledby="delivery-title">
          <div class="delivery-copy">
            <span class="placeholder-label">Guest take-home</span>
            <h3 id="delivery-title" class="delivery-title">${deliveryTitle}</h3>
            <p class="delivery-note">
              Each result uses a dedicated JPEG file. Replace the files in <code>assets/results/</code> later without changing the quiz flow.
            </p>
          </div>
          <div class="delivery-actions">
            <button class="primary-button" type="button" id="download-button" ${canDownload ? "" : "disabled"}>
              ${isDownloading ? (canUseNativeShare ? "Preparing Share..." : "Preparing JPEG...") : getResultActionLabel(canUseNativeShare)}
            </button>
            <span class="delivery-hint">
              ${getResultActionHint(canDownload, canUseNativeShare)}
            </span>
          </div>
          ${smsMarkup}
          ${feedbackMarkup}
        </section>
        <div class="cta-row result-cta-row">
          <button class="primary-button" type="button" id="restart-button">Start Over</button>
        </div>
      </div>
      ${hasMedia ? `
      <aside class="media-panel result-art has-image" aria-label="${result.artSlot}">
        ${renderResultMediaPanel(result)}
      </aside>
      ` : ""}
    </section>
  `;

  mountView({
    direction,
    screenId: `result-${resultKey}`,
    markup,
    setup(page) {
      setupResultIdleReset(page);
      page.querySelector("#restart-button")?.addEventListener("click", () => restartQuiz({ source: "manual" }));
      page.querySelector("#download-button")?.addEventListener("click", () => handleDownload(result));
      page.querySelector("#sms-form")?.addEventListener("submit", (event) => handleSmsSubmit(event, resultKey));
      page.querySelector("#phone-input")?.addEventListener("input", handlePhoneInput);
      page.querySelector("#sms-consent")?.addEventListener("change", handleConsentChange);
    }
  });
}

function markQuizStarted() {
  if (state.analytics.hasLoggedStart) {
    return;
  }

  state.analytics.hasLoggedStart = true;
  void logAnalyticsEvent("quiz_started");
}

function handleAnswer(index, answer) {
  markQuizStarted();

  state.answers[index] = answer;

  const nextIndex = index + 1;

  if (nextIndex < quizQuestions.length) {
    state.currentIndex = nextIndex;
  }

  window.setTimeout(() => render("forward"), 120);
}

function handleBack() {
  if (state.currentIndex === 0) {
    return;
  }

  state.currentIndex -= 1;
  render("backward");
}

function restartQuiz({ source = "manual", direction = "backward" } = {}) {
  clearResultIdleReset();
  void logAnalyticsEvent("quiz_restarted", {
    resultKey: state.activeResultKey || undefined,
    meta: {
      source
    }
  });

  state.hasStarted = false;
  state.currentIndex = 0;
  state.answers = Array(quizQuestions.length).fill(null);
  state.activeResultKey = null;
  state.delivery = createDeliveryState();
  state.analytics = {
    ...createAnalyticsState(),
    sessionId: state.analytics.sessionId
  };
  render(direction);
}

function handlePhoneInput(event) {
  state.delivery.phoneNumber = event.target.value;
}

function handleConsentChange(event) {
  state.delivery.consent = event.target.checked;
}

async function handleDownload(result) {
  if (!result.downloadImageSrc) {
    setDeliveryFeedback("error", "Add a JPEG for this result before enabling downloads.");
    return;
  }

  state.delivery.pendingAction = "download";
  state.delivery.feedbackKind = "info";
  state.delivery.feedbackMessage = "Preparing the JPEG...";
  render();

  try {
    const assetUrl = resolveResultAssetUrl(result.downloadImageSrc);

    if (shouldUseDirectAssetDownload()) {
      triggerDirectAssetDownload(result, assetUrl);
      await logAnalyticsEvent("result_downloaded", {
        resultKey: state.activeResultKey
      });
      setDeliveryFeedback(
        "success",
        "JPEG opened. If your browser does not download it automatically, save it from the image view."
      );
      return;
    }

    const response = await fetch(assetUrl, { cache: "no-store" });

    if (!response.ok) {
      throw new Error("The JPEG for this result is missing. Replace the file in assets/results/ and try again.");
    }

    const blob = await response.blob();
    const shareOutcome = await tryNativeResultShare(result, blob);

    if (shareOutcome === "shared") {
      await logAnalyticsEvent("result_downloaded", {
        resultKey: state.activeResultKey
      });
      setDeliveryFeedback(
        "success",
        "Share sheet opened. Guests can save the image or send it with supported apps."
      );
      return;
    }

    if (shareOutcome === "dismissed") {
      setDeliveryFeedback("info", "Share canceled.");
      return;
    }

    const objectUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = result.downloadFilename;
    anchor.rel = "noopener";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1500);
    await logAnalyticsEvent("result_downloaded", {
      resultKey: state.activeResultKey
    });
    setDeliveryFeedback(
      "success",
      "JPEG ready. If the phone opens the image in a new view, use the Share menu to save it."
    );
  } catch (error) {
    setDeliveryFeedback("error", error instanceof Error ? error.message : "Unable to prepare the JPEG.");
  }
}

function resolveResultAssetUrl(assetPath) {
  return new URL(assetPath, window.location.href).toString();
}

function shouldUseDirectAssetDownload() {
  return window.location.protocol === "file:";
}

function triggerDirectAssetDownload(result, assetUrl) {
  const anchor = document.createElement("a");
  anchor.href = assetUrl;
  anchor.download = result.downloadFilename;
  anchor.rel = "noopener";
  anchor.target = "_blank";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

async function handleSmsSubmit(event, resultKey) {
  event.preventDefault();

  const form = event.currentTarget;
  const phoneInput = form.querySelector("#phone-input");
  const consentInput = form.querySelector("#sms-consent");

  state.delivery.phoneNumber = phoneInput?.value.trim() ?? "";
  state.delivery.consent = Boolean(consentInput?.checked);

  if (!state.runtimeConfig.smsEnabled) {
    setDeliveryFeedback("error", state.runtimeConfig.smsReason);
    return;
  }

  state.delivery.pendingAction = "sms";
  state.delivery.feedbackKind = "info";
  state.delivery.feedbackMessage = "Sending the JPEG by text...";
  render();

  try {
    const response = await fetch("./api/send-result", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        phoneNumber: state.delivery.phoneNumber,
        resultKey,
        consent: state.delivery.consent,
        attemptId: state.analytics.attemptId,
        sessionId: state.analytics.sessionId
      })
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || "Unable to send the text right now.");
    }

    state.delivery = {
      ...createDeliveryState(),
      feedbackKind: "success",
      feedbackMessage: "Text sent. Ask the guest to check their messages in a moment."
    };
    render();
  } catch (error) {
    setDeliveryFeedback("error", error instanceof Error ? error.message : "Unable to send the text right now.");
  }
}

async function loadRuntimeConfig() {
  try {
    const response = await fetch("./api/config", {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error("Config unavailable");
    }

    const payload = await response.json();
    state.runtimeConfig = {
      ...DEFAULT_RUNTIME_CONFIG,
      ...payload
    };
  } catch (error) {
    state.runtimeConfig = {
      ...DEFAULT_RUNTIME_CONFIG,
      smsEnabled: false,
      smsReason: "Text delivery is unavailable on this deployment. Run the Node server and add Twilio credentials to enable it."
    };
  }
}

async function logAnalyticsEvent(type, details = {}) {
  const payload = {
    type,
    attemptId: state.analytics.attemptId,
    sessionId: state.analytics.sessionId
  };

  if (details.resultKey) {
    payload.resultKey = details.resultKey;
  }

  if (details.meta) {
    payload.meta = details.meta;
  }

  try {
    await fetch("./api/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      keepalive: true
    });
  } catch (error) {
    // Analytics should never block the guest flow.
  }
}

function setDeliveryFeedback(kind, message) {
  state.delivery.pendingAction = "";
  state.delivery.feedbackKind = kind;
  state.delivery.feedbackMessage = message;
  render();
}

function setupResultIdleReset(page) {
  clearResultIdleReset();

  const armTimer = () => {
    clearTimeout(resultIdleTimerId);
    resultIdleTimerId = window.setTimeout(() => {
      restartQuiz({
        source: "idle_timeout"
      });
    }, RESULT_IDLE_RESET_MS);
  };
  const trackedEvents = ["pointerdown", "keydown", "input", "focusin"];

  trackedEvents.forEach((eventName) => {
    page.addEventListener(eventName, armTimer);
  });

  removeResultIdleListeners = () => {
    trackedEvents.forEach((eventName) => {
      page.removeEventListener(eventName, armTimer);
    });
  };

  armTimer();
}

function clearResultIdleReset() {
  if (resultIdleTimerId) {
    window.clearTimeout(resultIdleTimerId);
    resultIdleTimerId = 0;
  }

  removeResultIdleListeners?.();
  removeResultIdleListeners = null;
}

function countAnswers() {
  return state.answers.reduce(
    (accumulator, answer) => {
      if (answer === "A") {
        accumulator.A += 1;
      }

      if (answer === "B") {
        accumulator.B += 1;
      }

      return accumulator;
    },
    { A: 0, B: 0 }
  );
}

function getResultKey(tallies) {
  if (tallies.A === tallies.B) {
    return "BOTH";
  }

  return tallies.A > tallies.B ? "MILEY" : "HANNAH";
}

function formatHeading(prompt) {
  const punctuationMatch = prompt.match(/[.!?…]+$/u);
  const punctuation = punctuationMatch ? punctuationMatch[0] : "";
  const basePrompt = punctuation ? prompt.slice(0, -punctuation.length) : prompt;
  const words = basePrompt.split(" ");

  if (words.length < 2) {
    return `${basePrompt}${punctuation}`;
  }

  const midpoint = Math.ceil(words.length / 2);
  const firstLine = words.slice(0, midpoint).join(" ");
  const secondLine = words.slice(midpoint).join(" ");

  return `${firstLine}<span>${secondLine}${punctuation}</span>`;
}

function renderPlaceholderArt(slotTitle, supportingCopy) {
  return `
    <div class="placeholder-art">
      <div class="placeholder-burst" aria-hidden="true"></div>
      <div class="placeholder-copy">
        <span class="placeholder-label">Future artwork slot</span>
        <h3 class="placeholder-title">${slotTitle}</h3>
        <p>Use this space for photography, character renders, event branding, or sponsor art once assets are ready.</p>
        <p>${supportingCopy}</p>
      </div>
    </div>
  `;
}

function renderMediaPanel(question) {
  if (question.imageSrc) {
    return `<img class="media-image" src="${question.imageSrc}" alt="${question.artSlot}" />`;
  }

  return renderPlaceholderArt(question.artSlot, question.accent);
}

function renderResultMediaPanel(result) {
  if (result.imageSrc) {
    return `<img class="media-image" src="${result.imageSrc}" alt="${result.artSlot}" />`;
  }

  return `
    <div class="placeholder-art">
      <div class="result-stars" aria-hidden="true">✦ ✦ ✦</div>
      <div class="placeholder-copy">
        <span class="placeholder-label">Future artwork slot</span>
        <h3 class="placeholder-title">${result.artSlot}</h3>
        <p>Swap this panel with final character art, branded framing, or sponsor graphics later without changing the quiz flow.</p>
      </div>
    </div>
  `;
}

function mountView({ screenId, markup, setup, direction = "none" }) {
  cleanupTransitionArtifacts();

  const nextView = createViewNode(markup, screenId);
  const currentView = app.lastElementChild;
  const shouldAnimate = shouldAnimatePageTransition(direction);

  if (!currentView || currentView.dataset.screenId === screenId || !shouldAnimate) {
    app.replaceChildren(nextView);
    setup?.(nextView);
    return;
  }

  currentView.classList.add("is-transitioning-out", `page-exit-${direction}`);
  currentView.setAttribute("aria-hidden", "true");

  nextView.classList.add("is-transitioning-in", `page-enter-${direction}`);
  app.append(nextView);
  setup?.(nextView);

  const finalize = () => {
    if (currentView.isConnected) {
      currentView.remove();
    }

    nextView.classList.remove("is-transitioning-in", `page-enter-${direction}`);
  };

  window.setTimeout(finalize, PAGE_TRANSITION_MS + 60);
}

function createViewNode(markup, screenId) {
  const template = document.createElement("template");
  template.innerHTML = markup.trim();
  const view = template.content.firstElementChild;

  view.classList.add("page-shell");
  view.dataset.screenId = screenId;

  return view;
}

function cleanupTransitionArtifacts() {
  const views = [...app.children];

  if (views.length <= 1) {
    return;
  }

  const activeView = views.at(-1);

  views.slice(0, -1).forEach((view) => view.remove());
  activeView.classList.remove(
    "is-transitioning-in",
    "is-transitioning-out",
    "page-enter-forward",
    "page-enter-backward",
    "page-exit-forward",
    "page-exit-backward"
  );
  activeView.removeAttribute("aria-hidden");
}

function shouldAnimatePageTransition(direction) {
  if (direction === "none") {
    return false;
  }

  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getResultActionLabel(canUseNativeShare) {
  return canUseNativeShare ? "Share / Save JPEG" : "Download JPEG";
}

function getResultActionHint(canDownload, canUseNativeShare) {
  if (!canDownload) {
    return "Add a result JPEG to enable downloads.";
  }

  if (canUseNativeShare) {
    return "Opens the native share menu when supported so guests can save or send the image.";
  }

  return "Saves the configured result card to this device.";
}

function supportsLikelyNativeFileShare() {
  const isMobileShareDevice = isLikelyMobileShareDevice();

  return (
    isMobileShareDevice &&
    window.isSecureContext &&
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    typeof File === "function"
  );
}

function isLikelyMobileShareDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent || "";
  const mobilePlatformMatch = /Android|iPhone|iPad|iPod/i.test(userAgent);
  const isTouchMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;

  return mobilePlatformMatch || isTouchMac;
}

async function tryNativeResultShare(result, blob) {
  if (!supportsLikelyNativeFileShare()) {
    return "unsupported";
  }

  const shareFile = new File([blob], result.downloadFilename, {
    type: blob.type || "image/jpeg",
    lastModified: Date.now()
  });

  try {
    if (!navigator.canShare({ files: [shareFile] })) {
      return "unsupported";
    }
  } catch (error) {
    return "unsupported";
  }

  try {
    await navigator.share({
      title: result.name,
      text: result.titleAccent,
      files: [shareFile]
    });
    return "shared";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return "dismissed";
    }

    return "unsupported";
  }
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getOrCreateSessionId() {
  try {
    const existingId = window.sessionStorage.getItem("hannahOrMileySessionId");

    if (existingId) {
      return existingId;
    }

    const nextId = createClientId();
    window.sessionStorage.setItem("hannahOrMileySessionId", nextId);
    return nextId;
  } catch (error) {
    return createClientId();
  }
}

function createClientId() {
  return typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function initialize() {
  render();
  await loadRuntimeConfig();
  render();
  void logAnalyticsEvent("app_loaded");
}

initialize();
