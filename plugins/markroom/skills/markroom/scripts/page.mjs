// MarkRoom · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
// Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

// Shared by build_board.mjs and snapshot_board.mjs: one board image's entry in the page config, and filling the page
// template (assets/board.html) with the config, title, subtitle and first picture.

export const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// One image or video as the page (and the `rounds` collection) reads it: id, label, src, w, h, then group and added,
// and for a video type, poster, fps, dur, beats. srcOf(im, "src" | "poster") gives each file as that copy serves it
// (a path in img/, an asset's /_blob/ url, an asset id, a data URI).
export function entryOf(im, srcOf) {
  return Object.assign({ id: im.id, label: im.label, src: srcOf(im, "src"), w: im.w, h: im.h },
    im.group ? { group: im.group } : {}, im.added ? { added: im.added } : {},
    im.type === "video" ? { type: "video", poster: srcOf(im, "poster"), fps: im.fps, dur: im.dur, beats: im.beats || undefined } : {});
}

// The config goes in between /*CFG*/ and /*/CFG*/ (a function replacement, so `$&` or `$$` in a title stays as typed);
// firstSrc fills the first picture's src, or null drops the attribute (a saved copy has no file to point at).
// The licence keeps the credit on every board, so a template without it builds nothing.
export const CREDIT = '<p class="by">MarkRoom · by Zoke</p>';
export function checkTemplate(html) {
  if (!html.includes(CREDIT) || !html.includes("Copyright 2026 Zoke"))
    throw new Error("assets/board.html has lost its \"MarkRoom · by Zoke\" credit or its licence notice; the licence (see LICENSE) requires both.");
}
export function fillTemplate(html, cfg, { title, subtitle, firstSrc }) {
  checkTemplate(html);
  html = html.replace(/\/\*CFG\*\/[\s\S]*?\/\*\/CFG\*\//, () => "/*CFG*/" + JSON.stringify(cfg).replace(/</g, "\\u003c") + "/*/CFG*/");
  html = html.split("__TITLE__").join(escHtml(title)).split("__SUBTITLE__").join(escHtml(subtitle));
  return firstSrc == null ? html.split(' src="__FIRST_SRC__"').join("") : html.split("__FIRST_SRC__").join(escHtml(firstSrc));
}
