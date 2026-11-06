#!/usr/bin/env node
// MarkRoom · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
// Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

// Save a MarkRoom board as ONE self-contained, read-only HTML file: the images (embedded), every mark and every note,
// frozen as they are now. Open it in any browser, offline, any time; nothing in it can change.
//
//   node snapshot_board.mjs --board <board dir> --marks <ArtifactData out_dir or marks.json> [--overall <dir|json>]
//                           --out <file.html>
//
// --overall takes the ArtifactData output for the `overall` collection. Takes notes with several marks (`items`) and
// the older one-mark docs, including the first board's field names (comment, no img).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { entryOf, fillTemplate } from "./page.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), opt = {};
for (let i = 0; i < args.length; i++) if (args[i].startsWith("--")) opt[args[i].slice(2)] = args[++i];
if (!opt.board || !opt.marks || !opt.out) { console.error("usage: node snapshot_board.mjs --board <dir> --marks <dir|json> [--overall <dir|json>] --out <file.html>"); process.exit(1); }

const boardDir = opt.board.endsWith(".json") ? path.dirname(opt.board) : opt.board;
const board = JSON.parse(fs.readFileSync(path.join(boardDir, "board.json"), "utf8"));
const first = board.images[0].id;

function readDocs(p) {
  const files = fs.statSync(p).isDirectory()
    ? fs.readdirSync(p, { recursive: true }).filter((f) => f.endsWith(".json")).map((f) => path.join(p, f))
    : [p];
  const out = [];
  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(f, "utf8"));
    const items = Array.isArray(d) ? d : d.documents || [d];
    for (const it of items) {
      const body = it && typeof it === "object" && it.data && typeof it.data === "object" ? it.data : it;
      out.push({ id: (it && it.id) || path.basename(f, ".json"), file: f, body });
    }
  }
  return out;
}

const marks = readDocs(opt.marks)
  .filter((d) => d.body && (Array.isArray(d.body.items) || d.body.kind || typeof d.body.t === "number") && path.basename(path.dirname(d.file)) !== "overall")
  .map(({ id, body }) => Object.assign({}, body, { id, img: body.img || first, text: body.text ?? body.comment ?? "", status: body.status || "open" }))
  .sort((a, b) => (a.n || 0) - (b.n || 0));

const overall = {};
if (opt.overall) for (const { id, body } of readDocs(opt.overall)) if (body && typeof body.text === "string") overall[body.img || id] = body.text;

const mime = (f) => ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".mp4": "video/mp4" }[path.extname(f).toLowerCase()] || "application/octet-stream");
const dataUri = (rel) => { const file = path.join(boardDir, rel); return `data:${mime(file)};base64,` + fs.readFileSync(file).toString("base64"); };
// every file embedded; `added` stays out (it only drives a published board's new-round behaviour)
const images = board.images.map((im) => { const { added, ...e } = entryOf(im, (x, k) => (x[k] ? dataUri(x[k]) : undefined)); return e; });

const savedAt = new Date().toISOString();
const cfg = { title: board.title, key: (board.key || "board") + "-snapshot", images, snapshot: { savedAt, marks, overall } };
let html = fillTemplate(fs.readFileSync(path.join(here, "..", "assets", "board.html"), "utf8"), cfg,
  { title: board.title, subtitle: (board.subtitle ? board.subtitle + " · " : "") + "saved copy", firstSrc: null });
// a standalone file has no publish skeleton: give it its own document shell
html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>:root{color-scheme:light dark}img{max-width:100%}</style></head><body>
${html}
</body></html>
`;
fs.mkdirSync(path.dirname(path.resolve(opt.out)), { recursive: true });
fs.writeFileSync(opt.out, html);
console.log(`Saved copy: ${opt.out} · ${marks.length} note${marks.length === 1 ? "" : "s"} · ${(fs.statSync(opt.out).size / 1048576).toFixed(1)} MB`);
