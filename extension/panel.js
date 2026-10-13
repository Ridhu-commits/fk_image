// In-page side panel for x.com / twitter.com: login + live results while scrolling.
// Rendered inside a closed Shadow DOM so X's styles and scripts can't reach it.
(() => {
  const MAX_RECENT = 8;

  const host = document.createElement("div");
  host.id = "fid-panel-host";
  host.style.cssText = "all: initial; position: fixed; z-index: 2147483000; top: 0; left: 0; width: 0; height: 0;";
  const root = host.attachShadow({ mode: "closed" });

  // Keep keystrokes typed in the panel away from X's keyboard shortcuts (j, k, l, n, ...)
  ["keydown", "keyup", "keypress"].forEach((type) =>
    host.addEventListener(type, (e) => e.stopPropagation())
  );

  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      .panel, .tab {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #f1f5f9;
      }
      .panel {
        position: fixed;
        top: 72px;
        right: 16px;
        width: 300px;
        max-height: calc(100vh - 96px);
        display: flex;
        flex-direction: column;
        background: rgba(11, 15, 20, 0.96);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55);
        backdrop-filter: blur(12px);
        overflow: hidden;
      }
      .panel[hidden], .tab[hidden], [hidden] { display: none !important; }

      header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 14px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      .logo {
        width: 30px; height: 30px;
        border-radius: 9px;
        background: linear-gradient(135deg, #10b981, #06b6d4);
        color: #0b0f14;
        display: grid; place-items: center;
        flex-shrink: 0;
      }
      .title { flex: 1; min-width: 0; }
      .title h1 { font-size: 13.5px; font-weight: 800; color: #fff; }
      .title span { font-size: 10.5px; color: #64748b; }
      .icon-btn {
        width: 26px; height: 26px;
        border: none; border-radius: 7px;
        background: rgba(255, 255, 255, 0.06);
        color: #94a3b8;
        cursor: pointer;
        display: grid; place-items: center;
      }
      .icon-btn:hover { background: rgba(255, 255, 255, 0.12); color: #fff; }

      .body { padding: 14px; overflow-y: auto; }

      .notice {
        font-size: 11.5px;
        line-height: 1.4;
        padding: 9px 11px;
        border-radius: 10px;
        margin-bottom: 12px;
        background: rgba(244, 63, 94, 0.1);
        border: 1px solid rgba(244, 63, 94, 0.3);
        color: #fda4af;
      }

      /* Login */
      .lead { font-size: 15px; font-weight: 800; margin-bottom: 3px; }
      .sub { font-size: 11.5px; color: #94a3b8; margin-bottom: 12px; line-height: 1.4; }
      .tabs {
        display: grid; grid-template-columns: 1fr 1fr; gap: 4px;
        padding: 3px;
        background: rgba(30, 38, 48, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 9px;
        margin-bottom: 12px;
      }
      .tabs button {
        border: none; background: none;
        color: #64748b;
        font: inherit; font-size: 12px; font-weight: 700;
        padding: 7px 0;
        border-radius: 7px;
        cursor: pointer;
      }
      .tabs button.active { background: rgba(16, 185, 129, 0.15); color: #10b981; }
      label { display: block; font-size: 10.5px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 5px; }
      input {
        width: 100%;
        background: rgba(0, 0, 0, 0.45);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 9px;
        padding: 9px 11px;
        color: #f1f5f9;
        font: inherit; font-size: 13px;
        margin-bottom: 10px;
      }
      input:focus { outline: none; border-color: rgba(52, 211, 153, 0.5); box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2); }
      .primary {
        width: 100%;
        padding: 10px;
        border: none; border-radius: 10px;
        background: linear-gradient(135deg, #10b981, #059669);
        color: #fff;
        font: inherit; font-size: 13px; font-weight: 700;
        cursor: pointer;
      }
      .primary:disabled { opacity: 0.6; cursor: progress; }
      .error { margin: 10px 0 0; }

      /* Logged in */
      .user {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
        font-size: 11px; color: #64748b;
        margin-bottom: 12px;
      }
      .user strong { color: #94a3b8; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .link { background: none; border: none; color: #06b6d4; font: inherit; font-size: 11px; font-weight: 600; cursor: pointer; flex-shrink: 0; }
      .live {
        display: flex; align-items: center; gap: 7px;
        font-size: 11.5px; color: #94a3b8;
        margin-bottom: 10px;
      }
      .dot { width: 7px; height: 7px; border-radius: 50%; background: #10b981; box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2); }
      .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 14px; }
      .stat { background: rgba(30, 38, 48, 0.6); border: 1px solid rgba(255, 255, 255, 0.07); border-radius: 10px; padding: 8px 10px; }
      .stat span { display: block; font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; }
      .stat strong { font-size: 18px; font-weight: 800; }
      .stat.real strong { color: #34d399; }
      .stat.fake strong { color: #fb7185; }
      .section { font-size: 10.5px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 6px; }
      .recent { list-style: none; }
      .recent li {
        display: flex; align-items: center; gap: 8px;
        padding: 7px 8px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 12px;
      }
      .recent li:hover { background: rgba(255, 255, 255, 0.05); }
      .chip { flex-shrink: 0; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 999px; }
      .chip.real { background: rgba(16, 185, 129, 0.15); color: #34d399; }
      .chip.fake { background: rgba(244, 63, 94, 0.15); color: #fb7185; }
      .recent .text { flex: 1; min-width: 0; color: #cbd5e1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .recent .conf { flex-shrink: 0; color: #94a3b8; font-size: 11px; }
      .empty { font-size: 12px; color: #64748b; padding: 6px 0; }
      footer { padding: 10px 14px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 10.5px; color: #64748b; }

      .tab {
        position: fixed;
        top: 50%;
        right: 0;
        transform: translateY(-50%);
        display: flex; flex-direction: column; align-items: center; gap: 6px;
        padding: 12px 8px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-right: none;
        border-radius: 12px 0 0 12px;
        background: rgba(11, 15, 20, 0.96);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
        cursor: pointer;
      }
      .tab .count { font-size: 11px; font-weight: 800; color: #fb7185; }
    </style>

    <aside class="panel" id="panel" aria-label="Fake Image Detector">
      <header>
        <div class="logo" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
        </div>
        <div class="title">
          <h1>Fake Image Detector</h1>
          <span>Joint Bi-LSTM · live on your feed</span>
        </div>
        <button class="icon-btn" id="collapse" type="button" title="Hide panel" aria-label="Hide panel">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </header>

      <div class="body">
        <div class="notice" id="offline" hidden>The detector server is offline. Start it with <b>uvicorn src.app:app</b> on port 8000.</div>

        <!-- Logged out -->
        <section id="auth-view" hidden>
          <div class="lead" id="auth-title">Log in to scan your feed</div>
          <p class="sub">Once you're in, every post you scroll past is marked <b>Real</b> or <b>Fake</b> automatically.</p>
          <div class="tabs" role="tablist">
            <button id="tab-login" class="active" type="button" role="tab" aria-selected="true">Log in</button>
            <button id="tab-signup" type="button" role="tab" aria-selected="false">Sign up</button>
          </div>
          <form id="auth-form" novalidate>
            <label for="email">Email</label>
            <input id="email" type="email" autocomplete="email" placeholder="you@example.com">
            <label for="password">Password</label>
            <input id="password" type="password" autocomplete="current-password" placeholder="At least 8 characters">
            <button class="primary" id="submit" type="submit">Log in</button>
          </form>
          <div class="notice error" id="auth-error" role="alert" hidden></div>
        </section>

        <!-- Logged in -->
        <section id="app-view" hidden>
          <div class="user">
            <span>Signed in as <strong id="user-email"></strong></span>
            <button class="link" id="logout" type="button">Log out</button>
          </div>
          <div class="live"><span class="dot"></span>Scanning posts as you scroll</div>
          <div class="stats">
            <div class="stat"><span>Checked</span><strong id="stat-total">0</strong></div>
            <div class="stat real"><span>Real</span><strong id="stat-real">0</strong></div>
            <div class="stat fake"><span>Fake</span><strong id="stat-fake">0</strong></div>
          </div>
          <div class="section">Recently checked</div>
          <ul class="recent" id="recent"></ul>
          <p class="empty" id="recent-empty">Scroll your feed — results appear here.</p>
        </section>
      </div>

      <footer>Verdicts are model estimates. Click a post above to jump to it.</footer>
    </aside>

    <button class="tab" id="tab" type="button" title="Show Fake Image Detector" hidden>
      <div class="logo" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
      </div>
      <span class="count" id="tab-count"></span>
    </button>
  `;

  const $ = (id) => root.getElementById(id);
  const results = new Map(); // tweetId -> { verdict, confidence, author, text, hasMedia }
  let authMode = "login";

  // ---------- Collapse / expand ----------
  function setCollapsed(collapsed) {
    $("panel").hidden = collapsed;
    $("tab").hidden = !collapsed;
    chrome.storage.local.set({ panelCollapsed: collapsed }).catch(() => {});
  }
  $("collapse").addEventListener("click", () => setCollapsed(true));
  $("tab").addEventListener("click", () => setCollapsed(false));

  // ---------- Auth ----------
  function setAuthMode(mode) {
    authMode = mode;
    const isLogin = mode === "login";
    $("tab-login").classList.toggle("active", isLogin);
    $("tab-signup").classList.toggle("active", !isLogin);
    $("tab-login").setAttribute("aria-selected", String(isLogin));
    $("tab-signup").setAttribute("aria-selected", String(!isLogin));
    $("auth-title").textContent = isLogin ? "Log in to scan your feed" : "Create your account";
    $("submit").textContent = isLogin ? "Log in" : "Create account";
    $("password").autocomplete = isLogin ? "current-password" : "new-password";
    $("auth-error").hidden = true;
  }
  $("tab-login").addEventListener("click", () => setAuthMode("login"));
  $("tab-signup").addEventListener("click", () => setAuthMode("signup"));

  function render(auth) {
    const loggedIn = Boolean(auth?.loggedIn);
    $("auth-view").hidden = loggedIn;
    $("app-view").hidden = !loggedIn;
    if (loggedIn) $("user-email").textContent = auth.email;
  }

  async function refreshAuth() {
    const auth = await chrome.runtime.sendMessage({ type: "GET_AUTH" }).catch(() => null);
    render(auth);
    return auth;
  }

  $("auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("email").value.trim();
    const password = $("password").value;
    const error = $("auth-error");
    error.hidden = true;
    if (!email || !password) {
      error.textContent = "Please enter your email and password.";
      error.hidden = false;
      return;
    }
    $("submit").disabled = true;
    try {
      const response = await chrome.runtime.sendMessage({
        type: authMode === "login" ? "LOGIN" : "SIGNUP",
        email,
        password,
      });
      if (!response?.ok) throw new Error(response?.error || "Something went wrong. Please try again.");
      $("password").value = "";
      render({ loggedIn: true, email: response.email });
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    } finally {
      $("submit").disabled = false;
    }
  });

  $("logout").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "LOGOUT" }).catch(() => null);
    setAuthMode("login");
    render({ loggedIn: false });
  });

  // Logging in/out from the toolbar popup updates the panel too
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !("auth" in changes)) return;
    if (!changes.auth.newValue) {
      results.clear();
      renderResults();
      render({ loggedIn: false });
    } else {
      refreshAuth();
    }
  });

  // ---------- Results ----------
  function findArticle(tweetId) {
    const link = document.querySelector(`article[data-testid="tweet"] a[href*="/status/${tweetId}"]`);
    return link?.closest('article[data-testid="tweet"]') || null;
  }

  function renderResults() {
    const all = [...results.values()];
    const fake = all.filter((r) => r.verdict === "Fake").length;
    $("stat-total").textContent = all.length;
    $("stat-fake").textContent = fake;
    $("stat-real").textContent = all.length - fake;
    $("tab-count").textContent = fake ? String(fake) : "";
    $("tab").title = fake ? `${fake} fake post${fake === 1 ? "" : "s"} found` : "Show Fake Image Detector";

    const list = $("recent");
    list.replaceChildren();
    all.slice(-MAX_RECENT).reverse().forEach((r) => {
      const li = document.createElement("li");
      li.title = "Scroll to this post";
      const chip = document.createElement("span");
      chip.className = `chip ${r.verdict === "Fake" ? "fake" : "real"}`;
      chip.textContent = r.verdict === "Fake" ? "FAKE" : "REAL";
      const text = document.createElement("span");
      text.className = "text";
      text.textContent = `${r.hasMedia ? "🖼 " : ""}${r.author ? r.author + " · " : ""}${r.text || "(no text)"}`;
      const conf = document.createElement("span");
      conf.className = "conf";
      conf.textContent = `${Number(r.confidence || 0).toFixed(0)}%`;
      li.append(chip, text, conf);
      li.addEventListener("click", () => {
        findArticle(r.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      list.append(li);
    });
    $("recent-empty").hidden = all.length > 0;
  }

  // ---------- Public API for content.js (shared content-script world) ----------
  window.FIDPanel = {
    record(result) {
      if (!result?.id) return;
      results.delete(result.id); // keep newest at the end
      results.set(result.id, result);
      renderResults();
    },
    _root: root,
  };

  // ---------- Start ----------
  (async () => {
    document.documentElement.appendChild(host);
    const { panelCollapsed } = await chrome.storage.local.get("panelCollapsed").catch(() => ({}));
    setCollapsed(Boolean(panelCollapsed));
    const health = await chrome.runtime.sendMessage({ type: "CHECK_HEALTH" }).catch(() => null);
    $("offline").hidden = Boolean(health?.ok);
    await refreshAuth();
    renderResults();
  })();
})();
