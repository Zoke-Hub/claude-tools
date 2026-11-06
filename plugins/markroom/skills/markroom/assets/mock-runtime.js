// MarkRoom · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
// Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

// Test-only stand-in for the artifact runtime: load it before the config script in a local copy of the page. Never publish it.
(() => {
  const docs = new Map(); const subs = new Set(); let ver = 0;
  const snapDoc = (path, data) => ({ id: path.split("/").pop(), data: () => data && JSON.parse(JSON.stringify(data)) });
  function emit(colPath, changes) { for (const s of subs) if (s.col === colPath) s.next({ docChanges: () => changes }); }
  function docRef(path) {
    const colPath = path.split("/").slice(0, -1).join("/");
    return {
      id: path.split("/").pop(), path,
      async get() { return snapDoc(path, docs.get(path)); },
      async set(d) { const had = docs.has(path); docs.set(path, JSON.parse(JSON.stringify(d))); window.__writes.push(["set", path, d]); emit(colPath, [{ type: had ? "modified" : "added", doc: snapDoc(path, docs.get(path)) }]); },
      async update(d) { if (!docs.has(path)) throw { code: "invalid_argument", message: "missing" }; docs.set(path, Object.assign(docs.get(path), JSON.parse(JSON.stringify(d)))); window.__writes.push(["update", path, d]); emit(colPath, [{ type: "modified", doc: snapDoc(path, docs.get(path)) }]); },
      async delete() { const old = docs.get(path); docs.delete(path); window.__writes.push(["delete", path]); if (old) emit(colPath, [{ type: "removed", doc: snapDoc(path, old) }]); },
      onSnapshot(next) { setTimeout(() => next(snapDoc(path, docs.get(path)))); return () => {}; },
    };
  }
  const db = {
    doc: docRef,
    collection(colPath) {
      return {
        path: colPath, doc: (id) => docRef(colPath + "/" + (id || Math.random().toString(36).slice(2))),
        onSnapshot(next) { const s = { col: colPath, next }; subs.add(s);
          setTimeout(() => next({ docChanges: () => [...docs.entries()].filter(([p]) => p.startsWith(colPath + "/")).map(([p, d]) => ({ type: "added", doc: snapDoc(p, d) })) }));
          return () => subs.delete(s); },
      };
    },
  };
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
  window.__writes = []; window.__docs = docs; window.__ref = docRef; window.__sent = []; window.__assets = {};
  window.claude = { use: (n) => new Promise((r) => setTimeout(() => r(n === "db" ? db : n === "user" ? user : n === "comments" ? comments : n === "assets" ? assets : n === "permissions" ? permissions : null), 150)) };
})();
