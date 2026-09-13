// popup.js — Lead Snapper

const STORAGE_KEY = "leadsnapper_leads";
const SETTINGS_KEY = "leadsnapper_settings";
const MAPS_KEY    = "leadsnapper_maps_leads";

// ── State ─────────────────────────────────────────────────────────
let leads = [];
let currentLead = null;
let settings = { webhookUrl: "", autoPost: false };

// Maps scraper state
let mapsLeads = [];
let mapsPageCount = 0;
let mapsLastBatchCount = 0;

// Auth state
let currentUser = null;

// ── DOM refs — Snap Lead tab ──────────────────────────────────────
const snapBtn = document.getElementById("snapBtn");
const snapIdle = document.getElementById("snapIdle");
const snapLoading = document.getElementById("snapLoading");
const leadForm = document.getElementById("leadForm");
const settingsBtn = document.getElementById("settingsBtn");
const settingsPanel = document.getElementById("settingsPanel");
const webhookUrlInput = document.getElementById("webhookUrl");
const webhookApiKeyInput = document.getElementById("webhookApiKey");
const autoPostInput = document.getElementById("autoPost");
const saveSettingsBtn = document.getElementById("saveSettings");
const siteUrl = document.getElementById("siteUrl");
const resnapBtn = document.getElementById("resnapBtn");
const addToCsvBtn = document.getElementById("addToCsvBtn");
const postBtn = document.getElementById("postBtn");
const statusMsg = document.getElementById("statusMsg");
const countBadge = document.getElementById("countBadge");
const leadCount = document.getElementById("leadCount");
const leadsTray = document.getElementById("leadsTray");
const trayCount = document.getElementById("trayCount");
const leadsList = document.getElementById("leadsList");
const clearAllBtn = document.getElementById("clearAllBtn");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const syncTrayBtn = document.getElementById("syncTrayBtn");

// Field refs
const fields = {
  name: document.getElementById("f-name"),
  email: document.getElementById("f-email"),
  phone: document.getElementById("f-phone"),
  address: document.getElementById("f-address"),
  desc: document.getElementById("f-desc"),
  note: document.getElementById("f-note"),
};

// ── DOM refs — Maps tab ───────────────────────────────────────────
const tabSnap = document.getElementById("tabSnap");
const tabMaps = document.getElementById("tabMaps");
const panelSnap = document.getElementById("panelSnap");
const panelMaps = document.getElementById("panelMaps");
const mapsScrapeBtn = document.getElementById("mapsScrapeBtn");
const mapsScrapeLabel = document.getElementById("mapsScrapeLabel");
const mapsClearBtn = document.getElementById("mapsClearBtn");
const mapsLoading = document.getElementById("mapsLoading");
const mapsProgressFill = document.getElementById("mapsProgressFill");
const mapsLoadingText = document.getElementById("mapsLoadingText");
const mapsStatusMsg = document.getElementById("mapsStatusMsg");
const mapsPreview = document.getElementById("mapsPreview");
const mapsLeadsList = document.getElementById("mapsLeadsList");
const mapsExportBtn = document.getElementById("mapsExportBtn");
const mapsExportCount = document.getElementById("mapsExportCount");
const mapsLeadCountEl = document.getElementById("mapsLeadCount");
const mapsPageCountEl = document.getElementById("mapsPageCount");
const mapsNewCountEl  = document.getElementById("mapsNewCount");

// ── DOM refs — Auth ───────────────────────────────────────────────
const googleSignInBtn     = document.getElementById("googleSignInBtn");
const authUser            = document.getElementById("authUser");
const authAvatar          = document.getElementById("authAvatar");
const authName            = document.getElementById("authName");
const authAvatarBtn       = document.getElementById("authAvatarBtn");
const authDropdown        = document.getElementById("authDropdown");
const authDropdownAvatar  = document.getElementById("authDropdownAvatar");
const authDropdownName    = document.getElementById("authDropdownName");
const authDropdownEmail   = document.getElementById("authDropdownEmail");
const syncPill            = document.getElementById("syncPill");
const syncLabel           = document.getElementById("syncLabel");
const signOutBtn          = document.getElementById("signOutBtn");
const syncNowBtn          = document.getElementById("syncNowBtn");
const pullCloudBtn        = document.getElementById("pullCloudBtn");

