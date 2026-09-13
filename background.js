// background.js — Lead Snapper service worker

chrome.runtime.onInstalled.addListener(() => {
  console.log("Lead Snapper installed.");
});

// ── Message Router ────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // ── Webhook POST ────────────────────────────────────────────────
  if (message.action === "postWebhook") {
    const { url, data, apiKey } = message;
    const headers = { "Content-Type": "application/json" };
    const keyToUse = apiKey || data?.apiKey || "snapper_webhook_secret_key_2026";
    if (keyToUse) {
      headers["x-api-key"] = keyToUse;
    }

    fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(data)
    })
      .then(async (res) => {
        const text = await res.text();
        sendResponse({ success: res.ok, status: res.status, body: text });
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
    return true; // async response
  }

  // ── Google Identity: Get Auth Token ─────────────────────────────
  // Used by firebase-service.js to obtain a Google OAuth token.
  // chrome.identity.getAuthToken MUST be called from a background
  // service worker (not from popup) in Chrome extensions.
  if (message.action === "getAuthToken") {
    const interactive = message.interactive !== false; // default true
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ token });
      }
    });
    return true; // async response
  }

  // ── Google Identity: Remove Cached Token (Sign Out) ─────────────
  if (message.action === "removeAuthToken") {
    const token = message.token;
    if (!token) { sendResponse({ success: true }); return true; }

    // 1. Remove from Chrome's cache
    chrome.identity.removeCachedAuthToken({ token }, () => {
      // 2. Revoke from Google's servers so user is fully signed out
      fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`)
        .catch(() => {}) // best effort
        .finally(() => sendResponse({ success: true }));
    });
    return true; // async response
  }

});
