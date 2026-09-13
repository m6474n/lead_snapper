// content.js — Lead Snapper content script
// Runs on every page, listens for scrape requests from the popup

function extractLeadData() {
  const data = {
    url: window.location.href,
    scrapedAt: new Date().toISOString(),
    businessName: "",
    email: "",
    phone: "",
    address: "",
    description: "",
    note: ""
  };

  // ── Special Handler: Google Search Knowledge Panel / Google Business Profile ──
  const isGoogleSearch = window.location.hostname.includes("google.") && window.location.pathname.includes("/search");
  if (isGoogleSearch) {
    // 1. Business Name
    const nameSelectors = [
      'div[data-attrid="title"]',
      'h2[data-attrid="title"]',
      '[data-attrid="kc:/location/location:name"]',
      '.kp-header [role="heading"]',
      '.kno-ecr-pt',
      'g-header-menu + div h2',
      'div[data-attrid="kc:/business/business_name"]'
    ];
    for (const sel of nameSelectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText?.trim()) {
        data.businessName = el.innerText.trim();
        break;
      }
    }

    // 2. Phone
    const phoneSelectors = [
      '[data-attrid="kc:/location/location:phone"] span',
      '[data-attrid*="phone"] a[href^="tel:"]',
      '[data-attrid*="phone"] span',
      '[data-attrid*="phone"]'
    ];
    for (const sel of phoneSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = (el.getAttribute('href')?.replace("tel:", "") || el.innerText || "").trim().replace(/^Phone:\s*/i, "");
        if (text && text.length > 4) {
          data.phone = text;
          break;
        }
      }
    }

    // 3. Address
    const addrSelectors = [
      '[data-attrid="kc:/location/location:address"] span',
      '[data-attrid*="address"] span',
      '[data-attrid*="address"]',
      '[data-dtype="d2d"] span'
    ];
    for (const sel of addrSelectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText?.trim()) {
        const text = el.innerText.trim().replace(/^Address:\s*/i, "").replace(/\n+/g, ", ").replace(/\s+/g, " ").trim();
        if (text && text.length > 5) {
          data.address = text;
          break;
        }
      }
    }

    // 4. Description
    const descSelectors = [
      '[data-attrid="kc:/common/topic:description"] span',
      '[data-attrid="kc:/business/business_description"] span',
      '.kno-rdesc span',
      '[data-attrid*="description"]'
    ];
    for (const sel of descSelectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText?.trim()) {
        const text = el.innerText.trim().replace(/Wikipedia$/i, "").trim();
        if (text && text.length > 10) {
          data.description = text.length > 300 ? text.substring(0, 300) + "…" : text;
          break;
        }
      }
    }

    // 5. Website URL
    const webBtn = document.querySelector('a[data-attrid="visit_official_site"], a[aria-label*="Website" i], a[data-attrid*="official_website"]');
    if (webBtn && webBtn.href) {
      let webUrl = webBtn.href;
      const m = webUrl.match(/[?&]url=([^&]+)/);
      if (m) webUrl = decodeURIComponent(m[1]);
      if (webUrl && !webUrl.includes("google.com")) {
        data.url = webUrl;
      }
    }
  }

  // ── Business Name ──────────────────────────────────────────────
  const nameCandidates = [
    () => document.querySelector('div[data-attrid="title"]')?.innerText?.trim(),
    () => document.querySelector('h2[data-attrid="title"]')?.innerText?.trim(),
    () => document.querySelector('meta[property="og:site_name"]')?.content,
    () => document.querySelector('meta[name="application-name"]')?.content,
    () => document.querySelector('[class*="brand"] [class*="name"]')?.innerText?.trim(),
    () => document.querySelector('[class*="company-name"]')?.innerText?.trim(),
    () => document.querySelector('[class*="business-name"]')?.innerText?.trim(),
    () => document.querySelector('[itemprop="name"]')?.innerText?.trim(),
    () => document.querySelector('[itemtype*="Organization"] [itemprop="name"]')?.content
        || document.querySelector('[itemtype*="Organization"] [itemprop="name"]')?.innerText?.trim(),
    () => document.querySelector('[itemtype*="LocalBusiness"] [itemprop="name"]')?.innerText?.trim(),
    () => document.querySelector("header [class*='logo'] img")?.alt?.trim(),
    () => {
      const h1 = document.querySelector("h1");
      if (h1) return h1.innerText.trim();
    },
    () => document.title?.split(/[|\-–—·]/)[0]?.trim()
  ];
  for (const fn of nameCandidates) {
    try { const v = fn(); if (v && v.length > 1 && v.length < 120) { data.businessName = v; break; } } catch {}
  }

  // ── Email ──────────────────────────────────────────────────────
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const bodyText = document.body.innerText || "";
  const bodyHTML = document.body.innerHTML || "";

  // Try mailto links first
  const mailtoLinks = Array.from(document.querySelectorAll('a[href^="mailto:"]'));
  if (mailtoLinks.length > 0) {
    const mail = mailtoLinks[0].href.replace("mailto:", "").split("?")[0].trim();
    if (mail) data.email = mail;
  }

  // Fallback: scan text
  if (!data.email) {
    const emails = bodyText.match(emailRegex);
    if (emails && emails.length > 0) {
      // Filter out common false positives
      const filtered = emails.filter(e => !e.includes("example.") && !e.includes("sentry") && !e.includes("@2x"));
      if (filtered.length > 0) data.email = filtered[0];
    }
  }

  // ── Phone ──────────────────────────────────────────────────────
  const phoneCandidates = [
    () => document.querySelector('[itemprop="telephone"]')?.content
        || document.querySelector('[itemprop="telephone"]')?.innerText?.trim(),
    () => document.querySelector('a[href^="tel:"]')?.href?.replace("tel:", "")?.trim(),
    () => {
      const phoneRegex = /(\+?[\d\s\-().]{7,20}(?:\s*(?:ext|x|ext\.)\s*\d+)?)/gi;
      const matches = bodyText.match(phoneRegex);
      if (matches) {
        return matches.find(m => {
          const digits = m.replace(/\D/g, "");
          return digits.length >= 7 && digits.length <= 15;
        });
      }
    }
  ];
  for (const fn of phoneCandidates) {
    try { const v = fn(); if (v && v.trim().length > 4) { data.phone = v.trim(); break; } } catch {}
  }

  // ── Address ────────────────────────────────────────────────────
  const addressCandidates = [
    () => {
      const el = document.querySelector('[itemprop="address"]');
      if (el) return el.innerText?.trim();
    },
    () => {
      const el = document.querySelector('[itemtype*="PostalAddress"]');
      if (el) return el.innerText?.trim();
    },
    () => document.querySelector('[class*="address"]')?.innerText?.trim(),
    () => document.querySelector('[class*="location"]')?.innerText?.trim(),
    () => {
      // Look for address-like patterns: street numbers + words
      const addrRegex = /\d{1,5}\s+\w[\w\s,\.]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|place|pl|circle|cir)\b[\w\s,\.#\-]*/gi;
      const matches = bodyText.match(addrRegex);
      if (matches) return matches[0].trim();
    }
  ];
  for (const fn of addressCandidates) {
    try {
      const v = fn();
      if (v && v.length > 5 && v.length < 250) {
        // Clean up excessive whitespace
        data.address = v.replace(/\s+/g, " ").replace(/\n+/g, ", ").trim();
        break;
      }
    } catch {}
  }

  // ── Description ────────────────────────────────────────────────
  const descCandidates = [
    () => document.querySelector('meta[name="description"]')?.content,
    () => document.querySelector('meta[property="og:description"]')?.content,
    () => document.querySelector('meta[name="twitter:description"]')?.content,
    () => document.querySelector('[itemprop="description"]')?.innerText?.trim(),
    () => {
      // First meaningful paragraph
      const paras = Array.from(document.querySelectorAll("p"));
      const good = paras.find(p => p.innerText?.trim().length > 40 && p.innerText?.trim().length < 500);
      return good?.innerText?.trim();
    }
  ];
  for (const fn of descCandidates) {
    try {
      const v = fn();
      if (v && v.length > 10) {
        data.description = v.length > 300 ? v.substring(0, 300) + "…" : v;
        break;
      }
    } catch {}
  }

  return data;
}