// ── DOM refs — Auth Modal ─────────────────────────────────────────
const authModal           = document.getElementById("authModal");
const authModalTitle      = document.getElementById("authModalTitle");
const authModalClose      = document.getElementById("authModalClose");
const emailAuthForm       = document.getElementById("emailAuthForm");
const authEmail           = document.getElementById("authEmail");
const authPassword        = document.getElementById("authPassword");
const authModalError      = document.getElementById("authModalError");
const emailAuthSubmitBtn  = document.getElementById("emailAuthSubmitBtn");

// ── Init ──────────────────────────────────────────────────────────
async function init() {
  const stored = await chrome.storage.local.get([STORAGE_KEY, SETTINGS_KEY, MAPS_KEY]);
  leads     = stored[STORAGE_KEY] || [];
  settings  = stored[SETTINGS_KEY] || { webhookUrl: "", apiKey: "snapper_webhook_secret_key_2026", autoPost: false };

  const mapsData = stored[MAPS_KEY] || { leads: [], pageCount: 0 };
  mapsLeads    = mapsData.leads || [];
  mapsPageCount = mapsData.pageCount || 0;

  if (webhookUrlInput) webhookUrlInput.value = settings.webhookUrl || "";
  if (webhookApiKeyInput) webhookApiKeyInput.value = settings.apiKey || "snapper_webhook_secret_key_2026";
  if (autoPostInput) autoPostInput.checked = !!settings.autoPost;

  updateBadge();
  renderTray();
  renderMapsStats();
  renderMapsPreview();
  updateMapsExportBtn();

  // ── Firebase init & auth listener ─────────────────────────────
  try {
    firebaseService.init(FIREBASE_CONFIG);
    firebaseService.onAuthStateChanged(async (user) => {
      currentUser = user;
      renderAuthUI(user);
      if (user) {
        closeAuthModal();
        // Auto-sync local leads to cloud on sign-in
        await autoSync();
      }
    });
  } catch (e) {
    console.warn("Firebase init failed:", e.message);
  }
}

// ══════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════

// ── Open / Close Auth Modal ───────────────────────────────────────
googleSignInBtn.addEventListener("click", () => {
  openAuthModal();
});

authModalClose.addEventListener("click", () => {
  closeAuthModal();
});

authModal.addEventListener("click", (e) => {
  if (e.target === authModal) closeAuthModal();
});

function openAuthModal() {
  hideAuthModalError();
  authModal.classList.remove("hidden");
}

function closeAuthModal() {
  if (authModal) authModal.classList.add("hidden");
  if (authEmail) authEmail.value = "";
  if (authPassword) authPassword.value = "";
  hideAuthModalError();
}

function showAuthModalError(msg) {
  if (!authModalError) return;
  authModalError.textContent = msg;
  authModalError.classList.remove("hidden");
}

function hideAuthModalError() {
  if (!authModalError) return;
  authModalError.classList.add("hidden");
  authModalError.textContent = "";
}

// ── Email Sign In ─────────────────────────────────────────────────
if (emailAuthForm) {
  emailAuthForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = authEmail ? authEmail.value.trim() : "";
    const password = authPassword ? authPassword.value : "";

    if (!email || !password) {
      showAuthModalError("Please provide both email and password.");
      return;
    }

    if (emailAuthSubmitBtn) {
      emailAuthSubmitBtn.disabled = true;
      emailAuthSubmitBtn.textContent = "Signing in…";
    }
    hideAuthModalError();

    try {
      await firebaseService.signInWithEmail(email, password);
      showStatus("✓ Signed in successfully!", "success");
      closeAuthModal();
    } catch (err) {
      console.error("Email auth error:", err);
      let msg = err.message || "Authentication failed.";
      if (err.code === "auth/invalid-email") {
        msg = "Invalid email format.";
      } else if (
        err.code === "auth/user-not-found" ||
        err.code === "auth/wrong-password" ||
        err.code === "auth/invalid-credential"
      ) {
        msg = "Incorrect email or password. Please check your credentials.";
      }
      showAuthModalError(msg);
    } finally {
      if (emailAuthSubmitBtn) {
        emailAuthSubmitBtn.disabled = false;
        emailAuthSubmitBtn.textContent = "Sign In";
      }
    }
  });
}

// ── Sign Out ──────────────────────────────────────────────────────
signOutBtn.addEventListener("click", async () => {
  closeDropdown();
  await firebaseService.signOut();
  // onAuthStateChanged fires → renderAuthUI(null)
});

// ── Dropdown toggle ───────────────────────────────────────────────
authAvatarBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  authDropdown.classList.toggle("hidden");
});

document.addEventListener("click", (e) => {
  if (!authDropdown.contains(e.target) && e.target !== authAvatarBtn) {
    closeDropdown();
  }
});

