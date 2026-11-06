#!/usr/bin/env python3
# MarkRoom · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
# Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

"""Draw a MarkRoom board's notes onto its images so Claude can see each note in context.

    python render_marks.py --board <board dir or board.json> --marks <ArtifactData out_dir | marks.json> [--out <dir>]
                           [--overall <ArtifactData out_dir | json>] [--status open|done|all] [--image <id>]

Reads the note documents saved by `ArtifactData list` with `out_dir` (one JSON per note under .../marks/), or one
JSON file holding a list of documents. A note is one numbered comment with every mark drawn for it (`items`); older
one-mark documents (`kind` at the top) are read as a note with one mark. Writes, per image: <id>_marked.jpg (full
size) and <id>_marked_small.jpg (3000 px wide at most); per note: note_<n>.jpg, a close-up with all its marks drawn
in; and notes.md, every note with its marks, positions and status. --overall takes the `overall` collection (the
notes on a whole image or video); they head notes.md. --status keeps only open or done notes. Needs Pillow.

Video tabs: each note carries its time (t, t2 for a range). The frame at t is pulled with ffmpeg (ffmpeg-full first
if it's installed), the note's marks are drawn on it and saved as note_<n>.jpg (the whole frame), and notes.md gives
the timecode. A note with no marks still gets its frame.
"""
import argparse, glob, json, math, os, shutil, subprocess, sys, tempfile

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("Pillow is missing: run this with a Python that has it (python3 -m pip install pillow).")

COLORS = {"red": (224, 54, 44), "blue": (31, 102, 224), "green": (19, 146, 90), "ink": (31, 28, 26)}
KIND = {"pin": "Marker", "arrow": "Arrow", "box": "Box", "pen": "Drawing", "text": "Text"}
KINDS = {"pin": "Markers", "arrow": "Arrows", "box": "Boxes", "pen": "Drawings", "text": "Texts"}
FONT_PATHS = ["/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/System/Library/Fonts/Helvetica.ttc",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "C:/Windows/Fonts/arialbd.ttf"]


def font(size):
    for p in FONT_PATHS:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                pass
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def strokes(m):
    return [s.get("p", []) if isinstance(s, dict) else s for s in m.get("strokes", [])]


def as_note(body):
    """Version 2 docs hold `items`; a version 1 doc is one mark, and a text mark's words were its `text`."""
    if isinstance(body.get("items"), list):
        items = [dict(it) for it in body["items"] if isinstance(it, dict) and it.get("kind") in KIND]
        return dict(body, items=items, text=body.get("text") or "")
    k, words = body["kind"], body.get("text") or body.get("comment") or ""
    if k == "pen":
        items = [{"kind": "pen", "color": body.get("color"), "p": s} for s in strokes(body) if len(s) >= 2]
    else:
        items = [{key: body[key] for key in ("kind", "color", "x", "y", "x2", "y2") if key in body}]
        if k == "text":
            items[0]["label"] = words
    return dict(body, items=items, text="" if k == "text" else words)


def read_docs(path, skip=None):
    """Every document in an ArtifactData dump (a folder of JSON files, or one file holding a list or `documents`), as
    (file, document, body): body is the document's `data` when it has one. skip = a folder name whose files are left out."""
    files = sorted(glob.glob(os.path.join(path, "**", "*.json"), recursive=True)) if os.path.isdir(path) else [path]
    for f in files:
        if skip and os.path.basename(os.path.dirname(f)) == skip:
            continue
        with open(f) as fh:
            d = json.load(fh)
        for it in (d if isinstance(d, list) else d.get("documents", [d]) if isinstance(d, dict) else []):
            yield f, it, it.get("data", it) if isinstance(it, dict) else None


def load_notes(path):
    notes = []
    for f, it, body in read_docs(path, skip="overall"):
        if not isinstance(body, dict) or not ("items" in body or "kind" in body):
            continue
        note = as_note(body)
        if not note["items"] and not isinstance(note.get("t"), (int, float)):
            continue
        note.setdefault("id", it.get("id") or os.path.splitext(os.path.basename(f))[0])
        notes.append(note)
    return sorted(notes, key=lambda m: m.get("n", 0))


def summary(note):
    if not note["items"]:
        return "Note"
    counts = {}
    for it in note["items"]:
        counts[it["kind"]] = counts.get(it["kind"], 0) + 1
    return " + ".join(f"{c} {KINDS[k]}" if c > 1 else KIND[k] for k, c in counts.items())


