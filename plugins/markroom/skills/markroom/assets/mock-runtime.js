// MarkRoom · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
// Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

// Test-only stand-in for the artifact runtime: load it before the config script in a local copy of the page. Never publish it.
// Hooks a test can set before the page loads (all optional; left unset, the runtime behaves as it always did):
//   window.__seed = [[path, data], ...]          docs already in the store when the page opens
//   window.__useDelay = ms, __useDelays = { name: ms }   how long claude.use(name) takes to answer (150 ms by default)
//   window.__useFail = { name: n }               claude.use(name) rejects n times before it answers
//   window.__snapDelay = { collection: ms }      how long a collection's first snapshot takes
//   window.__writeFail = (op, path, data) => code | null   a write rejects with that code; window.__writeDelay = ms per write
// and while it runs: window.__remote.set / update / delete(path, data) (a change made elsewhere: Claude, another viewer; it
// lands in window.__remoteWrites, not __writes) and window.__subError(collection, code) (that collection's live listeners die).
(() => {
  const docs = new Map(); const subs = new Set();
  for (const [p, d] of window.__seed || []) docs.set(p, JSON.parse(JSON.stringify(d)));
  const meta = { fromCache: false, hasPendingWrites: false };
  const snapDoc = (path, data) => ({ id: path.split("/").pop(), exists: !!data, metadata: meta, data: () => data && JSON.parse(JSON.stringify(data)) });
  function emit(colPath, changes) { for (const s of subs) if (s.col === colPath) s.next({ docChanges: () => changes, metadata: meta }); }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function gate(op, path, d) {
    if (window.__writeDelay) await wait(window.__writeDelay);
    const code = window.__writeFail && window.__writeFail(op, path, d);
    if (code) { (window.__failedWrites = window.__failedWrites || []).push([op, path]); throw { code, message: "mock" }; }
  }
  // the store's own verbs, shared by the page's writes and the ones made elsewhere
  const store = {
    set(path, d) { const had = docs.has(path); docs.set(path, JSON.parse(JSON.stringify(d))); emit(colOf(path), [{ type: had ? "modified" : "added", doc: snapDoc(path, docs.get(path)) }]); },
    update(path, d) { if (!docs.has(path)) throw { code: "invalid_argument", message: "missing" }; docs.set(path, Object.assign(docs.get(path), JSON.parse(JSON.stringify(d)))); emit(colOf(path), [{ type: "modified", doc: snapDoc(path, docs.get(path)) }]); },
    delete(path) { const old = docs.get(path); docs.delete(path); if (old) emit(colOf(path), [{ type: "removed", doc: snapDoc(path, old) }]); },
  };
  const colOf = (path) => path.split("/").slice(0, -1).join("/");
  function docRef(path) {
    const colPath = colOf(path);
    return {
      id: path.split("/").pop(), path,
      async get() { return snapDoc(path, docs.get(path)); },
      async set(d) { await gate("set", path, d); store.set(path, d); window.__writes.push(["set", path, d]); },
      async update(d) { await gate("update", path, d); store.update(path, d); window.__writes.push(["update", path, d]); },
      async delete() { await gate("delete", path); store.delete(path); window.__writes.push(["delete", path]); },
      onSnapshot(next) { setTimeout(() => next(snapDoc(path, docs.get(path)))); return () => {}; },
    };
  }
  const db = {
    doc: docRef,
    collection(colPath) {
      return {
        path: colPath, doc: (id) => docRef(colPath + "/" + (id || Math.random().toString(36).slice(2))),
        onSnapshot(next, error) { const s = { col: colPath, next, error }; subs.add(s);
          setTimeout(() => { if (subs.has(s)) next({ docChanges: () => [...docs.entries()].filter(([p]) => colOf(p) === colPath).map(([p, d]) => ({ type: "added", doc: snapDoc(p, d) })), metadata: meta }); },
            (window.__snapDelay && window.__snapDelay[colPath]) || 0);
          return () => subs.delete(s); },
      };
    },
  };
  window.__remote = { set: (p, d) => { window.__remoteWrites.push(["set", p, d]); store.set(p, d); }, update: (p, d) => { window.__remoteWrites.push(["update", p, d]); store.update(p, d); },
    delete: (p) => { window.__remoteWrites.push(["delete", p]); store.delete(p); } };
  window.__subError = (colPath, code) => { for (const s of [...subs]) if (s.col === colPath) { subs.delete(s); if (s.error) s.error({ code: code || "unavailable", message: "mock" }); } };
  const user = { id: async () => "u_me", profiles: async (ids) => Object.fromEntries([].concat(ids).map((i) => [i, { id: i, name: i === "u_me" ? "You" : "Client", avatarUrl: "", color: "#888", email: null, isMe: i === "u_me", guest: false }])) };
  // comments: Send to Claude. window.__canSend sets what canSendToClaude answers ("available" by default); sends land in window.__sent
  const comments = { anchorFor: async () => ({ path: "body", x: 0, y: 0 }), canSendToClaude: async () => window.__canSend || "available",
    sendToClaude: async (t) => { if (window.__sendError) throw { code: window.__sendError, message: "mock" }; window.__sent.push(t); return { threadId: "t1", commentId: "c1" }; } };
  // assets: pictures pasted into notes. Uploads land in window.__assets (id -> blob url); window.__assetError fails the next one
  const assets = { upload: async (blob, o) => { if (window.__assetError) { const c = window.__assetError; window.__assetError = null; throw { code: c, message: "mock" }; }
    const id = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join(""), url = URL.createObjectURL(blob);
    window.__assets[id] = url; return { id, url, sizeBytes: blob.size, contentType: (o && o.type) || blob.type }; } };
  // permissions: window.__perm is the comments state ("granted" by default); manage() applies window.__permAfter (if set) as the
  // viewer's choice in the panel, or rejects when window.__manageError is set
  const permissions = { state: async (n) => (n === "comments" ? window.__perm || "granted" : "unavailable"),
    manage: async () => { if (window.__manageError) throw { code: "unavailable", message: "mock" }; window.__managed = (window.__managed || 0) + 1; if (window.__permAfter) window.__perm = window.__permAfter; } };
  window.__writes = []; window.__remoteWrites = []; window.__docs = docs; window.__ref = docRef; window.__sent = []; window.__assets = {};
  const ns = (n) => (n === "db" ? db : n === "user" ? user : n === "comments" ? comments : n === "assets" ? assets : n === "permissions" ? permissions : null);
  window.claude = { use: (n) => new Promise((r, j) => setTimeout(() => {
    const f = window.__useFail; if (f && f[n] > 0) { f[n]--; j({ code: "unavailable", message: "mock" }); return; }
    r(ns(n));
  }, ((window.__useDelays && window.__useDelays[n]) ?? window.__useDelay ?? 150))) };
})();