function closeDropdown() {
  authDropdown.classList.add("hidden");
}

// ── Sync Now (manual) ────────────────────────────────────────────
syncNowBtn.addEventListener("click", async () => {
  closeDropdown();
  await autoSync(true);
});

// ── Pull from Cloud ───────────────────────────────────────────────
pullCloudBtn.addEventListener("click", async () => {
  closeDropdown();
  if (!currentUser) return;
  setSyncState("syncing", "Pulling…");
  try {
    // Fetch cloud leads
    const [cloudSnap, cloudMaps] = await Promise.all([
      firebaseService.fetchLeadsFromFirestore("snap"),
      firebaseService.fetchLeadsFromFirestore("maps")
    ]);

    // Merge cloud → local (cloud wins for matching keys)
    if (cloudSnap.length > 0) {
      const existing = new Set(leads.map(l => l.url || l.businessName));
      const newOnes  = cloudSnap.filter(l => !existing.has(l.url || l.businessName));
      leads = [...newOnes, ...leads];
      await chrome.storage.local.set({ [STORAGE_KEY]: leads });
      updateBadge();
      renderTray();
    }

    if (cloudMaps.length > 0) {
      const existing = new Set(mapsLeads.map(l => l.placeId || l.name));
      const newOnes  = cloudMaps.filter(l => !existing.has(l.placeId || l.name));
      mapsLeads = [...newOnes, ...mapsLeads];
      await chrome.storage.local.set({ [MAPS_KEY]: { leads: mapsLeads, pageCount: mapsPageCount } });
      renderMapsStats();
      renderMapsPreview();
      updateMapsExportBtn();
    }

    const total = cloudSnap.length + cloudMaps.length;
    setSyncState("synced", "Synced");
    showStatus(`✓ Pulled ${total} lead${total !== 1 ? "s" : ""} from cloud.`, "success");
  } catch (err) {
    setSyncState("error", "Error");
    showStatus("✗ Pull failed: " + err.message, "error");
  }
});

// ── Render Auth UI ────────────────────────────────────────────────
function renderAuthUI(user) {
  if (user) {
    // Signed in
    if (googleSignInBtn) googleSignInBtn.classList.add("hidden");
    if (authUser) authUser.classList.remove("hidden");

    const defaultAvatar = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23d4f04e'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
    const avatar = user.photoURL || defaultAvatar;
    const name   = (user.displayName || user.email || "User").split("@")[0].split(" ")[0];
    const email  = user.email || "";

    if (authAvatar) authAvatar.src         = avatar;
    if (authName) authName.textContent   = name;
    if (authDropdownAvatar) authDropdownAvatar.src = avatar;
    if (authDropdownName) authDropdownName.textContent  = user.displayName || name;
    if (authDropdownEmail) authDropdownEmail.textContent = email;

    setSyncState("synced", "Synced");
  } else {
    // Signed out
    if (googleSignInBtn) {
      googleSignInBtn.classList.remove("hidden");
      googleSignInBtn.disabled = false;
      googleSignInBtn.textContent = "Sign in";
    }
    if (authUser) authUser.classList.add("hidden");
    closeDropdown();
  }
}

// ── Sync helpers ──────────────────────────────────────────────────
function setSyncState(state, label) {
  syncPill.className  = `sync-pill ${state}`;
  syncLabel.textContent = label;
}

async function autoSync(showFeedback = false) {
  if (!currentUser) return;
  setSyncState("syncing", "Syncing…");
  try {
    await Promise.all([
      firebaseService.syncLeadsToFirestore(leads, "snap"),
      firebaseService.syncLeadsToFirestore(mapsLeads, "maps")
    ]);
    setSyncState("synced", "Synced");
    if (showFeedback) showStatus(`✓ All leads synced to cloud.`, "success");
  } catch (err) {
    setSyncState("error", "Sync error");
    if (showFeedback) showStatus("✗ Sync failed: " + err.message, "error");
  }
}

async function syncOneLead(lead, type) {
  if (!currentUser) return;
  try {
    setSyncState("syncing", "Syncing…");
    await firebaseService.syncLeadsToFirestore([lead], type);
    setSyncState("synced", "Synced");
  } catch {
    setSyncState("error", "Sync error");
  }
}

// ══════════════════════════════════════════════════════════════════
// TAB SWITCHING
// ══════════════════════════════════════════════════════════════════
tabSnap.addEventListener("click", () => switchTab("snap"));
tabMaps.addEventListener("click", () => switchTab("maps"));