def item_bbox(it, u=0):
    k = it["kind"]
    if k in ("arrow", "box"):
        return min(it["x"], it["x2"]), min(it["y"], it["y2"]), max(it["x"], it["x2"]), max(it["y"], it["y2"])
    if k == "pen":
        xs, ys = it["p"][0::2], it["p"][1::2]
        return min(xs), min(ys), max(xs), max(ys)
    if k == "text":
        lines = (it.get("label") or "").split("\n")
        return it["x"], it["y"], it["x"] + u * (5 + 2.9 * max(len(l) for l in lines)), it["y"] + u * (4 + 6.2 * len(lines))
    return it["x"], it["y"], it["x"], it["y"]


def note_bbox(note, u=0):
    bs = [item_bbox(it, u) for it in note["items"]]
    return min(b[0] for b in bs), min(b[1] for b in bs), max(b[2] for b in bs), max(b[3] for b in bs)


def anchor(note):
    x0, y0, x1, y1 = note_bbox(note)
    return (x0 + x1) / 2, (y0 + y1) / 2


def draw_item(d, it, num, u, done):
    """u = line unit in image px (scales with the image so marks read at a glance)."""
    c = COLORS.get(it.get("color"), COLORS["red"])
    if done:
        c = tuple(int(v * 0.45 + 255 * 0.55) for v in c)
    halo, lw, k = (255, 255, 255), max(2, round(u)), it["kind"]
    f = font(max(12, round(u * 4.2)))

    def badge(x, y):
        r = u * 3.6
        d.ellipse([x - r - u * 0.7, y - r - u * 0.7, x + r + u * 0.7, y + r + u * 0.7], fill=halo)
        d.ellipse([x - r, y - r, x + r, y + r], fill=c)
        d.text((x, y), num, font=f, fill=(255, 255, 255), anchor="mm")

    def line(pts):
        d.line(pts, fill=halo, width=round(lw * 2.2), joint="curve")
        d.line(pts, fill=c, width=lw, joint="curve")

    if k == "pin":
        x, y = it["x"], it["y"]
        d.line([(x, y), (x, y - u * 5)], fill=c, width=max(2, round(u * 0.6)))
        d.ellipse([x - u, y - u, x + u, y + u], fill=c, outline=halo, width=max(1, round(u * 0.5)))
        badge(x, y - u * 8.5)
    elif k == "arrow":
        ax, ay, bx, by = it["x"], it["y"], it["x2"], it["y2"]
        L = math.hypot(bx - ax, by - ay) or 1
        ux, uy = (bx - ax) / L, (by - ay) / L
        hl, hw = min(u * 7, L * 0.45), min(u * 7, L * 0.45) * 0.55
        line([(ax, ay), (bx - ux * hl * 0.6, by - uy * hl * 0.6)])
        head = [(bx, by), (bx - ux * hl - uy * hw, by - uy * hl + ux * hw), (bx - ux * hl + uy * hw, by - uy * hl - ux * hw)]
        d.polygon(head, fill=c, outline=halo)
        badge(ax, ay)
    elif k == "box":
        x0, y0, x1, y1 = item_bbox(it)
        d.rectangle([x0, y0, x1, y1], outline=halo, width=round(lw * 2.2))
        d.rectangle([x0 + lw * 0.6, y0 + lw * 0.6, x1 - lw * 0.6, y1 - lw * 0.6], outline=c, width=lw)
        badge(x0, y0)
    elif k == "pen":
        pts = list(zip(it["p"][0::2], it["p"][1::2]))
        if len(pts) > 1:
            line(pts)
        badge(*pts[0])
    elif k == "text":
        x, y = it["x"], it["y"]
        tf = font(max(12, round(u * 5)))
        text = (it.get("label") or "").strip() or "(empty)"
        tb = d.multiline_textbbox((x + u * 3, y + u * 2), text, font=tf)
        d.rectangle([x, y, tb[2] + u * 2.5, tb[3] + u * 2], fill=(255, 255, 255))
        d.rectangle([x, y, x + u * 0.9, tb[3] + u * 2], fill=c)
        d.multiline_text((x + u * 3, y + u * 2), text, font=tf, fill=c)
        badge(x, y)


def draw_note(d, note, u):
    """Every mark carries its note's number, so it's clear which marks belong together."""
    for it in note["items"]:
        draw_item(d, it, str(note.get("n", "?")), u, note.get("status") == "done")


