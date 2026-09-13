// firebase-service.js — Lead Snapper
// Firebase Auth (via chrome.identity) + Firestore sync service
// Runs in popup context; Firebase compat SDK loaded via <script> tags

const firebaseService = (() => {
  let _app  = null;
  let _auth = null;
  let _db   = null;

  // ── Init ────────────────────────────────────────────────────────
  function init(config) {
    if (_app) return;
    _app  = firebase.initializeApp(config);
    _auth = firebase.auth();
    _db   = firebase.firestore();

    // Firestore offline persistence disabled to avoid Chrome extension deprecation warnings
    // _db.enablePersistence().catch(() => {});
  }

  // ── Auth ─────────────────────────────────────────────────────────

  /**
   * Sign in using Chrome's identity API → Firebase credential.
   * Steps:
   *  1. Ask background.js to call chrome.identity.getAuthToken()
   *  2. Exchange the OAuth access token for a Firebase GoogleAuthProvider credential
   *  3. Sign in to Firebase with that credential
   */
  async function signInWithGoogle() {
    const token = await _getAuthToken();
    const credential = firebase.auth.GoogleAuthProvider.credential(null, token);
    const result = await _auth.signInWithCredential(credential);

    // Save/update user profile in Firestore
    await _saveUserProfile(result.user);
    return result.user;
  }

  /**
   * Register with Email and Password
   */
  async function signUpWithEmail(email, password) {
    const userCredential = await _auth.createUserWithEmailAndPassword(email, password);
    await _saveUserProfile(userCredential.user);
    return userCredential.user;
  }

  /**
   * Sign in with Email and Password
   */
  async function signInWithEmail(email, password) {
    const userCredential = await _auth.signInWithEmailAndPassword(email, password);
    await _saveUserProfile(userCredential.user);
    return userCredential.user;
  }

  async function signOut() {
    // Remove cached Google token if present
    const token = await _getAuthToken(false).catch(() => null);
    if (token) {
      await new Promise(resolve =>
        chrome.runtime.sendMessage({ action: "removeAuthToken", token }, resolve)
      );
    }
    await _auth.signOut();
  }

  function getCurrentUser() {
    return _auth?.currentUser || null;
  }

  function onAuthStateChanged(callback) {
    if (!_auth) { callback(null); return () => {}; }
    return _auth.onAuthStateChanged(callback);
  }

  // ── Internal: token helpers ──────────────────────────────────────

  function _getAuthToken(interactive = true) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: "getAuthToken", interactive }, response => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!response || response.error) {
          return reject(new Error(response?.error || "Failed to get auth token"));
        }
        resolve(response.token);
      });
    });
  }

  async function _saveUserProfile(user) {
    if (!_db || !user) return;
    await _db.collection("users").doc(user.uid).set({
      displayName: user.displayName || "",
      email:       user.email || "",
      photoURL:    user.photoURL || "",
      lastSeen:    firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  // ── Lead ID helpers ──────────────────────────────────────────────

  function _leadId(lead, type) {
    if (type === "maps") {
      if (lead.placeId) return `place_${lead.placeId.replace(/[^a-zA-Z0-9_\-]/g, "")}`;
      return `m_${_hash((lead.name || "") + (lead.address || ""))}`;
    }
    // snap leads: keyed by URL
    return `s_${_hash(lead.url || lead.businessName || Date.now().toString())}`;
  }

  function _hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(31, h) + str.charCodeAt(i) | 0;
    }
    return Math.abs(h).toString(36);
  }

  // ── Firestore: Write ─────────────────────────────────────────────

  function _formatFirestoreLead(lead, uid, type) {
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

    const id = lead._firestoreId || _leadId(lead, type);
    const bizName = lead.businessName || lead.name || "";
    const contactName = lead.contactName || lead.name || bizName;

    const topLevel = {
      id:           id,
      userId:       uid,
      created_by:   uid,
      name:         contactName,
      businessName: bizName,
      email:        lead.email || "",
      phone:        lead.phone || "",
      website:      lead.website || lead.url || "",
      address:      lead.address || "",
      source:       lead.source || "Lead Snapper Extension",
      status:       lead.status || "New",
      industry:     lead.industry || lead.category || "",
      challenge:    lead.challenge || lead.note || lead.description || "",
      createdAt:    firebase.firestore.FieldValue.serverTimestamp(),
      syncedAt:     firebase.firestore.FieldValue.serverTimestamp()
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

  /**
   * Upsert an array of leads to Firestore.
   * Writes to both top-level `leads` collection and `users/{uid}/snap_leads` (or `maps_leads`).
   * @param {Array}  leads  - lead objects
   * @param {string} type   - "snap" | "maps"
   * @returns {{ success: boolean, count?: number, reason?: string }}
   */
  async function syncLeadsToFirestore(leads, type) {
    const user = _auth?.currentUser;
    if (!user || !_db) return { success: false, reason: "not_signed_in" };
    if (!leads || leads.length === 0) return { success: true, count: 0 };

    const collectionName = type === "maps" ? "maps_leads" : "snap_leads";
    const userRef = _db.collection("users").doc(user.uid);
    const globalLeadsRef = _db.collection("leads");

    // Firestore batch max = 500 ops (2 ops per lead = max 200 leads per batch)
    const CHUNK = 200;
    for (let i = 0; i < leads.length; i += CHUNK) {
      const batch = _db.batch();
      leads.slice(i, i + CHUNK).forEach(lead => {
        const id  = _leadId(lead, type);
        const docData = _formatFirestoreLead(lead, user.uid, type);

        // 1. Write to user subcollection: users/{uid}/snap_leads/{id} or maps_leads/{id}
        const userSubRef = userRef.collection(collectionName).doc(id);
        batch.set(userSubRef, docData, { merge: true });

        // 2. Write to global leads collection: leads/{id}
        const globalRef = globalLeadsRef.doc(id);
        batch.set(globalRef, docData, { merge: true });
      });
      await batch.commit();
    }

    return { success: true, count: leads.length };
  }

  /**
   * Delete a single lead from Firestore.
   */
  async function deleteLeadFromFirestore(lead, type) {
    const user = _auth?.currentUser;
    if (!user || !_db) return;
    const collectionName = type === "maps" ? "maps_leads" : "snap_leads";
    const id  = _leadId(lead, type);
    await _db.collection("users").doc(user.uid)
      .collection(collectionName).doc(id).delete().catch(() => {});
  }

  // ── Firestore: Read ──────────────────────────────────────────────

  /**
   * Fetch all leads for the current user from Firestore.
   * @param {string} type - "snap" | "maps"
   * @returns {Array}
   */
  async function fetchLeadsFromFirestore(type) {
    const user = _auth?.currentUser;
    if (!user || !_db) return [];

    const collectionName = type === "maps" ? "maps_leads" : "snap_leads";
    const snapshot = await _db.collection("users").doc(user.uid)
      .collection(collectionName)
      .orderBy("scrapedAt", "desc")
      .get();

    return snapshot.docs.map(doc => ({ _firestoreId: doc.id, ...doc.data() }));
  }

  // ── Public API ───────────────────────────────────────────────────
  return {
    init,
    signInWithGoogle,
    signUpWithEmail,
    signInWithEmail,
    signOut,
    getCurrentUser,
    onAuthStateChanged,
    syncLeadsToFirestore,
    fetchLeadsFromFirestore,
    deleteLeadFromFirestore,
  };
})();