function switchTab(tab) {
  if (tab === "snap") {
    tabSnap.classList.add("active");
    tabMaps.classList.remove("active");
    panelSnap.classList.remove("hidden");
    panelMaps.classList.add("hidden");
  } else {
    tabMaps.classList.add("active");
    tabSnap.classList.remove("active");
    panelMaps.classList.remove("hidden");
    panelSnap.classList.add("hidden");
    // Close settings when switching to Maps
    settingsPanel.classList.add("hidden");
    settingsBtn.classList.remove("active");
  }
}

// ── Settings ──────────────────────────────────────────────────────
settingsBtn.addEventListener("click", () => {
  // Settings only relevant for Snap tab — switch to it if needed
  if (!panelSnap.classList.contains("hidden") === false) switchTab("snap");
  const isHidden = settingsPanel.classList.contains("hidden");
  settingsPanel.classList.toggle("hidden", !isHidden);
  settingsBtn.classList.toggle("active", isHidden);
});

saveSettingsBtn.addEventListener("click", async () => {
  settings.webhookUrl = webhookUrlInput ? webhookUrlInput.value.trim() : "";
  settings.apiKey = webhookApiKeyInput ? webhookApiKeyInput.value.trim() : "snapper_webhook_secret_key_2026";
  settings.autoPost = autoPostInput ? autoPostInput.checked : false;
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  showStatus("Settings saved", "info");
  settingsPanel.classList.add("hidden");
  settingsBtn.classList.remove("active");
});

// ── Snap ──────────────────────────────────────────────────────────
snapBtn.addEventListener("click", doSnap);
resnapBtn.addEventListener("click", doSnap);

async function doSnap() {
  snapIdle.classList.add("hidden");
  leadForm.classList.add("hidden");
  snapLoading.classList.remove("hidden");
  hideStatus();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { action: "scrape" });
    } catch (e) {
      throw new Error("Cannot scrape this page. Try a regular website.");
    }

    if (!response || !response.success) {
      throw new Error(response?.error || "Failed to extract data");
    }

    currentLead = response.data;
    currentLead.tabTitle = tab.title || "";
    currentLead.favIconUrl = tab.favIconUrl || "";

    populateForm(currentLead);

    snapLoading.classList.add("hidden");
    leadForm.classList.remove("hidden");

    if (settings.autoPost && settings.webhookUrl) {
      await doPostWebhook(false);
    }

  } catch (err) {
    snapLoading.classList.add("hidden");
    snapIdle.classList.remove("hidden");
    showStatus("⚠ " + err.message, "error");
  }
}

function populateForm(data) {
  const domain = (() => {
    try { return new URL(data.url).hostname; } catch { return data.url; }
  })();
  siteUrl.textContent = domain;

  fields.name.value = data.businessName || data.name || "";
  fields.email.value = data.email || "";
  fields.phone.value = data.phone || "";
  fields.address.value = data.address || "";
  fields.desc.value = data.description || "";
  fields.note.value = data.note || "";
}

function readForm() {
  const bizName = fields.name.value.trim();
  const emailVal = fields.email.value.trim();
  const phoneVal = fields.phone.value.trim();
  const addrVal = fields.address.value.trim();
  const descVal = fields.desc.value.trim();
  const noteVal = fields.note.value.trim();

  return {
    ...currentLead,
    userId:       currentUser?.uid || "",
    name:         currentLead?.contactName || bizName,
    businessName: bizName,
    email:        emailVal,
    phone:        phoneVal,
    address:      addrVal,
    description:  descVal,
    note:         noteVal,
    source:       "Lead Snapper Extension",
    status:       "New",
    industry:     currentLead?.category || "",
    challenge:    noteVal || descVal,
    url:          currentLead?.url || window.location.href,
    scrapedAt:    currentLead?.scrapedAt || new Date().toISOString()
  };
}

function formatWebhookPayload(lead) {
  const TOP_LEVEL_MODEL_KEYS = new Set([
    "id",
    "userId",
    "businessName",
    "challenge",
    "createdAt",
    "email",
    "industry",
    "name",
    "phone",
    "countryCode",
    "revenue",
    "source",
    "status",
    "website",
    "address",
    "templateId",
    "templateName"
  ]);

  const bizName = lead.businessName || lead.name || "";
  const contactName = lead.contactName || lead.name || bizName;

  const topLevel = {
    userId:       currentUser?.uid || lead.userId || "",
    name:         contactName,
    businessName: bizName,
    email:        lead.email || "",
    phone:        lead.phone || "",
    website:      lead.website || lead.url || "",
    address:      lead.address || "",
    source:       lead.source || "Lead Snapper Extension",
    status:       lead.status || "New",
    industry:     lead.industry || lead.category || "",
    challenge:    lead.challenge || lead.note || lead.description || ""
  };

  const customFields = {};
  for (const [key, val] of Object.entries(lead)) {
    if (!TOP_LEVEL_MODEL_KEYS.has(key) && val !== undefined && val !== null && val !== "") {
      customFields[key] = val;
    }
  }

  return {
    ...topLevel,
    customFields
  };
}