def shift(note, dx, dy):
    items = []
    for it in note["items"]:
        it = dict(it)
        if "p" in it:
            it["p"] = [v - (dx if i % 2 == 0 else dy) for i, v in enumerate(it["p"])]
        for kx, ky in (("x", "y"), ("x2", "y2")):
            if it.get(kx) is not None:
                it[kx] -= dx; it[ky] -= dy
        items.append(it)
    return dict(note, items=items)


def describe(it, sc):
    """One mark in words, in image px with source px in brackets when the image was scaled."""
    p = lambda x, y: f"({round(x)}, {round(y)})" + (f" [source ({round(x / sc)}, {round(y / sc)})]" if sc != 1 else "")
    col, k = it.get("color", "red"), it["kind"]
    if k == "pin":
        return f"marker at {p(it['x'], it['y'])} {col}"
    if k == "arrow":
        return f"arrow from {p(it['x'], it['y'])} to {p(it['x2'], it['y2'])} {col}"
    if k == "box":
        x0, y0, x1, y1 = item_bbox(it)
        return f"box {p(x0, y0)}–{p(x1, y1)} {col}"
    if k == "pen":
        x0, y0, x1, y1 = item_bbox(it)
        return f"drawing over {p(x0, y0)}–{p(x1, y1)} {col}"
    return f"text “{it.get('label', '')}” at {p(it['x'], it['y'])} {col}"


def pics_line(m):
    """Pictures pasted into a note: their asset ids, to fetch with the Artifact tool (read, path = the id)."""
    ids = [a for a in (m.get("atts") or []) if isinstance(a, str) and len(a) == 32]
    return ("\n  - pictures pasted with the note (fetch each with the Artifact tool: read, path = the id): "
            + ", ".join(f"`{a}`" for a in ids)) if ids else ""


def note_line(m):
    return f"  - note: {m['text'].strip().replace(chr(10), chr(10) + '    ') or '(no note)'}"


def reply_lines(m, since=": work from the note and marks as they are now"):
    """Claude's reply, and a flag when the note changed after it (the whole-file notes say only that it changed)."""
    if not m.get("reply"):
        return ""
    return f"\n  - Claude replied: {m['reply']}" + (f"\n  - changed after that reply{since}" if m.get("edited") else "")


def ffmpeg_bin():
    for d in ("/opt/homebrew/opt/ffmpeg-full/bin", "/usr/local/opt/ffmpeg-full/bin"):
        if os.path.exists(os.path.join(d, "ffmpeg")):
            return os.path.join(d, "ffmpeg")
    return shutil.which("ffmpeg") or sys.exit("ffmpeg is needed to pull frames from a video tab.")


def tc(t, fps):
    fr = round((t or 0) * fps)
    return f"{fr // int(fps) // 60:02d}:{fr // int(fps) % 60:02d}:{fr % int(fps):02d}"


def frame_at(video, t):
    with tempfile.TemporaryDirectory() as d:
        out = os.path.join(d, "f.png")
        subprocess.run([ffmpeg_bin(), "-v", "error", "-y", "-ss", f"{max(0, t):.4f}", "-i", video, "-frames:v", "1", out], check=True)
        return Image.open(out).convert("RGB")