// ══════════════════════════════════════════════════════════════════
// Google Maps Bulk Scraper
// ══════════════════════════════════════════════════════════════════

function scrapeGoogleMaps() {
  const results = [];

  // ── Find the results feed ───────────────────────────────────────
  // Google Maps renders results in a scrollable div[role="feed"] panel
  const feed =
    document.querySelector('div[role="feed"]') ||
    document.querySelector('[aria-label*="Results for"]') ||
    document.querySelector('[aria-label*="Search results"]');

  if (!feed) {
    return { success: false, error: "No Google Maps results panel found. Make sure you are on a search results page (not a single business page)." };
  }

  // ── Collect all top-level listing containers ──────────────────────
  // Approach: find all elements that wrap a full listing card.
  // Priority: containers with class Nv2PK (current Maps class for card wrapper).
  let containers = Array.from(feed.querySelectorAll('[class*="Nv2PK"]'));

  // Fallback A: jsaction elements containing a headline
  if (containers.length === 0) {
    containers = Array.from(feed.querySelectorAll('[jsaction*="mouseover"]')).filter(el =>
      el.querySelector('.qBF1Pd, .fontHeadlineSmall, [class*="fontHeadline"]')
    );
  }

  // Fallback B: <a> links to /maps/place/
  if (containers.length === 0) {
    containers = Array.from(feed.querySelectorAll('a[href*="/maps/place/"]'));
  }

  if (containers.length === 0) {
    return { success: false, error: "No listing cards detected. Google may have updated its layout. Try scrolling down to ensure results are loaded." };
  }

  containers.forEach(card => extractCardData(card, results));

  // Deduplicate by name (in case multiple selectors hit same card)
  const seen = new Set();
  const deduped = results.filter(r => {
    const key = r.name.toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { success: true, leads: deduped, count: deduped.length };
}

function extractCardData(card, results) {
  try {
    const lead = {
      name: "",
      rating: "",
      reviewCount: "",
      category: "",
      address: "",
      phone: "",
      email: "",
      website: "",
      mapsUrl: "",
      placeId: "",
      scrapedAt: new Date().toISOString()
    };

    // Convenience: safe querySelector on card
    const q = (sel) => card.querySelector ? card.querySelector(sel) : null;
    const qa = (sel) => card.querySelectorAll ? Array.from(card.querySelectorAll(sel)) : [];

    // ── Business Name ─────────────────────────────────────────────
    const nameSelectors = [
      '.qBF1Pd', '.fontHeadlineSmall', '[class*="fontHeadline"]', 'h3'
    ];
    for (const sel of nameSelectors) {
      const el = q(sel);
      const text = el?.innerText?.trim();
      if (text && text.length > 1 && text.length < 150) { lead.name = text; break; }
    }
    // aria-label on the card element itself (common for <a> wrappers)
    if (!lead.name && card.getAttribute) {
      const al = card.getAttribute('aria-label');
      if (al && al.length > 1 && al.length < 150) lead.name = al;
    }

    if (!lead.name) return; // Skip if no name found

    // ── Full card text (for regex extractions) ────────────────────
    const cardText = (card.innerText || card.textContent || "").replace(/\s+/g, " ").trim();

    // ── Rating ────────────────────────────────────────────────────
    for (const sel of ['.MW4etd', '[class*="MW4etd"]']) {
      const el = q(sel);
      if (el) {
        // Prefer aria-label "Rated 4.8 out of 5"
        const al = el.getAttribute('aria-label') || "";
        const m = al.match(/[\d.]+/);
        const text = m ? m[0] : el.innerText?.trim();
        if (text && /^\d/.test(text)) { lead.rating = text; break; }
      }
    }
    // Fallback: pull "4.8" pattern from early card text
    if (!lead.rating) {
      const m = cardText.match(/\b([1-5]\.?\d?)\b.*?\(/);
      if (m && parseFloat(m[1]) >= 1 && parseFloat(m[1]) <= 5) lead.rating = m[1];
    }

    // ── Review Count ──────────────────────────────────────────────
    for (const sel of ['.UY7F9', '[class*="UY7F9"]', '.e4rVHe', '[class*="e4rVHe"]']) {
      const el = q(sel);
      if (el) {
        const t = el.innerText?.trim().replace(/[()]/g, "").replace(/,/g, "");
        if (t && /^\d+$/.test(t)) { lead.reviewCount = t; break; }
      }
    }
    if (!lead.reviewCount) {
      // Grab number in parentheses right after rating
      const m = cardText.match(/\((\d[\d,]*)\)/);
      if (m) lead.reviewCount = m[1].replace(/,/g, "");
    }

    // ── Email ─────────────────────────────────────────────────────
    // Priority 1: explicit mailto: links
    const mailLinks = qa('a[href^="mailto:"]');
    if (mailLinks.length > 0) {
      lead.email = mailLinks[0].href.replace("mailto:", "").split("?")[0].trim();
    }
    // Priority 2: email regex on visible card text
    if (!lead.email) {
      const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
      const emailMatches = cardText.match(emailRegex) || [];
      const validEmail = emailMatches.find(e =>
        !e.includes("example.") && !e.includes("@2x") &&
        !e.endsWith(".png") && !e.endsWith(".jpg") && !e.endsWith(".svg")
      );
      if (validEmail) lead.email = validEmail;
    }

    // ── Phone ─────────────────────────────────────────────────────
    // Priority 1: tel: links
    const telLinks = qa('a[href^="tel:"]');
    if (telLinks.length > 0) {
      lead.phone = decodeURIComponent(telLinks[0].href.replace("tel:", "")).trim();
    }
    // Priority 2: aria-label on action buttons (phone/call buttons)
    if (!lead.phone) {
      const callBtns = qa('[aria-label*="phone" i], [aria-label*="call" i], [data-value*="phone" i]');
      for (const el of callBtns) {
        const al = el.getAttribute('aria-label') || el.getAttribute('data-value') || "";
        const digits = al.replace(/\D/g, "");
        if (digits.length >= 7 && digits.length <= 15) {
          lead.phone = al.replace(/[^+\d\s\-().]/g, "").trim();
          break;
        }
      }
    }
    // Priority 3: scan each span in .W4Efsd rows for phone pattern
    const phoneLineRegex = /^[\+\(]?[\d][\d\s\-().+]{5,18}\d$/;
    const addressHints = /\d{1,5}\s|\bave\b|\bst\b|\brd\b|\bblvd\b|\bdr\b|\blane\b|\bway\b|\bct\b|\bplaza\b|\bsuite\b|\bfloor\b|\bblock\b|\bsector\b|\broad\b|\bstreet\b/i;

    let categoryCandidate = "";
    const infoRows = qa('.W4Efsd, [class*="W4Efsd"]');

    infoRows.forEach((row) => {
      // Check full row text
      const rowText = row.innerText?.trim() || "";
      if (!lead.phone && phoneLineRegex.test(rowText) && rowText.length < 25) {
        lead.phone = rowText;
        return;
      }
      // Check individual spans inside the row
      const spans = Array.from(row.querySelectorAll('span'));
      spans.forEach(span => {
        const t = span.innerText?.trim();
        if (!t || t.length < 2) return;
        if (!lead.phone && phoneLineRegex.test(t)) {
          lead.phone = t;
        } else if (!categoryCandidate && t.length < 60 && !/\d{3,}/.test(t) && !addressHints.test(t) && !t.includes('@')) {
          categoryCandidate = t;
        } else if (!lead.address && addressHints.test(t) && t.length < 200) {
          lead.address = t.replace(/\n/g, ", ").replace(/\s+/g, " ").trim();
        }
      });
    });

    // Priority 4: generic phone regex scan over full card text
    if (!lead.phone) {
      const genericPhone = /(\+?1?[\s.\-]?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}(?:\s*(?:ext|x)\.?\s*\d+)?)/gi;
      const phoneMatches = [...cardText.matchAll(genericPhone)];
      for (const m of phoneMatches) {
        const digits = m[1].replace(/\D/g, "");
        if (digits.length >= 7 && digits.length <= 15) { lead.phone = m[1].trim(); break; }
      }
    }

    // ── Category ─────────────────────────────────────────────────
    lead.category = categoryCandidate;

    // ── Address ───────────────────────────────────────────────────
    if (!lead.address) {
      // Check aria-label or data-value on address-specific elements
      const addrEls = qa('[aria-label*="address" i], [data-value*="address" i]');
      for (const el of addrEls) {
        const t = (el.getAttribute('aria-label') || el.getAttribute('data-value') || el.innerText || "").trim();
        if (t && t.length > 5 && t.length < 250) { lead.address = t.replace(/\s+/g, " ").trim(); break; }
      }
    }
    if (!lead.address) {
      // Regex scan card text for street address pattern
      const addrRegex = /\d{1,5}\s+\w[\w\s,\.]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|place|pl|circle|cir|block|sector)\b[\w\s,\.#\-]*/gi;
      const addrMatches = cardText.match(addrRegex);
      if (addrMatches) lead.address = addrMatches[0].replace(/\s+/g, " ").trim();
    }

    // ── Maps URL & Place ID ───────────────────────────────────────
    let anchor = (card.tagName === 'A') ? card : q('a[href*="/maps/place/"]');
    if (!anchor && card.closest) anchor = card.closest('a[href*="/maps/place/"]');
    if (anchor && anchor.href) {
      lead.mapsUrl = anchor.href;
      // Extract Place ID from URL (format: ...!1s0x...:0x...)
      const cidMatch = anchor.href.match(/[?&!]([01])sCh?I([^&!]+)/);
      // Try data-cid attribute
      const cid = card.getAttribute ? card.getAttribute('data-cid') : null;
      const pidMatch = anchor.href.match(/place\/[^/]+\/([^/?]+)/);
      lead.placeId = cid || (pidMatch && pidMatch[1]) || "";
    }

    // ── Website ───────────────────────────────────────────────────
    // Look for a website link icon within the card area — it may be in a sibling
    const parent = card.closest ? card.closest('[jsaction]') : null;
    if (parent) {
      const webLink = parent.querySelector('a[data-value="Website"], a[href*="url="], a[aria-label*="website" i], a[aria-label*="Website" i]');
      if (webLink) {
        const href = webLink.href;
        // Google wraps external links, extract the real URL
        const urlParam = href.match(/[?&]url=([^&]+)/);
        lead.website = urlParam ? decodeURIComponent(urlParam[1]) : href;
      }
    }

    results.push(lead);
  } catch (err) {
    // Silently skip cards that error
  }
}

// ── Message Listener ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "scrape") {
    try {
      const data = extractLeadData();
      sendResponse({ success: true, data });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
  }

  if (message.action === "scrapeGoogleMaps") {
    try {
      const result = scrapeGoogleMaps();
      sendResponse(result);
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
  }

  return true; // keep message channel open for async
});