// ── Add to CSV (in-memory storage) ───────────────────────────────
addToCsvBtn.addEventListener("click", async () => {
  if (!currentLead) return;
  const lead = readForm();

  const exists = leads.some(l => l.url === lead.url);
  if (exists) {
    const idx = leads.findIndex(l => l.url === lead.url);
    leads[idx] = lead;
    showStatus("✓ Lead updated in list", "success");
  } else {
    leads.unshift(lead);
    showStatus("✓ Added to CSV list", "success");
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: leads });
  updateBadge();
  renderTray();

  // Directly sync lead to Firebase Firestore
  if (currentUser) {
    await syncOneLead(lead, "snap");
  }
});

// ── Post Webhook ──────────────────────────────────────────────────
postBtn.addEventListener("click", () => doPostWebhook(true));

async function doPostWebhook(showFeedback = true) {
  const url = settings.webhookUrl;
  if (!url) {
    showStatus("⚠ Set a webhook URL in settings", "error");
    if (!settingsPanel.classList.contains("hidden") === false) {
      settingsPanel.classList.remove("hidden");
      settingsBtn.classList.add("active");
    }
    return;
  }

  const rawLead = readForm();
  const leadPayload = formatWebhookPayload(rawLead);
  const apiKey = settings.apiKey || "snapper_webhook_secret_key_2026";

  postBtn.disabled = true;
  postBtn.textContent = "Posting…";

  try {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "postWebhook", url, apiKey, data: leadPayload }, resolve);
    });

    if (response?.success) {
      if (showFeedback) showStatus("✓ Posted to webhook successfully", "success");
    } else {
      throw new Error(response?.error || `Status ${response?.status}`);
    }
  } catch (err) {
    if (showFeedback) showStatus("✗ Webhook failed: " + err.message, "error");
  } finally {
    postBtn.disabled = false;
    postBtn.innerHTML = '<span>↗</span> Post Webhook';
  }
}

// ── Tray & Badge ─────────────────────────────────────────────────
countBadge.addEventListener("click", () => {
  leadsTray.classList.toggle("hidden");
});

function updateBadge() {
  leadCount.textContent = leads.length;
  countBadge.classList.toggle("has-leads", leads.length > 0);
}

function renderTray() {
  trayCount.textContent = leads.length;
  leadsList.innerHTML = "";

  if (leads.length === 0) {
    leadsTray.classList.add("hidden");
    return;
  }

  leads.forEach((lead, idx) => {
    const domain = (() => {
      try { return new URL(lead.url).hostname; } catch { return lead.url; }
    })();
    const name = lead.businessName || domain || "Unnamed Lead";

    const item = document.createElement("div");
    item.className = "lead-item";
    item.innerHTML = `
      <span class="lead-item-num">${idx + 1}</span>
      <div class="lead-item-info">
        <div class="lead-item-name">${escapeHtml(name)}</div>
        <div class="lead-item-url">${escapeHtml(domain)}</div>
      </div>
      <button class="lead-item-sync" data-idx="${idx}" title="Sync lead to Firebase">☁</button>
      <button class="lead-item-del" data-idx="${idx}" title="Remove">✕</button>
    `;
    leadsList.appendChild(item);
  });

  leadsList.querySelectorAll(".lead-item-sync").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!currentUser) {
        showStatus("⚠ Please sign in to sync lead to Firebase", "error");
        openAuthModal("signin");
        return;
      }
      const idx = parseInt(btn.dataset.idx);
      const targetLead = leads[idx];
      if (!targetLead) return;
      btn.disabled = true;
      btn.textContent = "…";
      try {
        const res = await firebaseService.syncLeadsToFirestore([targetLead], "snap");
        if (res.success) {
          btn.classList.add("synced");
          btn.textContent = "✓";
          btn.title = "Synced to Firebase";
          showStatus(`✓ Synced "${targetLead.businessName || 'Lead'}" to Firebase!`, "success");
        } else {
          throw new Error(res.reason || "Sync failed");
        }
      } catch (err) {
        btn.textContent = "☁";
        showStatus("✗ Lead sync failed: " + err.message, "error");
      } finally {
        btn.disabled = false;
      }
    });
  });

  leadsList.querySelectorAll(".lead-item-del").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const idx = parseInt(e.target.dataset.idx);
      leads.splice(idx, 1);
      await chrome.storage.local.set({ [STORAGE_KEY]: leads });
      updateBadge();
      renderTray();
    });
  });
}

