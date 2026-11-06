#!/usr/bin/env node
// MarkRoom · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
// Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

// Build (or extend) a MarkRoom board: prepares each image or video for publishing and fills the page template.
//
//   node build_board.mjs --out <board dir> --title "<Name> MarkRoom" [--subtitle "..."] [--key <slug>] [--append]
//                        <image|video>[=<label>] [<image|video>[=<label>] ...]
//   node build_board.mjs --append --out <board dir>      (no files: refresh index.html from the template)
//   --group "<name>"  puts these files in one tab as rounds of the same thing: the tab opens the latest, and a
//                     Version dropdown opens older ones (e.g. --append --group "Preview" r05.mp4="Preview r05").
//   --live            (with --append, on a published board) adds the round WITHOUT republishing the page: the file is
//                     prepared as usual, then uploaded to the artifact's asset store and announced in its `rounds`
//                     collection, so open views pick it up live and nobody is moved off what they are doing.
//   --asset <round id>=<asset id>[,<poster asset id>]   step 2 of --live: records the uploaded asset ids, writes
//                     <board dir>/live/<round id>.json (the `rounds` doc to set) and bakes the round into index.html.
//
// Images and videos can share one board (each is a tab). A video (.mp4 .mov .m4v .webm .mkv) is remuxed with
// faststart, or re-encoded to H.264 (max 1920 px wide, CRF 23 -> 26 -> 29 -> 32) until it fits the 15 MB publish
// limit; a poster frame is written for its tab; fps and duration are read with ffprobe. Optional beats for the
// video's timeline lane: a sidecar <video>.beats.json, [{"label": "...", "a": 0, "b": 2.2}, ...].
//
// Writes <board dir>/index.html, <board dir>/img/<id>.<ext> and <board dir>/board.json, then prints the
// file_path and the `files` map for the Artifact publish call. --append keeps the images already on the board
// (a new review round) and prints only the new image files. No dependencies: image sizes are read from the file
// headers; conversion uses `sips` (macOS) or ffmpeg.
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { checkTemplate, entryOf, fillTemplate } from "./page.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(here, "..", "assets", "board.html");
const MAX_BYTES = 14.5 * 1024 * 1024;   // the Artifact tool takes up to 15 MB per binary file
const JPEG_ABOVE = 4 * 1024 * 1024;     // larger PNGs without transparency become JPEG (q88): faster to load
const MAX_SIDE = 16000;                 // browsers draw bigger images unreliably

// ---------- args ----------
const args = process.argv.slice(2);
const opt = { out: null, title: null, subtitle: null, key: null, append: false, group: null, live: false, assets: [], images: [] };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--out") opt.out = args[++i];
  else if (a === "--title") opt.title = args[++i];
  else if (a === "--subtitle") opt.subtitle = args[++i];
  else if (a === "--key") opt.key = args[++i];
  else if (a === "--append") opt.append = true;
  else if (a === "--group") opt.group = args[++i];
  else if (a === "--live") opt.live = true;
  else if (a === "--asset") opt.assets.push(args[++i]);
  else if (a === "-h" || a === "--help") {   // the header comment: every line before the first import
    const lines = fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n");
    console.log(lines.slice(1, lines.findIndex((l) => l.startsWith("import "))).join("\n")); process.exit(0);
  }
  else opt.images.push(a);
}
// --append with no files re-renders index.html from the current template (after a template update)
if (opt.assets.length) opt.append = true;
if (opt.live && !opt.append) { console.error("--live adds a round to a published board: use it with --append."); process.exit(1); }
if (!opt.out || (!opt.images.length && !opt.append)) { console.error("usage: node build_board.mjs --out <dir> --title <title> <image|video>[=<label>] ..."); process.exit(1); }
const templateHtml = fs.readFileSync(TEMPLATE, "utf8");
try { checkTemplate(templateHtml); } catch (e) { console.error(e.message); process.exit(1); }   // before anything is written
const out = path.resolve(opt.out);
fs.mkdirSync(path.join(out, "img"), { recursive: true });

