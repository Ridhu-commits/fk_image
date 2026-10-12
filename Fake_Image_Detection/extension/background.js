const API_BASE = "http://127.0.0.1:8000";
const PREDICT_URL = `${API_BASE}/predict`;
const ANALYTICS_URL = `${API_BASE}/analytics`;
const HEALTH_URL = `${API_BASE}/health`;

// In-memory prediction cache to avoid duplicate API calls for the same tweet
const predictionCache = new Map();

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

  // 2. Fetch Analytics
  if (message.type === "GET_ANALYTICS") {
    (async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(ANALYTICS_URL, { signal: controller.signal });
        clearTimeout(timeoutId);
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

  // 3. Predict Post Credibility
  if (message.type === "PREDICT") {
    const payload = message.payload;
    const tweetId = payload?.tweet_id;

    // Check cache first (if not forcing refresh)
    if (!message.bypassCache && tweetId && predictionCache.has(tweetId)) {
      sendResponse({ ok: true, data: predictionCache.get(tweetId), fromCache: true });
      return true;
    }

    (async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        const response = await fetch(PREDICT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

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