// ── Sync All Saved Leads to Firebase ─────────────────────────────
syncTrayBtn.addEventListener("click", async () => {
  if (!currentUser) {
    showStatus("⚠ Please sign in to sync leads to Firebase", "error");
    openAuthModal("signin");
    return;
  }
  if (leads.length === 0) return;
  syncTrayBtn.disabled = true;
  syncTrayBtn.textContent = "Syncing…";
  try {
    const res = await firebaseService.syncLeadsToFirestore(leads, "snap");
    if (res.success) {
      showStatus(`✓ Synced ${res.count} saved lead${res.count !== 1 ? "s" : ""} to Firebase!`, "success");
      setSyncState("synced", "Synced");
    } else {
      throw new Error(res.reason || "Sync failed");
    }
  } catch (err) {
    showStatus("✗ Firebase sync failed: " + err.message, "error");
    setSyncState("error", "Error");
  } finally {
    syncTrayBtn.disabled = false;
    syncTrayBtn.textContent = "☁ Sync Firebase";
  }
});

// ── Clear All (Snap) ──────────────────────────────────────────────
clearAllBtn.addEventListener("click", async () => {
  if (!confirm("Clear all saved leads?")) return;
  leads = [];
  await chrome.storage.local.set({ [STORAGE_KEY]: leads });
  updateBadge();
  renderTray();
});

// ── Export CSV (Snap) ─────────────────────────────────────────────
exportCsvBtn.addEventListener("click", () => {
  if (leads.length === 0) return;

  const headers = ["Business Name", "Email", "Phone", "Address", "Description", "Note", "URL", "Scraped At"];
  const rows = leads.map(l => [
    l.businessName,
    l.email,
    l.phone,
    l.address,
    l.description,
    l.note,
    l.url,
    l.scrapedAt,
  ].map(csvEscape));

  const csv = [headers.map(csvEscape).join(","), ...rows.map(r => r.join(","))].join("\n");
  downloadCsv(csv, `leads_${formatDate()}.csv`);
  showStatus(`✓ Exported ${leads.length} lead${leads.length > 1 ? "s" : ""}`, "success");
});


// ══════════════════════════════════════════════════════════════════
// MAPS SCRAPER
// ══════════════════════════════════════════════════════════════════

mapsScrapeBtn.addEventListener("click", doMapsScrape);

async function doMapsScrape() {
  // Check we're on Google Maps
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab.url || "";

  if (!url.includes("google.com/maps") && !url.includes("maps.google.")) {
    showMapsStatus("⚠ Please navigate to Google Maps first, then press Scrape.", "error");
    return;
  }

  // UI: loading state
  setMapsScraping(true);
  hideMapsStatus();

  // Animate progress bar
  let prog = 0;
  const progInterval = setInterval(() => {
    prog = Math.min(prog + Math.random() * 18, 85);
    mapsProgressFill.style.width = prog + "%";
  }, 200);

  mapsLoadingText.textContent = "Scanning listings…";

  try {
    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { action: "scrapeGoogleMaps" });
    } catch (e) {
      throw new Error("Cannot reach the page. Make sure you're on a standard Google Maps results page.");
    }

    if (!response || !response.success) {
      throw new Error(response?.error || "Failed to extract listings from Google Maps.");
    }

    const newLeads = response.leads || [];

    // Complete progress bar
    clearInterval(progInterval);
    mapsProgressFill.style.width = "100%";
    mapsLoadingText.textContent = `Found ${newLeads.length} listing${newLeads.length !== 1 ? "s" : ""}…`;

    await new Promise(r => setTimeout(r, 500));

    // Merge & deduplicate into session
    const beforeCount = mapsLeads.length;
    mergeMapLeads(newLeads);
    const added = mapsLeads.length - beforeCount;

    mapsPageCount++;
    mapsLastBatchCount = added;

    // Persist session
    await chrome.storage.local.set({
      [MAPS_KEY]: { leads: mapsLeads, pageCount: mapsPageCount }
    });

    // Update UI
    renderMapsStats();
    renderMapsPreview(newLeads.map(l => l.name));
    updateMapsExportBtn();

    // ── Sync new Maps leads to Firebase (silent, background) ──────
    if (added > 0) autoSync();

    if (added === 0 && newLeads.length > 0) {
      showMapsStatus(`ℹ All ${newLeads.length} listings already in session (scroll for more).`, "info");
    } else if (added > 0) {
      showMapsStatus(`✓ Added ${added} new lead${added !== 1 ? "s" : ""}${newLeads.length - added > 0 ? ` (${newLeads.length - added} duplicates skipped)` : ""}.`, "success");
    } else {
      showMapsStatus("⚠ No listings were found. Scroll down and try again.", "error");
    }

  } catch (err) {
    clearInterval(progInterval);
    showMapsStatus("✗ " + err.message, "error");
  } finally {
    setMapsScraping(false);
    mapsProgressFill.style.width = "0%";
  }
}