def render_video(im, mine, board_dir, out, lines):
    fps = im.get("fps", 25) or 25
    video = os.path.join(board_dir, im["src"])
    lines.append(f"\n## {im['label']} ({im['id']}, video {im['w']}×{im['h']}, {im.get('dur', '?')} s at {fps} fps, from {im.get('source', '?')})\n")
    for m in mine:
        t = m.get("t") or 0
        base = frame_at(video, t + 0.5 / fps)
        W, H = base.size
        u = max(2.0, min(W, H) / 260)
        dr = ImageDraw.Draw(base)
        draw_note(dr, m, u)
        when = tc(t, fps) + (f" → {tc(m['t2'], fps)}" if m.get("t2") is not None else "")
        stamp = f"#{m.get('n')}  {when}"
        f = font(max(14, round(u * 6)))
        tb = dr.textbbox((u * 4, u * 4), stamp, font=f)
        dr.rectangle([tb[0] - u * 2, tb[1] - u * 2, tb[2] + u * 2, tb[3] + u * 2], fill=(255, 255, 255))
        dr.text((u * 4, u * 4), stamp, font=f, fill=(31, 28, 26))
        name = f"note_{m.get('n', 0):02d}.jpg"
        base.save(os.path.join(out, name), quality=90)
        line = (f"- **#{m.get('n')}** {summary(m)} ({m.get('status', 'open')}) at **{when}** (t = {t:.3f} s) · frame `{name}`\n"
                + note_line(m))
        if m["items"]:
            line += "\n  - marks: " + "; ".join(describe(it, 1) for it in m["items"])
        lines.append(line + pics_line(m) + reply_lines(m))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--board", required=True)
    ap.add_argument("--marks", required=True)
    ap.add_argument("--out")
    ap.add_argument("--status", default="all", choices=["open", "done", "all"])
    ap.add_argument("--image")
    ap.add_argument("--overall", help="ArtifactData out_dir (or json) of the `overall` collection: the whole-image/video notes")
    a = ap.parse_args()

    board_json = a.board if a.board.endswith(".json") else os.path.join(a.board, "board.json")
    board_dir = os.path.dirname(os.path.abspath(board_json))
    board = json.load(open(board_json))
    out = a.out or os.path.join(board_dir, "feedback-render")
    os.makedirs(out, exist_ok=True)
    notes = [m for m in load_notes(a.marks) if a.status == "all" or m.get("status", "open") == a.status]
    first = board["images"][0]["id"]
    lines = [f"# {board.get('title', 'MarkRoom')} · {len(notes)} note(s)\n"]

    for im in board["images"]:
        if a.image and im["id"] != a.image:
            continue
        mine = [m for m in notes if m.get("img", first) == im["id"]]
        if not mine:
            continue
        if im.get("type") == "video":
            render_video(im, mine, board_dir, out, lines)
            continue
        base = Image.open(os.path.join(board_dir, im["src"])).convert("RGB")
        W, H = base.size
        u = max(2.0, min(W, H) / 260)          # line unit
        full = base.copy()
        dr = ImageDraw.Draw(full)
        for m in mine:
            draw_note(dr, m, u)
        full.save(os.path.join(out, f"{im['id']}_marked.jpg"), quality=90)
        small = full.copy()
        small.thumbnail((3000, 3000))
        small.save(os.path.join(out, f"{im['id']}_marked_small.jpg"), quality=88)
        lines.append(f"\n## {im['label']} ({im['id']}, {W}×{H}, scale {im.get('scale', 1)} of {im.get('source', '?')})\n")
        sc = im.get("scale", 1) or 1

        for m in mine:
            x0, y0, x1, y1 = note_bbox(m, u)
            if any(it["kind"] == "pin" for it in m["items"]):
                y0 -= u * 13
            pad = max(u * 40, 0.25 * max(x1 - x0, y1 - y0))
            box = [round(v) for v in (max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad))]
            crop = base.crop(box)
            draw_note(ImageDraw.Draw(crop), shift(m, box[0], box[1]), u)
            if crop.width < 1000:
                k = 1000 / crop.width
                crop = crop.resize((1000, max(1, round(crop.height * k))), Image.LANCZOS)
            name = f"note_{m.get('n', 0):02d}.jpg"
            crop.save(os.path.join(out, name), quality=90)
            ax, ay = anchor(m)
            line = (f"- **#{m.get('n')}** {summary(m)} ({m.get('status', 'open')}) around image x {round(ax)}, y {round(ay)} "
                    f"(source x {round(ax / sc)}, y {round(ay / sc)}) · crop `{name}`\n"
                    + note_line(m) + "\n  - marks: " + "; ".join(describe(it, sc) for it in m["items"]))
            lines.append(line + pics_line(m) + reply_lines(m))

    if a.overall:
        ov = [b for _, _, b in read_docs(a.overall) if isinstance(b, dict) and ((b.get("text") or "").strip() or b.get("atts"))]
        if ov:
            lines.insert(1, "\n## Notes on the whole image / video (the box at the top of the notes panel)\n")
            for i, b in enumerate(ov):
                ln = f"- **{b.get('img', '?')}** ({b.get('status', 'open')}): {(b.get('text') or '').strip() or '(pictures only)'}"
                lines.insert(2 + i, ln + pics_line(b) + reply_lines(b, since=""))
    with open(os.path.join(out, "notes.md"), "w") as fh:
        fh.write("\n".join(lines) + "\n")
    print(f"{len(notes)} note(s) -> {out}")


if __name__ == "__main__":
    main()
