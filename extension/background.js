const API_BASE = "http://127.0.0.1:8000";
const PREDICT_URL = `${API_BASE}/predict`;
const ANALYTICS_URL = `${API_BASE}/analytics`;
const HEALTH_URL = `${API_BASE}/health`;
const AUTH_URL = `${API_BASE}/auth`;

const LOGIN_REQUIRED_MESSAGE = "Please log in from the extension icon to verify posts.";

// In-memory prediction cache to avoid duplicate API calls for the same tweet
const predictionCache = new Map();

// ============================================================
// AUTH SESSION STORAGE
// ============================================================
async function getAuth() {
  const { auth } = await chrome.storage.local.get("auth");
  if (!auth?.token) return null;
  if (auth.expiresAt && new Date(auth.expiresAt).getTime() <= Date.now()) {
    await clearAuth();
    return null;
  }
  return auth;
}

async function saveAuth(data) {
  await chrome.storage.local.set({
    auth: { token: data.token, email: data.email, expiresAt: data.expires_at },
  });
}

async function clearAuth() {
  predictionCache.clear();
  await chrome.storage.local.remove("auth");
}

// Fetch with the bearer token attached; signs the user out if the server rejects it
async function authorizedFetch(url, options = {}, timeoutMs = 5000) {
  const auth = await getAuth();
  if (!auth) return { authRequired: true };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${auth.token}` },
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  if (response.status === 401) {
    await clearAuth();
    return { authRequired: true };
  }
  return { response };
}

async function submitCredentials(endpoint, email, password) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  const res = await fetch(`${AUTH_URL}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof data.detail === "string" ? data.detail : `Request failed (HTTP ${res.status}).`;
    return { ok: false, error: detail };
  }
  await saveAuth(data);
  return { ok: true, email: data.email };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) return undefined;

  // 1. Health Check
  if (message.type === "CHECK_HEALTH") {
    (async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(HEALTH_URL, { signal: controller.signal });
        clearTimeout(timeoutId);
        const data = await res.json().catch(() => ({}));
        sendResponse({ ok: res.ok, data });
      } catch (err) {
        sendResponse({ ok: false, error: "API offline" });
      }
    })();
    return true;
  }

  // 2. Auth: current session, login, signup, logout
  if (message.type === "GET_AUTH") {
    (async () => {
      const auth = await getAuth();
      sendResponse({ ok: true, loggedIn: Boolean(auth), email: auth?.email || null });
    })();
    return true;
  }

  if (message.type === "LOGIN" || message.type === "SIGNUP") {
    (async () => {
      try {
        const endpoint = message.type === "LOGIN" ? "login" : "signup";
        sendResponse(await submitCredentials(endpoint, message.email, message.password));
      } catch (err) {
        sendResponse({
          ok: false,
          error: `Could not reach the server at ${API_BASE}. Please ensure the FastAPI server is running on port 8000.`,
        });
      }
    })();
    return true;
  }

  if (message.type === "LOGOUT") {
    (async () => {
      const auth = await getAuth();
      if (auth) {
        // Best effort: revoke the token on the server too
        fetch(`${AUTH_URL}/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${auth.token}` },
        }).catch(() => {});
      }
      await clearAuth();
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.type === "OPEN_LOGIN") {
    chrome.action.openPopup?.().catch(() => {});
    return undefined;
  }

  // 3. Fetch Analytics
  if (message.type === "GET_ANALYTICS") {
    (async () => {
      try {
        const { response: res, authRequired } = await authorizedFetch(ANALYTICS_URL);
        if (authRequired) {
          sendResponse({ ok: false, authRequired: true, error: LOGIN_REQUIRED_MESSAGE });
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          sendResponse({ ok: false, error: "Failed to fetch analytics" });
          return;
        }
        sendResponse({ ok: true, data });
      } catch (err) {
        sendResponse({ ok: false, error: err.message || "Could not reach analytics API" });
      }
    })();
    return true;
  }

  // 4. Predict Post Credibility
  if (message.type === "PREDICT") {
    const payload = message.payload;
    const tweetId = payload?.tweet_id;

    (async () => {
      try {
        if (!(await getAuth())) {
          sendResponse({ ok: false, authRequired: true, error: LOGIN_REQUIRED_MESSAGE });
          return;
        }

        // Check cache first (if not forcing refresh)
        if (!message.bypassCache && tweetId && predictionCache.has(tweetId)) {
          sendResponse({ ok: true, data: predictionCache.get(tweetId), fromCache: true });
          return;
        }

        const { response, authRequired } = await authorizedFetch(
          PREDICT_URL,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
          12000
        );
        if (authRequired) {
          sendResponse({ ok: false, authRequired: true, error: "Your session has expired. Please log in again." });
          return;
        }

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          const detail = typeof result.detail === "string" ? result.detail : `Inference request failed (HTTP ${response.status}).`;
          sendResponse({ ok: false, error: detail });
          return;
        }

        if (tweetId) {
          predictionCache.set(tweetId, result);
        }

        sendResponse({ ok: true, data: result });
      } catch (error) {
        sendResponse({
          ok: false,
          error: `Could not reach the local Fake Detection API at ${PREDICT_URL}. Please ensure the FastAPI server is running on port 8000.`,
        });
      }
    })();
    return true;
  }

  return undefined;
});