function mergeMapLeads(newLeads) {
  newLeads.forEach(lead => {
    // Dedup key: placeId if available, else normalised name
    const key = lead.placeId
      ? lead.placeId
      : (lead.name || "").toLowerCase().replace(/\s+/g, "").trim();

    if (!key) return;

    const exists = mapsLeads.some(existing => {
      const eKey = existing.placeId
        ? existing.placeId
        : (existing.name || "").toLowerCase().replace(/\s+/g, "").trim();
      return eKey === key;
    });

    if (!exists) {
      mapsLeads.unshift({
        ...lead,
        userId: currentUser?.uid || ""
      }); // newest first
    }
  });
}

function setMapsScraping(active) {
  mapsScrapeBtn.disabled = active;
  mapsClearBtn.disabled = active;
  mapsLoading.classList.toggle("hidden", !active);
  mapsScrapeBtn.classList.toggle("scraping", active);
  mapsScrapeLabel.textContent = active ? "Scraping…" : "Scrape This Page";
}

function renderMapsStats() {
  animateCount(mapsLeadCountEl, parseInt(mapsLeadCountEl.textContent) || 0, mapsLeads.length);
  animateCount(mapsPageCountEl, parseInt(mapsPageCountEl.textContent) || 0, mapsPageCount);
  mapsNewCountEl.textContent = `+${mapsLastBatchCount}`;
}

function animateCount(el, from, to) {
  if (from === to) { el.textContent = to; return; }
  const step = Math.ceil(Math.abs(to - from) / 10);
  let cur = from;
  const interval = setInterval(() => {
    cur = cur < to ? Math.min(cur + step, to) : Math.max(cur - step, to);
    el.textContent = cur;
    if (cur === to) clearInterval(interval);
  }, 40);
}

function renderMapsPreview(newNames = []) {
  mapsLeadsList.innerHTML = "";

  if (mapsLeads.length === 0) {
    mapsPreview.classList.add("hidden");
    return;
  }

  mapsPreview.classList.remove("hidden");
  const newNamesSet = new Set(newNames.map(n => n?.toLowerCase().trim()));

  // Show all leads, newest first
  mapsLeads.forEach((lead, idx) => {
    const isNew = newNamesSet.has((lead.name || "").toLowerCase().trim());
    const card = document.createElement("div");
    card.className = "maps-lead-card";

    // ── Rating + Reviews row ──────────────────────────────────────
    const ratingHtml = lead.rating
      ? `<span class="maps-lead-rating">★ ${escapeHtml(lead.rating)}</span>`
      : "";
    const reviewsHtml = lead.reviewCount
      ? `<span class="maps-lead-reviews">(${escapeHtml(lead.reviewCount)} reviews)</span>`
      : "";
    const catHtml = lead.category
      ? `<span class="maps-lead-cat">${escapeHtml(lead.category)}</span>`
      : "";

    // ── Key fields rows ───────────────────────────────────────────
    const phoneHtml = lead.phone
      ? `<div class="maps-lead-field">
           <span class="maps-field-icon">📞</span>
           <span class="maps-field-val">${escapeHtml(lead.phone)}</span>
         </div>`
      : `<div class="maps-lead-field maps-field-empty">
           <span class="maps-field-icon">📞</span>
           <span class="maps-field-val empty">No phone found</span>
         </div>`;

    const emailHtml = lead.email
      ? `<div class="maps-lead-field">
           <span class="maps-field-icon">✉</span>
           <span class="maps-field-val">${escapeHtml(lead.email)}</span>
         </div>`
      : `<div class="maps-lead-field maps-field-empty">
           <span class="maps-field-icon">✉</span>
           <span class="maps-field-val empty">No email found</span>
         </div>`;

    const websiteHtml = lead.website
      ? `<div class="maps-lead-field">
           <span class="maps-field-icon">🌐</span>
           <span class="maps-field-val website">${escapeHtml(lead.website.replace(/^https?:\/\/(www\.)?/, "").split("/")[0])}</span>
         </div>`
      : `<div class="maps-lead-field maps-field-empty">
           <span class="maps-field-icon">🌐</span>
           <span class="maps-field-val empty">No website found</span>
         </div>`;

    const addrHtml = lead.address
      ? `<div class="maps-lead-field">
           <span class="maps-field-icon">📍</span>
           <span class="maps-field-val">${escapeHtml(lead.address)}</span>
         </div>`
      : `<div class="maps-lead-field maps-field-empty">
           <span class="maps-field-icon">📍</span>
           <span class="maps-field-val empty">No address found</span>
         </div>`;

    const newBadge = isNew
      ? `<span class="maps-lead-new-badge">new</span>`
      : "";

    card.innerHTML = `
      <div class="maps-lead-header">
        <span class="maps-lead-num">${idx + 1}</span>
        <div class="maps-lead-title-row">
          <div class="maps-lead-name">${escapeHtml(lead.name)}</div>
          ${newBadge}
        </div>
      </div>
      <div class="maps-lead-meta">
        ${ratingHtml}${reviewsHtml}${catHtml}
      </div>
      <div class="maps-lead-fields">
        ${phoneHtml}
        ${emailHtml}
        ${websiteHtml}
        ${addrHtml}
      </div>
    `;
    mapsLeadsList.appendChild(card);
  });
}


