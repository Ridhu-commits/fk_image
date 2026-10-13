document.addEventListener("DOMContentLoaded", async () => {
  const apiStatusPill = document.getElementById("api-status-pill");
  const apiStatusText = document.getElementById("api-status-text");
  const postIdDisplay = document.getElementById("post-id-display");
  const postSnippetText = document.getElementById("post-snippet-text");
  const scanButton = document.getElementById("scan-button");
  const btnSpinner = document.getElementById("btn-spinner");
  const btnLabel = document.getElementById("btn-label");
  const errorCard = document.getElementById("error-card");
  const resultSection = document.getElementById("result-section");
  const verdictBanner = document.getElementById("verdict-banner");
  const verdictTitle = document.getElementById("verdict-title");
  const verdictSub = document.getElementById("verdict-sub");
  const meterFill = document.getElementById("meter-fill");
  const confidenceText = document.getElementById("confidence-text");
  const evVerified = document.getElementById("ev-verified");
  const evEngagement = document.getElementById("ev-engagement");
  const evComments = document.getElementById("ev-comments");
  const evSource = document.getElementById("ev-source");
  const toggleAnalyticsBtn = document.getElementById("toggle-analytics");
  const analyticsBox = document.getElementById("analytics-box");
  const drawerArrow = document.getElementById("drawer-arrow");
  const authView = document.getElementById("auth-view");
  const appView = document.getElementById("app-view");
  const authForm = document.getElementById("auth-form");
  const authTitle = document.getElementById("auth-title");
  const authEmail = document.getElementById("auth-email");
  const authPassword = document.getElementById("auth-password");
  const authHint = document.getElementById("auth-hint");
  const authSubmit = document.getElementById("auth-submit");
  const authSpinner = document.getElementById("auth-spinner");
  const authLabel = document.getElementById("auth-label");
  const authError = document.getElementById("auth-error");
  const tabLogin = document.getElementById("tab-login");
  const tabSignup = document.getElementById("tab-signup");
  const userEmail = document.getElementById("user-email");
  const logoutButton = document.getElementById("logout-button");

  let authMode = "login";

  // 0. Login / Sign up
  function setAuthMode(mode) {
    authMode = mode;
    const isLogin = mode === "login";
    tabLogin.classList.toggle("active", isLogin);
    tabSignup.classList.toggle("active", !isLogin);
    tabLogin.setAttribute("aria-selected", String(isLogin));
    tabSignup.setAttribute("aria-selected", String(!isLogin));
    authTitle.textContent = isLogin ? "Log in to continue" : "Create your account";
    authLabel.textContent = isLogin ? "Log in" : "Create account";
    authPassword.autocomplete = isLogin ? "current-password" : "new-password";
    authHint.hidden = isLogin;
    authError.style.display = "none";
  }

  function showAuthView(message) {
    appView.hidden = true;
    authView.hidden = false;
    if (message) {
      authError.textContent = message;
      authError.style.display = "block";
    }
    authEmail.focus();
  }

  async function showAppView(email) {
    authView.hidden = true;
    appView.hidden = false;
    userEmail.textContent = email;
    await inspectActiveTab();
  }

  tabLogin.addEventListener("click", () => setAuthMode("login"));
  tabSignup.addEventListener("click", () => setAuthMode("signup"));

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    authError.style.display = "none";

    const email = authEmail.value.trim();
    const password = authPassword.value;
    if (!email || !password) {
      authError.textContent = "Please enter your email and password.";
      authError.style.display = "block";
      return;
    }

    authSubmit.disabled = true;
    authSpinner.style.display = "inline-block";
    try {
      const response = await chrome.runtime.sendMessage({
        type: authMode === "login" ? "LOGIN" : "SIGNUP",
        email,
        password,
      });
      if (!response?.ok) {
        throw new Error(response?.error || "Something went wrong. Please try again.");
      }
      authPassword.value = "";
      await showAppView(response.email);
    } catch (err) {
      authError.textContent = err.message;
      authError.style.display = "block";
    } finally {
      authSubmit.disabled = false;
      authSpinner.style.display = "none";
    }
  });

  logoutButton.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "LOGOUT" }).catch(() => null);
    resultSection.style.display = "none";
    setAuthMode("login");
    showAuthView();
  });

  // 1. Check API Health
  async function checkBackendHealth() {
    try {
      const response = await chrome.runtime.sendMessage({ type: "CHECK_HEALTH" });
      if (response && response.ok) {
        apiStatusPill.className = "api-pill";
        apiStatusText.textContent = "API Online";
        return true;
      }
    } catch (_) {}
    apiStatusPill.className = "api-pill offline";
    apiStatusText.textContent = "API Offline";
    return false;
  }

  // 2. Query Active Tab and Page Info
  async function inspectActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !/^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i.test(tab.url || "")) {
        postIdDisplay.textContent = "Not on X / Twitter";
        postSnippetText.textContent = "Navigate to a post on x.com or twitter.com to run live credibility analysis.";
        scanButton.disabled = true;
        return null;
      }

      // Try communicating with content script
      const pageInfo = await chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_INFO" }).catch(() => null);
      if (pageInfo?.ok && pageInfo.data) {
        const { postId, textSnippet, commentsFound } = pageInfo.data;
        postIdDisplay.textContent = postId ? `#${postId}` : "Feed / Timeline";
        if (textSnippet) {
          postSnippetText.textContent = `"${textSnippet}..." (${commentsFound} replies detected)`;
        } else {
          postSnippetText.textContent = "Post detected. Click below to analyze multimodal propagation & sentiment.";
        }
        scanButton.disabled = false;
        return tab;
      } else {
        postIdDisplay.textContent = "Ready to Scan";
        postSnippetText.textContent = "Click below to analyze the active post.";
        scanButton.disabled = false;
        return tab;
      }
    } catch (err) {
      postIdDisplay.textContent = "Standby";
      return null;
    }
  }

  // 3. Load Analytics
  async function loadAnalytics() {
    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_ANALYTICS" });
      if (response?.authRequired) {
        showAuthView(response.error);
        return;
      }
      if (response?.ok && response.data) {
        const d = response.data;
        document.getElementById("stat-total").textContent = d.total_requests ?? 0;
        document.getElementById("stat-fake").textContent = d.fake_requests ?? 0;
        document.getElementById("stat-real").textContent = d.real_requests ?? 0;
        document.getElementById("stat-ratio").textContent = `${d.fake_ratio_percent ?? 0}%`;
      }
    } catch (_) {}
  }

  // 4. Scan Button Click Handler
  scanButton.addEventListener("click", async () => {
    hideError();
    scanButton.disabled = true;
    btnSpinner.style.display = "inline-block";
    btnLabel.textContent = "Evaluating Deep LSTM...";
    resultSection.style.display = "none";

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        throw new Error("Could not find the active browser tab.");
      }

      const response = await chrome.tabs.sendMessage(tab.id, { type: "CHECK_POST" });

      if (response?.authRequired) {
        showAuthView(response.error);
        return;
      }

      if (!response?.ok) {
        throw new Error(response?.error || "Inference failed. Check if FastAPI is running.");
      }

      displayResult(response.data);
      loadAnalytics();
    } catch (err) {
      showError(err.message || "Something went wrong while analyzing the post.");
    } finally {
      scanButton.disabled = false;
      btnSpinner.style.display = "none";
      btnLabel.textContent = "Analyze Post Credibility";
    }
  });

  // 5. Render Result Card
  function displayResult(data) {
    const isReal = data.verdict === "Real";
    const confidence = Number(data.confidence || 0);

    verdictBanner.className = `verdict-banner ${isReal ? "real" : "fake"}`;
    verdictTitle.textContent = isReal ? "REAL CONTENT" : "MANIPULATED / FAKE";
    verdictSub.textContent = isReal
      ? "Strong indicators of authentic, organic news propagation"
      : "High probability of deceptive or manipulated information";

    confidenceText.textContent = `${confidence.toFixed(1)}%`;
    meterFill.style.width = "0%";
    setTimeout(() => {
      meterFill.style.width = `${confidence}%`;
    }, 50);

    // Signals Evidence
    const sig = data.details?.signals || {};
    evVerified.textContent = sig.verified ? "Yes (Verified)" : "Unverified";
    evVerified.style.color = sig.verified ? "var(--accent-green)" : "var(--text-secondary)";

    const likes = sig.like_count || 0;
    const rts = sig.retweet_count || 0;
    evEngagement.textContent = `${likes.toLocaleString()} / ${rts.toLocaleString()}`;

    const commentsCount = data.details?.comments_analyzed || 0;
    evComments.textContent = `${commentsCount} replies`;

    const source = data.details?.text_source || "combined";
    evSource.textContent = source === "comments" ? "Thread Replies" : (source === "tweet_text" ? "Tweet Text" : "Standard");

    resultSection.style.display = "block";
  }

  function showError(msg) {
    errorCard.textContent = msg;
    errorCard.style.display = "block";
  }

  function hideError() {
    errorCard.style.display = "none";
  }

  // Analytics Drawer Toggle
  toggleAnalyticsBtn.addEventListener("click", () => {
    const isOpen = analyticsBox.style.display === "block";
    analyticsBox.style.display = isOpen ? "none" : "block";
    drawerArrow.textContent = isOpen ? "▼" : "▲";
    if (!isOpen) {
      loadAnalytics();
    }
  });

  // Run initial checks
  await checkBackendHealth();
  const auth = await chrome.runtime.sendMessage({ type: "GET_AUTH" }).catch(() => null);
  if (auth?.loggedIn) {
    await showAppView(auth.email);
  } else {
    showAuthView();
  }
});