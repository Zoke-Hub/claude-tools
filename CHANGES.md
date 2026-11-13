# What's new in Folio, PulseWise and MarkRoom

Newest first, each entry dated. A version number can stay the same from one entry to the next, so an update goes by the
date: the entries after the date a tool's copy was installed on a computer are new there.

## 2026-11-14 · MarkRoom 1.0.0 (number unchanged)

- **MarkRoom:** Claude replies to each note as soon as its change is made, instead of all at once at the end, so the
  replies can be read while the work goes on and a misread note can be put right before the render. Notes are marked
  done together once the new round is up; a note changed after its reply is picked up again instead of being closed.
- **MarkRoom:** each note keeps where it stands in its own fields (replied and waiting for the round, changed since, not
  acted on, done), so a new chat reads it the same way, a note Claude chose not to act on stays open, and a Send pressed
  during the work doesn't start notes that are already handled over again. Moving a mark after Claude's reply now
  counts as a change, like editing the text, and opens the note again.

## 2026-11-13 · Folio, PulseWise and MarkRoom 1.0.0 (numbers unchanged)

Fixes for states that could get stuck or go out of step, each tested on the old and the new code, and a clean-up.

- **Folio:** after `/clear` the new chat starts on its own: nothing from the old chat is folded back in, packed twice or
  recalled. "Folding…" and "Packing…" never stick; a second Fold now or Undo during a reply waits its turn instead of
  replacing the first. New tool output is saved word for word even while older parts are being summarised. A recalled
  or pinned answer is looked up again once newer parts could change it, Unpin sticks, and pins age out. Restore and Undo
  no longer count a saving twice.
- **PulseWise:** a job that stops reporting shows "no report" instead of failing, and carries on if it reports again;
  no false "Stopped" toasts or taskbar flashes after the computer sleeps. A turn that ends with points open reads
  "waiting for your reply" and the bar stops counting. A waiting helper agent is no longer marked done. Jobs killed or
  cut off by a power loss don't come back on a reload. Each toast and flash happens once. The progress helper treats
  `sys.exit(0)` as done, closes every open job at exit, and keeps two updates to one job from crossing.
- **MarkRoom:** a note whose save fails is retried and the save chip stays in error until it lands; words typed in the
  whole-file note survive Claude replying to it; a note started and left empty is thrown away; after a version switch
  the range chip clears; undo goes to the file the step belongs to; a lost connection to the board reconnects.

## 2026-11-12 · MarkRoom 1.0.0 (number unchanged)

- **MarkRoom:** the tool bar's two thin dividers sit centred between their groups (about 12 px of clear space on each
  side), and the second one, between the colours and Undo, is drawn at all (it was hidden by another style).
- **MarkRoom:** new keys. Alt/Option + ← / → opens the tab to the left or right, and Alt/Option + ↑ / ↓ the newer or
  older version of the open tab (keeping your place, as the Version list does). Moving a tab along the row is now
  Alt/Option + Shift + ← / →, or a drag. None of them act while typing in a note.

## 2026-11-09 · MarkRoom 1.0.0 (number unchanged)

- **MarkRoom:** a board you come back to opens where you left it. The Claude app reloads a board when you return to its
  chat, and that reload used to land on the first file baked into the page; now each viewer's browser keeps the file
  they were on, its zoom and spot, and a video's moment (paused), live rounds included. A round that arrived meanwhile
  opens instead, keeping your place when it is a newer version of the same tab, with **Back** in the corner notice.
- **MarkRoom:** switching versions of a video keeps the playhead whenever the two renders have the same length and frame
  rate; a change in the beat labels no longer sends the other version back to the start.
- **MarkRoom:** a `#open-<file id>` link opens its file the first time it is followed in a browser, even over a newer
  live round; the same link brought back by a later reload counts as a plain visit.

## 2026-11-07, later · MarkRoom 1.0.0 (number unchanged)

- **MarkRoom:** dragging the playhead on a video's timeline shows the frames as it goes (one seek at a time, always to
  the newest spot), and so do held arrow keys and the −1f / +1f buttons. Clicking, double-clicking or dragging on the
  timeline, or dragging a tab, never selects text. New boards keep a keyframe every half second in their review videos
  (a render's own copy is re-encoded when its keyframes are further apart than a second), so the preview keeps up.

## 2026-11-07 · Folio 1.0.0, PulseWise 1.0.0, MarkRoom 1.0.0 (numbers unchanged)

- **MarkRoom:** a link Claude sends ends in `#open-<file id>` and opens that file directly, even when a newer round is
  waiting (that round still opens on the next plain visit); a link to a closed tab lands on the nearest open one.
  Whenever Claude changes something in a board, its message links straight to each file that changed.
- **PulseWise:** a background job started for a point of the task list is filed under that point. On Windows, when a
  long job or the whole list finishes while the Claude app is behind other windows, its taskbar button flashes until
  you come back. Its tests pass on Windows as well as the Mac.
- **Folio:** the context bar's hover texts name how much of each kind of work sits below and above the fold-back line
  (the two add up to the whole), and both parts of the room lead with the room left before the fold. Its tests pass on
  Windows as well as the Mac.