const slug = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 48) || "image";
const which = (cmd) => { try { execFileSync("which", [cmd], { stdio: "ignore" }); return true; } catch { return false; } };
const HAS_SIPS = which("sips");
// ffmpeg-full first when it's there (keg-only on Homebrew), else whatever is on PATH
const FF_DIR = ["/opt/homebrew/opt/ffmpeg-full/bin", "/usr/local/opt/ffmpeg-full/bin"].find((d) => fs.existsSync(path.join(d, "ffmpeg")));
const FFMPEG = FF_DIR ? path.join(FF_DIR, "ffmpeg") : "ffmpeg", FFPROBE = FF_DIR ? path.join(FF_DIR, "ffprobe") : "ffprobe";
const HAS_FFMPEG = !!FF_DIR || which("ffmpeg");
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv)$/i;
function probeVideo(file) {
  const j = JSON.parse(execFileSync(FFPROBE, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,codec_name:format=duration", "-of", "json", file]).toString());
  const st = j.streams[0], [a, b] = String(st.r_frame_rate || "25/1").split("/").map(Number);
  return { w: st.width, h: st.height, fps: +(a / (b || 1)).toFixed(3), dur: +(+j.format.duration).toFixed(3), codec: st.codec_name };
}
function prepVideo(src, id) {
  const dst = path.join(out, "img", id + ".mp4"), info = probeVideo(src);
  const enc = (crf) => execFileSync(FFMPEG, ["-v", "error", "-y", "-i", src, "-vf", "scale='min(1920,iw)':-2", "-c:v", "libx264", "-preset", "slow", "-crf", String(crf),
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", dst]);
  if (info.codec === "h264" && info.w <= 1920 && fs.statSync(src).size <= MAX_BYTES) {
    execFileSync(FFMPEG, ["-v", "error", "-y", "-i", src, "-c", "copy", "-movflags", "+faststart", dst]);
  } else {
    for (const crf of [23, 26, 29, 32]) { enc(crf); if (fs.statSync(dst).size <= MAX_BYTES) break; }
  }
  const o = probeVideo(dst);
  const poster = path.join(out, "img", id + ".poster.jpg");
  execFileSync(FFMPEG, ["-v", "error", "-y", "-ss", String(Math.min(1, o.dur / 2)), "-i", dst, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "4", poster]);
  let beats = null;
  const side = src.replace(/\.[^.]+$/, "") + ".beats.json";
  if (fs.existsSync(side)) beats = JSON.parse(fs.readFileSync(side, "utf8"));
  return { dst, poster, info, o, beats };
}

// ---------- image headers ----------
function probe(file) {
  const b = fs.readFileSync(file);
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) {
    return { type: "png", w: b.readUInt32BE(16), h: b.readUInt32BE(20), alpha: [4, 6].includes(b[25]) || b.includes(Buffer.from("tRNS")) };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length - 9) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { type: "jpg", h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7), alpha: false };
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;   // webp, heic, tiff, gif …: converted below
}
function toJpeg(src, dst, quality, maxSide) {
  if (HAS_SIPS) {
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", String(quality), ...(maxSide ? ["-Z", String(maxSide)] : []), src, "--out", dst], { stdio: "ignore" });
  } else if (HAS_FFMPEG) {
    const q = String(Math.max(2, Math.round((100 - quality) / 6)));
    const vf = maxSide ? ["-vf", `scale='if(gt(iw,ih),min(${maxSide},iw),-2)':'if(gt(iw,ih),-2,min(${maxSide},ih))'`] : [];
    execFileSync(FFMPEG, ["-v", "error", "-y", "-i", src, ...vf, "-q:v", q, dst]);
  } else throw new Error("Converting " + src + " needs sips (macOS) or ffmpeg.");
}
function toPng(src, dst) {
  if (HAS_SIPS) execFileSync("sips", ["-s", "format", "png", src, "--out", dst], { stdio: "ignore" });
  else if (HAS_FFMPEG) execFileSync(FFMPEG, ["-v", "error", "-y", "-i", src, dst]);
  else throw new Error("Converting " + src + " needs sips (macOS) or ffmpeg.");
}

// ---------- board ----------
const boardFile = path.join(out, "board.json");
let board = { title: opt.title || "MarkRoom", subtitle: opt.subtitle || "", key: opt.key || "", url: null, images: [] };
if (opt.append && fs.existsSync(boardFile)) {
  board = JSON.parse(fs.readFileSync(boardFile, "utf8"));
  if (opt.title) board.title = opt.title;
  if (opt.subtitle != null) board.subtitle = opt.subtitle;
} else if (fs.existsSync(boardFile) && !opt.append) {
  const old = JSON.parse(fs.readFileSync(boardFile, "utf8"));
  if (old.url) { console.error(`${boardFile} already belongs to ${old.url}. Use --append to add a round, or pick a new --out.`); process.exit(1); }
}
board.key = board.key || opt.key || slug(board.title);
if (opt.live && !board.url) { console.error("--live needs a published board (board.json has no url): publish it first."); process.exit(1); }

const added = [];
// what every new round gets, image or video: its tab group, the live flag, and a place on the board
const addRound = (im) => { if (opt.group) im.group = opt.group; if (opt.live) im.live = true; board.images.push(im); added.push(im); };
for (const spec of opt.images) {
  const eq = spec.lastIndexOf("=");
  const src = path.resolve(eq > 0 && fs.existsSync(spec.slice(0, eq)) ? spec.slice(0, eq) : spec);
  const label = eq > 0 && fs.existsSync(spec.slice(0, eq)) ? spec.slice(eq + 1) : path.basename(src).replace(/\.[^.]+$/, "");
  if (!fs.existsSync(src)) { console.error("Missing file: " + src); process.exit(1); }
  let id = slug(label), n = 2;
  while (board.images.some((im) => im.id === id)) id = slug(label) + "-" + n++;
  if (VIDEO_EXT.test(src)) {
    const v = prepVideo(src, id);
    const bytes = fs.statSync(v.dst).size;
    if (bytes > MAX_BYTES) console.warn(`warning: ${path.basename(v.dst)} is ${(bytes / 1048576).toFixed(1)} MB, over the 15 MB publish limit.`);
    const im = { id, label, type: "video", src: "img/" + path.basename(v.dst), poster: "img/" + path.basename(v.poster), w: v.o.w, h: v.o.h,
      fps: v.o.fps, dur: v.o.dur, source: src, scale: +(v.o.w / v.info.w).toFixed(6), added: new Date().toISOString() };
    if (v.beats) im.beats = v.beats;
    addRound(im);
    continue;
  }

  let info = probe(src), work = src;
  if (!info) { work = path.join(out, "img", id + ".src.png"); toPng(src, work); info = probe(work); }
  if (!info) { console.error("Can't read the size of " + src); process.exit(1); }
  const size = fs.statSync(work).size, tooBig = Math.max(info.w, info.h) > MAX_SIDE;
  let dst;
  if (info.type === "jpg" && size <= MAX_BYTES && !tooBig) { dst = path.join(out, "img", id + ".jpg"); fs.copyFileSync(work, dst); }
  else if (info.type === "png" && !tooBig && (size <= JPEG_ABOVE || (info.alpha && size <= MAX_BYTES))) { dst = path.join(out, "img", id + ".png"); fs.copyFileSync(work, dst); }
  else {
    dst = path.join(out, "img", id + ".jpg");
    toJpeg(work, dst, 88, tooBig ? MAX_SIDE : 0);
    if (fs.statSync(dst).size > MAX_BYTES) toJpeg(work, dst, 72, tooBig ? MAX_SIDE : 0);
    if (info.alpha) console.warn(`note: ${path.basename(src)} has transparency; the JPEG copy flattens it.`);
  }
  if (work !== src) fs.rmSync(work);
  const o = probe(dst), bytes = fs.statSync(dst).size;
  if (bytes > MAX_BYTES) console.warn(`warning: ${path.basename(dst)} is ${(bytes / 1048576).toFixed(1)} MB, over the 15 MB publish limit.`);
  addRound({ id, label, src: "img/" + path.basename(dst), w: o.w, h: o.h, source: src, scale: +(o.w / info.w).toFixed(6), added: new Date().toISOString() });
}

// ---------- live rounds, step 2: the uploaded asset ids ----------
const ASSET_ID = /^[0-9a-f]{32}$/;
// the `rounds` doc gives the files as asset ids
const roundDoc = (im) => entryOf(im, (x, k) => (k === "src" ? x.asset : x.posterAsset || ""));
const liveDocs = [];
for (const spec of opt.assets) {
  const [rid, ids = ""] = spec.split("="), [a, pa] = ids.split(",");
  const im = board.images.find((x) => x.id === rid);
  if (!im) { console.error("No round with id " + rid + " on this board."); process.exit(1); }
  if (!ASSET_ID.test(a || "") || (pa && !ASSET_ID.test(pa))) { console.error("Asset ids are 32 hex characters, as the upload result gives them: " + spec); process.exit(1); }
  if (im.type === "video" && !pa) console.warn(`note: ${rid} is a video; pass its poster's asset id too (--asset ${rid}=<video id>,<poster id>).`);
  im.asset = a; if (pa) im.posterAsset = pa; im.live = true;
  fs.mkdirSync(path.join(out, "live"), { recursive: true });
  const f = path.join(out, "live", rid + ".json");
  fs.writeFileSync(f, JSON.stringify(roundDoc(im), null, 2) + "\n");
  liveDocs.push([im, f]);
}
if (opt.subtitle) board.subtitleAuto = false;
if (!board.subtitle || board.subtitleAuto !== false) {
  board.subtitleAuto = true;
  const one = board.images[0], nv = board.images.filter((im) => im.type === "video").length, ni = board.images.length - nv;
  board.subtitle = board.images.length === 1
    ? (one.type === "video" ? `${one.label} · ${one.w} × ${one.h} · ${one.dur.toFixed(1)} s at ${one.fps} fps` : `${one.label} · ${one.w} × ${one.h} px`)
    : [ni ? ni + " image" + (ni > 1 ? "s" : "") : "", nv ? nv + " video" + (nv > 1 ? "s" : "") : ""].filter(Boolean).join(" · ");
}

// ---------- page ----------
// a live round is in the page only once its file is in the asset store (served at /_blob/<id>); until then the page gets
// it from the `rounds` collection, or not at all
const inPage = board.images.filter((im) => !im.live || im.asset);
// a baked-in live round is served from the asset store; the rest from img/. The subtitle goes in through __SUBTITLE__.
const pageSrc = (im, k) => (!im.asset ? im[k] : k === "src" ? "/_blob/" + im.asset : im.posterAsset ? "/_blob/" + im.posterAsset : "");
const cfg = { title: board.title, key: board.key, url: board.url || "", images: inPage.map((im) => entryOf(im, pageSrc)) };
// the newest render (the last one added): the board opens on it for every viewer after each new round, and its tab
// reopens if it had been closed
const start = inPage.reduce((a, im) => (!a || (im.added || "") >= (a.added || "") ? im : a), null);
cfg.newest = start.id;
const first = cfg.images.find((i) => i.id === start.id);
const html = fillTemplate(templateHtml, cfg, { title: board.title, subtitle: board.subtitle, firstSrc: first.poster || first.src });
fs.writeFileSync(path.join(out, "index.html"), html);
fs.writeFileSync(boardFile, JSON.stringify(board, null, 2) + "\n");

// ---------- publish hints ----------
const files = Object.fromEntries(added.flatMap((im) => [[im.src, path.join(out, im.src)], ...(im.poster ? [[im.poster, path.join(out, im.poster)]] : [])]));
console.log(`Board: ${board.title} (${board.subtitle})`);
for (const im of added) console.log(`  + ${im.id}: ${im.type === "video" ? "video · " : ""}${im.label} · ${im.w}×${im.h}${im.type === "video" ? ` · ${im.dur}s @ ${im.fps}fps` : ""} · ${(fs.statSync(path.join(out, im.src)).size / 1048576).toFixed(1)} MB${im.scale !== 1 ? ` · scaled ${im.scale}` : ""}`);
const CAPS = '{"db": {}, "user": {"scopes": ["profile"]}, "comments": {}, "assets": {}}';   // comments: Send to Claude; assets: live rounds and pictures pasted into notes
if (opt.live) {
  const up = added.flatMap((im) => [path.join(out, im.src), ...(im.poster ? [path.join(out, im.poster)] : [])]);
  console.log("\nLive round (no republish). 1) Upload with the Artifact tool:");
  console.log(`  url: ${board.url}\n  asset: true\n  file_paths: ${JSON.stringify(up)}`);
  console.log("2) Then record the ids the upload returns:");
  for (const im of added) console.log(`  node "${fileURLToPath(import.meta.url)}" --out "${out}" --asset ${im.id}=<id of ${path.basename(im.src)}>${im.poster ? `,<id of ${path.basename(im.poster)}>` : ""}`);
  console.log('   (the board must declare "assets": if the upload is refused for that, republish it once with ' + CAPS + ")");
  process.exit(0);
}
if (liveDocs.length) {
  console.log("\nAnnounce the round(s) with ArtifactData (no republish; open views show a notice with an Open button):");
  for (const [im, f] of liveDocs) console.log(`  action: "set", url: ${board.url}, collection: "rounds", doc_id: "${im.id}", file_path: "${f}"`);
  console.log("index.html now carries the round too, for the next republish (no need to republish for it).");
  process.exit(0);
}
console.log("\nPublish with the Artifact tool:");
console.log("  file_path: " + path.join(out, "index.html"));
console.log("  files: " + JSON.stringify(files));
console.log(board.url
  ? `  url: ${board.url}  (redeploy: same file_path; pass url from another conversation; omit icon)\n  capabilities: ${CAPS}  (pass the full set on EVERY publish: a board missing "comments" can't send to Claude)`
  : `  capabilities: ${CAPS}\n  icon: "pencil"\nThen save the artifact URL into board.json ("url") so later rounds reuse it.`);
