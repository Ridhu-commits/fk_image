(() => {
  const BADGE_CLASS = "fake-detector-injected-badge";
  const DEFAULT_ACCOUNT_AGE_DAYS = 365;

  // Helper: Parse numerical counts with K, M, B multipliers (e.g., "1.2K" -> 1200)
  function parseCount(value) {
    if (!value) return 0;
    const normalized = String(value).replace(/,/g, "").trim();
    const match = normalized.match(/([\d.]+)\s*([KMB])?/i);
    if (!match) return 0;

    const num = parseFloat(match[1]);
    if (isNaN(num)) return 0;

    const unit = match[2] ? match[2].toUpperCase() : null;
    const multipliers = { K: 1_000, M: 1_000_000, B: 1_000_000_000 };
    return Math.round(num * (multipliers[unit] || 1));
  }

  // Helper: Find the primary post article on the page
  function getPostArticle() {
    const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
    const statusId = location.pathname.match(/\/status\/(\d+)/)?.[1];
    if (statusId) {
      const matchingArticle = articles.find((article) =>
        [...article.querySelectorAll('a[href*="/status/"]')].some((link) =>
          link.href.includes(`/status/${statusId}`)
        )
      );
      if (matchingArticle) return matchingArticle;
    }
    return articles[0] ?? null;
  }

  // 1. Feature Extraction: Verified Status
  function extractVerified(article) {
    if (!article) return 0.0;
    const verifiedIcon = article.querySelector(
      'svg[data-testid="icon-verified"], svg[aria-label*="Verified" i], [data-testid="User-Name"] svg[aria-label*="verified" i]'
    );
    return verifiedIcon ? 1.0 : 0.0;
  }

  // 2. Feature Extraction: Reply Count
  function extractReplyCount(article) {
    if (!article) return 0.0;
    const replyBtn = article.querySelector('[data-testid="reply"]');
    if (replyBtn) {
      const text = replyBtn.innerText || replyBtn.getAttribute("aria-label") || "";
      const count = parseCount(text);
      if (count > 0) return count;
    }
    const match = article.innerText.match(/([\d,.]+\s*[KMB]?)\s+(?:replies|reply)\b/i);
    return parseCount(match?.[1]);
  }

  // 3. Feature Extraction: Retweet / Repost Count
  function extractRetweetCount(article) {
    if (!article) return 0.0;
    const retweetBtn = article.querySelector('[data-testid="retweet"]');
    if (retweetBtn) {
      const text = retweetBtn.innerText || retweetBtn.getAttribute("aria-label") || "";
      const count = parseCount(text);
      if (count > 0) return count;
    }
    const match = article.innerText.match(/([\d,.]+\s*[KMB]?)\s+(?:reposts?|retweets?)\b/i);
    return parseCount(match?.[1]);
  }

  // 4. Feature Extraction: Like Count
  function extractLikeCount(article) {
    if (!article) return 0.0;
    const likeBtn = article.querySelector('[data-testid="like"]');
    if (likeBtn) {
      const text = likeBtn.innerText || likeBtn.getAttribute("aria-label") || "";
      const count = parseCount(text);
      if (count > 0) return count;
    }
    const match = article.innerText.match(/([\d,.]+\s*[KMB]?)\s+likes?\b/i);
    return parseCount(match?.[1]);
  }

  // 5. Feature Extraction: Tweet Main Text
  function extractTweetText(article) {
    if (!article) return "";
    const textEl = article.querySelector('[data-testid="tweetText"]');
    return textEl ? textEl.innerText.trim() : "";
  }

  // 6. Feature Extraction: User Follower Count & Account Age
  function extractFollowerCount() {
    const match = document.body.innerText.match(/([\d,.]+\s*[KMB]?)\s+Followers\b/i);
    return parseCount(match?.[1]);
  }

  function extractAccountAgeDays() {
    const joined = document.body.innerText.match(/Joined\s+([A-Za-z]+\s+\d{4})/i)?.[1];
    if (!joined) return DEFAULT_ACCOUNT_AGE_DAYS;
    const joinedDate = new Date(`${joined} 1`);
    if (isNaN(joinedDate.getTime())) return DEFAULT_ACCOUNT_AGE_DAYS;
    return Math.max(0, Math.floor((Date.now() - joinedDate.getTime()) / 86_400_000));
  }

  // 7. Feature Extraction: Comment Texts (Thread Replies)
  // Replies only exist on a post's own page (/status/<id>), below the focal tweet.
  // On the home feed the other tweets are unrelated posts, so they must not be
  // sent as "comments" — the model would then judge them instead of this post.
  function isFocalArticle(article) {
    const statusId = location.pathname.match(/\/status\/(\d+)/)?.[1];
    return Boolean(statusId && article && getPostArticle() === article);
  }

  function extractComments(mainArticle) {
    if (!isFocalArticle(mainArticle)) return [];
    const allArticles = [...document.querySelectorAll('article[data-testid="tweet"]')];
    return allArticles
      .filter((article) =>
        article !== mainArticle &&
        Boolean(mainArticle.compareDocumentPosition(article) & Node.DOCUMENT_POSITION_FOLLOWING)
      )
      .map((article) => article.querySelector('[data-testid="tweetText"]')?.innerText?.trim())
      .filter((text) => Boolean(text && text.length > 0));
  }

  // Build Full Payload aligned with Model & API
  function extractPayload(customArticle = null) {
    const article = customArticle || getPostArticle();
    if (!article) {
      throw new Error("Could not locate a post on this page. Please open an X/Twitter post.");
    }

    const statusLink = article.querySelector('a[href*="/status/"]');
    const statusMatch = (statusLink?.href || location.pathname).match(/\/status\/(\d+)/);
    const postId = statusMatch ? statusMatch[1] : (location.pathname.match(/\/status\/(\d+)/)?.[1] || "unknown_post");

    const tweetTime = article.querySelector("time[datetime]")?.dateTime || new Date().toISOString();
    const tweetText = extractTweetText(article);
    const comments = extractComments(article);

    return {
      tweet_id: postId,
      propagation_data: {
        verified: extractVerified(article),
        reply_count: extractReplyCount(article),
        retweet_count: extractRetweetCount(article),
        like_count: extractLikeCount(article),
        follower_count: extractFollowerCount(),
        account_age: extractAccountAgeDays(),
        timestamp: tweetTime,
      },
      tweet_text: tweetText,
      comments: comments,
    };
  }

  // ============================================================
  // IN-PAGE BADGE OVERLAY SYSTEM
  // ============================================================
  function injectBadgeOnArticle(article) {
    if (!article || article.querySelector(`.${BADGE_CLASS}`)) return;

    // Find the action bar (where reply, retweet, like buttons live)
    const actionBar = article.querySelector('[role="group"]') || article.querySelector('[data-testid="tweetText"]')?.parentElement;
    if (!actionBar) return;

    const badgeContainer = document.createElement("div");
    badgeContainer.className = BADGE_CLASS;
    badgeContainer.style.cssText = `
      display: inline-flex;
      align-items: center;
      margin: 6px 0 8px 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      position: relative;
    `;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "fid-verify-btn";
    button.innerHTML = `
      <span style="display:inline-flex;align-items:center;gap:5px;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <span>Verify Post</span>
      </span>
    `;
    button.style.cssText = `
      background: rgba(16, 185, 129, 0.12);
      color: #10b981;
      border: 1px solid rgba(16, 185, 129, 0.35);
      border-radius: 9999px;
      padding: 4px 10px;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      transition: all 180ms ease;
      outline: none;
    `;

    button.addEventListener("mouseover", () => {
      button.style.background = "rgba(16, 185, 129, 0.22)";
      button.style.borderColor = "rgba(16, 185, 129, 0.6)";
    });
    button.addEventListener("mouseout", () => {
      button.style.background = "rgba(16, 185, 129, 0.12)";
      button.style.borderColor = "rgba(16, 185, 129, 0.35)";
    });

    button.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (badgeContainer.dataset.state === "login") {
        chrome.runtime.sendMessage({ type: "OPEN_LOGIN" }).catch(() => {});
        return;
      }
      verifyArticle(article);
    });

    badgeContainer.appendChild(button);
    actionBar.parentElement.insertBefore(badgeContainer, actionBar);
    autoCheckObserver.observe(article);
  }

  function setButtonState(container, state, label, title = "") {
    const button = container.querySelector(".fid-verify-btn");
    container.dataset.state = state;
    if (!button) return;
    const colors = {
      idle: ["#10b981", "rgba(16, 185, 129, 0.35)"],
      checking: ["#10b981", "rgba(16, 185, 129, 0.35)"],
      login: ["#06b6d4", "rgba(6, 182, 212, 0.4)"],
      error: ["#ef4444", "rgba(239, 68, 68, 0.4)"],
    }[state];
    button.innerText = label;
    button.title = title;
    button.disabled = state === "checking";
    button.style.opacity = state === "checking" ? "0.75" : "1";
    button.style.color = colors[0];
    button.style.borderColor = colors[1];
  }

  // Analyze one post and show the verdict badge on it (used by auto-scan and by clicks)
  async function verifyArticle(article) {
    const container = article.querySelector(`.${BADGE_CLASS}`);
    if (!container || container.dataset.state === "checking" || container.dataset.state === "done") return;

    setButtonState(container, "checking", "Analyzing post…");
    try {
      const payload = extractPayload(article);
      const response = await chrome.runtime.sendMessage({ type: "PREDICT", payload });

      if (response?.authRequired) {
        setButtonState(container, "login", "Log in to see verdict", response.error);
        return;
      }
      if (!response || !response.ok) {
        throw new Error(response?.error || "Analysis failed");
      }

      container.dataset.state = "done";
      renderVerdictBadge(container, response.data);
      markMedia(article, response.data);
      window.FIDPanel?.record({
        id: payload.tweet_id,
        verdict: response.data.verdict,
        confidence: response.data.confidence,
        author: article.querySelector('[data-testid="User-Name"]')?.innerText.match(/@\w+/)?.[0] || "",
        text: payload.tweet_text.slice(0, 120),
        hasMedia: Boolean(article.querySelector(MEDIA_SELECTOR)),
      });
    } catch (err) {
      setButtonState(container, "error", "Retry verification", err.message || "Analysis failed");
    }
  }

  // ============================================================
  // AUTO-CHECK WHILE SCROLLING
  // ============================================================
  const MAX_PARALLEL_CHECKS = 2;
  const FOCAL_POST_DELAY_MS = 1500; // let replies load before judging the main post
  const checkQueue = [];
  let activeChecks = 0;

  function runQueue() {
    while (activeChecks < MAX_PARALLEL_CHECKS && checkQueue.length) {
      const article = checkQueue.shift();
      if (!article.isConnected) continue;
      activeChecks += 1;
      verifyArticle(article).finally(() => {
        activeChecks -= 1;
        runQueue();
      });
    }
  }

  function queueCheck(article) {
    if (article.dataset.fidQueued) return;
    article.dataset.fidQueued = "1";
    const delay = isFocalArticle(article) ? FOCAL_POST_DELAY_MS : 0;
    setTimeout(() => {
      checkQueue.push(article);
      runQueue();
    }, delay);
  }

  const autoCheckObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        autoCheckObserver.unobserve(entry.target);
        queueCheck(entry.target);
      });
    },
    { threshold: 0.4 }
  );

  // ============================================================
  // VERDICT LABELS ON IMAGES / VIDEOS
  // ============================================================
  const MEDIA_SELECTOR = '[data-testid="tweetPhoto"], [data-testid="videoPlayer"]';
  const MEDIA_CHIP_CLASS = "fid-media-chip";

  function markMedia(article, data) {
    const isReal = data.verdict === "Real";
    const color = isReal ? "#10b981" : "#ef4444";
    const label = `${isReal ? "✓ REAL" : "⚠ FAKE"} ${Number(data.confidence || 0).toFixed(0)}%`;

    article.querySelectorAll(MEDIA_SELECTOR).forEach((media) => {
      media.querySelector(`.${MEDIA_CHIP_CLASS}`)?.remove();
      if (getComputedStyle(media).position === "static") media.style.position = "relative";
      media.style.outline = `3px solid ${color}`;
      media.style.outlineOffset = "-3px";

      const chip = document.createElement("div");
      chip.className = MEDIA_CHIP_CLASS;
      chip.textContent = label;
      chip.title = "Fake Image Detector verdict for this post";
      chip.style.cssText = `
        position: absolute;
        top: 8px;
        left: 8px;
        z-index: 2;
        padding: 3px 9px;
        border-radius: 9999px;
        background: ${color};
        color: #fff;
        font: 800 11.5px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        letter-spacing: 0.3px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
        pointer-events: none;
      `;
      media.appendChild(chip);
    });
  }

  function clearAllVerdicts() {
    document.querySelectorAll(`.${MEDIA_CHIP_CLASS}`).forEach((chip) => {
      const media = chip.parentElement;
      chip.remove();
      if (media) media.style.outline = "";
    });
    document.querySelectorAll(`.${BADGE_CLASS}`).forEach((container) => {
      const article = container.closest('article[data-testid="tweet"]');
      container.remove();
      if (article) delete article.dataset.fidQueued;
    });
    scanAndInject();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !("auth" in changes)) return;

    // Logged out: hide every verdict until the user logs in again
    if (!changes.auth.newValue) {
      clearAllVerdicts();
      return;
    }

    // Logged in: check the posts that were waiting for login
    document.querySelectorAll(`.${BADGE_CLASS}[data-state="login"]`).forEach((container) => {
      const article = container.closest('article[data-testid="tweet"]');
      if (!article) return;
      setButtonState(container, "idle", "Verify Post");
      delete article.dataset.fidQueued;
      queueCheck(article);
    });
  });

  function renderVerdictBadge(container, data) {
    const isReal = data.verdict === "Real";
    const conf = Number(data.confidence || 0).toFixed(1);
    const themeColor = isReal ? "#10b981" : "#ef4444";
    const bgGrad = isReal
      ? "linear-gradient(135deg, rgba(16, 185, 129, 0.16), rgba(6, 95, 70, 0.14))"
      : "linear-gradient(135deg, rgba(239, 68, 68, 0.16), rgba(153, 27, 27, 0.14))";

    container.innerHTML = `
      <div style="display:inline-flex; align-items:center; gap:6px; background:${bgGrad}; border:1px solid ${themeColor}66; border-radius:9999px; padding:4px 12px; font-size:12px; font-weight:700; color:${themeColor}; box-shadow:0 2px 8px ${themeColor}22; cursor:pointer;" title="Click for details">
        <span>${isReal ? "🛡️ Real Content" : "⚠️ Manipulated / Fake"}</span>
        <span style="background:${themeColor}22; padding:1px 6px; border-radius:6px; font-size:11px; font-weight:600;">${conf}%</span>
      </div>
    `;

    // Tooltip popup on click
    const badgeEl = container.firstElementChild;
    badgeEl.addEventListener("click", (e) => {
      e.stopPropagation();
      let tooltip = container.querySelector(".fid-detail-card");
      if (tooltip) {
        tooltip.remove();
        return;
      }

      tooltip = document.createElement("div");
      tooltip.className = "fid-detail-card";
      tooltip.style.cssText = `
        position: absolute;
        top: 28px;
        left: 0;
        z-index: 99999;
        width: 260px;
        background: #181c24;
        border: 1px solid rgba(255,255,255,0.12);
        box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        border-radius: 10px;
        padding: 12px;
        color: #e2e8f0;
        font-size: 11.5px;
        line-height: 1.45;
      `;

      const sig = data.details?.signals || {};
      tooltip.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:6px;">
          <strong style="color:${themeColor}; font-size:12px;">AI Credibility Analysis</strong>
          <span style="font-size:10px; color:#94a3b8;">Joint Bi-LSTM</span>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:8px;">
          <div>Likes: <strong style="color:#fff;">${sig.like_count ?? 0}</strong></div>
          <div>Reposts: <strong style="color:#fff;">${sig.retweet_count ?? 0}</strong></div>
          <div>Replies: <strong style="color:#fff;">${sig.reply_count ?? 0}</strong></div>
          <div>Verified: <strong style="color:${sig.verified ? '#10b981' : '#94a3b8'};">${sig.verified ? 'Yes' : 'No'}</strong></div>
        </div>
        <div style="color:#94a3b8; font-size:10.5px;">
          Comments Analyzed: <span style="color:#fff;">${data.details?.comments_analyzed ?? 0}</span>
        </div>
      `;

      container.appendChild(tooltip);
      document.addEventListener("click", () => tooltip?.remove(), { once: true });
    });
  }

  // Scan and inject badges onto visible tweets
  function scanAndInject() {
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    articles.forEach((article) => injectBadgeOnArticle(article));
  }

  // Observe dynamically loaded tweets on scroll
  const observer = new MutationObserver(() => {
    scanAndInject();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Initial scan after document loads
  scanAndInject();

  // Listen for messages from extension popup
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "GET_PAGE_INFO") {
      try {
        const article = getPostArticle();
        const tweetText = extractTweetText(article);
        const postId = location.pathname.match(/\/status\/(\d+)/)?.[1] || null;
        sendResponse({
          ok: true,
          data: {
            hasPost: Boolean(article),
            postId: postId,
            textSnippet: tweetText.slice(0, 100),
            commentsFound: extractComments(article).length,
          },
        });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
      return true;
    }

    if (message?.type === "CHECK_POST") {
      (async () => {
        try {
          const article = getPostArticle();
          const payload = extractPayload(article);
          const result = await chrome.runtime.sendMessage({ type: "PREDICT", payload });

          // Also update in-page badge if article exists
          if (article && result?.ok && result.data) {
            let container = article.querySelector(`.${BADGE_CLASS}`);
            if (container) {
              renderVerdictBadge(container, result.data);
            }
          }

          sendResponse(result);
        } catch (error) {
          sendResponse({ ok: false, error: error.message || "Could not analyze this post." });
        }
      })();
      return true;
    }

    return undefined;
  });
})();