function updateMapsExportBtn() {
  const count = mapsLeads.length;
  mapsExportBtn.disabled = count === 0;
  mapsExportCount.textContent = `(${count})`;
}

// ── Clear Maps Session ────────────────────────────────────────────
mapsClearBtn.addEventListener("click", async () => {
  if (mapsLeads.length > 0 && !confirm(`Clear all ${mapsLeads.length} Maps leads from this session?`)) return;
  mapsLeads = [];
  mapsPageCount = 0;
  mapsLastBatchCount = 0;
  await chrome.storage.local.set({ [MAPS_KEY]: { leads: [], pageCount: 0 } });
  renderMapsStats();
  renderMapsPreview();
  updateMapsExportBtn();
  hideMapsStatus();
  showMapsStatus("Session cleared.", "info");
});

// ── Export Maps CSV ───────────────────────────────────────────────
mapsExportBtn.addEventListener("click", () => {
  if (mapsLeads.length === 0) return;

  const headers = [
    "Business Name", "Email", "Phone", "Website",
    "Address", "Rating", "Reviews", "Category",
    "Maps URL", "Place ID", "Scraped At"
  ];
  const rows = mapsLeads.map(l => [
    l.name,
    l.email,
    l.phone,
    l.website,
    l.address,
    l.rating,
    l.reviewCount,
    l.category,
    l.mapsUrl,
    l.placeId,
    l.scrapedAt,
  ].map(csvEscape));

  const csv = [headers.map(csvEscape).join(","), ...rows.map(r => r.join(","))].join("\n");
  downloadCsv(csv, `maps_leads_${formatDate()}.csv`);
  showMapsStatus(`✓ Exported ${mapsLeads.length} lead${mapsLeads.length > 1 ? "s" : ""} as CSV.`, "success");
});


// ══════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ══════════════════════════════════════════════════════════════════

function showStatus(msg, type = "info") {
  statusMsg.textContent = msg;
  statusMsg.className = `status-msg ${type}`;
  statusMsg.classList.remove("hidden");
  clearTimeout(showStatus._timer);
  showStatus._timer = setTimeout(() => statusMsg.classList.add("hidden"), 3500);
}

function hideStatus() {
  statusMsg.classList.add("hidden");
}

function showMapsStatus(msg, type = "info") {
  mapsStatusMsg.textContent = msg;
  mapsStatusMsg.className = `status-msg ${type}`;
  mapsStatusMsg.classList.remove("hidden");
  clearTimeout(showMapsStatus._timer);
  showMapsStatus._timer = setTimeout(() => mapsStatusMsg.classList.add("hidden"), 4500);
}

function hideMapsStatus() {
  mapsStatusMsg.classList.add("hidden");
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function csvEscape(val) {
  const s = String(val || "").replace(/\r\n/g, " ").replace(/\n/g, " ");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCsv(csv, filename) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatDate() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
}

// ── Boot ──────────────────────────────────────────────────────────
init();
