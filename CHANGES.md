# What's new in Folio, PulseWise and MarkRoom

Newest first, each entry dated. A version number can stay the same from one entry to the next, so an update goes by the
date: the entries after the date a tool's copy was installed on a computer are new there.

## 2026-11-23 · Folio 1.0.0 (number unchanged), later

- **Folio, FolioPack lists by the project's own folders:** a section for each folder at the project's top (Animations,
  Renders, Segments, References, Work first, then the rest by name), its folders as rows, the files at the top, caches
  last; the same in This chat and Whole project. The Renders folder shows as it is kept: Drafts first, then Final, each
  with its animations inside. Haiku only splits the files that sit together in one folder by kind, and a file never
  leaves its folder. System files (`.DS_Store`, `Thumbs.db`) are left out.
- **Folio, FolioPack faster:** Haiku sorts at low effort with room to answer (it used to spend its whole cap thinking,
  about 28 seconds a call, and give no answer); a batch that got no answer isn't asked again for 6 hours while its files
  stay the same; files in the Renders folder aren't sent to Haiku.

## 2026-11-23 · Folio 1.0.0 (number unchanged)

- **Folio, project folders:** a short rule in every chat (`projectLayout`, about 400 tokens) for laying out a
  project's folders: `Animations`, `Renders/Drafts` and `Renders/Final` by animation, `Segments` by animation, sorted
  `References`, and `Work` for everything else (`Work/Scripts`, `Work/Backup` and a folder for each tool), with a
  README at the top and folder names starting with a capital letter. Claude offers to tidy a project that has drifted
  and moves files only on a yes. A project's own layout rule comes first, and a code repository keeps its own.
- **Folio, where new files go:** the note on where a project already keeps each kind of file has a setting of its own
  now, `projectPlaces` (it was `projectLayout`, which is the folder rule's from today). It comes after the folder rule
  and fills in where a project doesn't follow it yet, or where the rule names no place; with the folder rule off, it
  reads as before. If you turned `projectLayout` off to stop the note, turn `projectPlaces` off instead.
- **Folio, a copy in the project:** in a project with a `Work` folder at its top, each chat's Folio files are copied
  there as Folio writes them (`projectCopies`, on): the summaries, part cards, tasks and ledger in `Work/Folio/<chat>/`,
  and the originals, shortened outputs and log in `Work/Backup/Folio/<chat>/`. Folio still reads only its own store,
  never copies the private file, and writes no copy in the home folder or a code repository.
- **Folio, FolioPack:** with Saves to empty, a pack goes to the project's `Work/Folio/Folio packs` (or `~/FolioPacks`
  with no project folder, or in a code repository), and nothing in that folder is packed again, whatever the case of
  the project's folder name. Renders kept by stage group under their animation; voiceover segments, the script and
  breakdown, and Work's folders get groups of their own. Each stage of a scan and of a pack goes to the log.
- **Folio, fixes:** FolioPack no longer hangs on a chat whose quoted script is full of JSON: braces inside quotes stay
  as written, and the path reader stops at 50 values as it goes.

## 2026-11-23 · PulseWise 1.0.0 (number unchanged)

- **PulseWise, a point handed to background work:** Claude's own count stands aside when the point's jobs report the
  work: while Claude's turn waits on that work with a count that never went past 0, or when the count's total is the
  steps of the point's one stepped job. No grey "waiting on its background work" block stuck at 0 drags the beat down.
- **PulseWise, one slow call:** while one of Claude's calls runs over 30 seconds with its count unchanged (an upload, a
  publish, a render), Claude's part stays where it stood as that call began, so the beat doesn't sink through the call.
- **PulseWise, the count tool:** it asks Claude not to count a point it hands whole to a background agent or job, and
  to send each new count as soon as a piece finishes, before a slow call.

## 2026-11-21 · Folio 1.0.0 (number unchanged)

A redesign of how Folio keeps a chat. A chat's saved data upgrades the first time it loads: the old `index.json` is kept
beside it as `index.v1.json`, nothing is deleted, and every part keeps its number.

- **Folio, parts and tasks:** a part is one turn of the chat. Long turns are cut into legs of about 40k, short turns
  join the part before, and every part belongs to a task (T1, T2…). Each part has a card on disk (`parts/`), with the
  chat's `tasks.json` and `ledger.json`.
- **Folio, the ledger:** rules, decisions, terms, values and open tasks, each with an id and a status, in place of the
  brief that only grew.
- **Folio, the folded history:** a map with a fixed budget: the tasks, the parts' headings, values by task, the brief and
  "State now". Exact values (ids, colours, paths, numbers) stay in the context. Old big tool inputs and outputs become
  one-line notes that say how to recall them.
- **Folio, folding:** sizes are real tokens, through a ratio measured per chat. A fold starts at the ceiling and goes down
  to the floor: Light 550k to 350k, Balanced 400k to 250k, Lean 300k to 180k, Custom one slider with the floor at
  62.5%. A fold that can't pay for itself waits. In Automatic, a fold also runs after an idle hour, and can happen in the
  middle of a reply when Claude Code compacts there.
- **Folio, recall:** new parameters (`part`, `kind`, `depth`, `amount`, `ask`, and `asks` for several at once); no model
  unless asked, whole messages and no repeats; an exact phrase or a short message comes first. A prompt or a subagent's
  brief that names something only folded parts hold gets one pointer line.
- **Folio, the log:** one dated file per chat per day in `~/.claude/folio/log/`: Haiku calls, folds, waits and recalls, as
  sizes and kinds only, never the chat's words.
- **Folio, the panel:** the strategies in a frame with the slider on its own row; the parts grouped by task, with the
  tasks under the chat strip; Open tasks; Recent activity, one line per recall with real icons; the meter red past the
  ceiling; FolioPack pinned at the bottom under a rule. It also draws in the terminal, VS Code and mobile.
- **Folio, removed:** pins and Brought back, side-message tidying and Put back, joins, Worth a look, the heads-up toast,
  and the "folds next" count and colours (the meter's figure turns red past the ceiling instead).
- **Folio, FolioPack:** Haiku sorts the project's files into categories (renders under each animation, segment and final
  renders apart); Folio's rules fill the gaps and take over when Haiku gives no answer, and answers are kept per
  project. Packs carry each part's card, the tasks and the ledger (pack form 3); older packs still open.
- **Folio, fixes:** the chunks wrongly marked "compacted" are found and repaired on upgrade; a failed or cut-short first
  load no longer empties a chat; a saved file Folio can't read is kept aside, never written over.
- **Folio, settings:** `shortenOutputs` now shortens only outputs over 20,000 characters, never file reads or outputs
  inside subagents; `promptPointers` (on) and `foldNote` (off until tried in the app) are new. The note on where the
  project keeps its files (`projectLayout`, 2026-11-19) carries on as before.

## 2026-11-20 · MarkRoom 1.0.0 (number unchanged)

- **MarkRoom:** the save status beside "Notes on the whole image" is one short word that fits beside the heading even in
  the narrowest notes column ("Saving…", "Saved", "Local"), never cut off with "…". Its full sentence shows the moment
  the pointer is on it, and screen readers hear it. A save that fails shows its whole message under the heading, in the
  warning colour, until it goes through. The heading keeps its height while typing, so the box under it no longer
  jumps when the Open chip appears.

## 2026-11-20 · PulseWise 1.0.0 (number unchanged), later

- **PulseWise:** a job no longer lands on the wrong agent's beat. A job goes to the agent that started it, else to the
  agent named most like it, not the first agent sharing two words with it.
- **PulseWise:** each background agent that does work gets the progress lines in its brief from PulseWise itself: its
  job's name (the agent's own) and its point's number, so it lands on its own beat; agents that only look things up
  are left alone. Claude no longer writes these lines.
- **PulseWise:** a step's numbers count the items inside it, never its place in the list, and `progress.py step` takes
  `--unit` ("Tests · 14 / 16 tests"). Steps reported late or skipped over share the time since the last report
  instead of counting for nothing, and the first step runs from the start. The helper is version 7.
- **PulseWise:** names. Claude is asked for names of 32 characters or fewer, telling words first, without what every
  point shares; an agent's model shows as a tag when it differs from the chat's; a beat whose one agent is named like
  it says "Agent (Fable)" once. Haiku labels a list's long names together, keeping each one's first word.
- **PulseWise:** a point is work ticked on its own; the reply and waiting for the person are not points. Short lists
  (three points or fewer, no background work) are not asked for an estimate; estimates take decimals and are clock
  time, and PulseWise corrects them by past ones itself (logged as `corrected_min`). A point an agent or job carries
  needs no count, and a new job with the same name as a stopped one is its redo.
- **PulseWise:** hover boxes follow the pointer: the app no longer turns them into cards that came back after a click
  or a redraw. They are a solid strip inside the band, under the pulse, on a track's title row, or beside the buttons.

## 2026-11-20 · PulseWise 1.0.0 (number unchanged)

- **PulseWise:** a job no longer sits on the bar with "no report" for good. A command that is stopped or fails takes
  the helper job it reports with it, whichever way it ends (an agent's own command when Claude stops the agent
  included); an agent Claude stops, or that fails, takes its own step-by-step jobs with it, while one that only
  finished its turn leaves them waiting. A job with no report for 2 hours leaves the bar as stopped (its file is left
  open, so a late report brings it back).
- **PulseWise:** its tests fill in the fields Claude Code 2.1.326 added to an agent's entry.

## 2026-11-19 · Folio 1.0.0 (number unchanged)

- **Folio:** where new files go. As a chat starts, Folio reads where the project already keeps renders, editing and
  design projects, references and sound, and tells Claude in a short note to save new files of each kind there (a
  skill's own place still wins). Folders that differ in one name only read as one place (`segments/<animation>/renders`),
  and renders numbered by round keep their numbering. Auto-save, backup and scratch folders don't count, and in a
  folder of several projects a place counts only when every project keeps that kind there. Nothing is moved or
  renamed; a project with no clear layout, one too big to read whole, and the home folder get no note. A new setting,
  `projectLayout`, turns it off.

## 2026-11-19 · PulseWise 1.0.0 (number unchanged)

- **PulseWise:** a beat fills from what it is told. Claude counts its own work on a point through a new `count` tool
  ("Claude · 2 / 5 edits"), and the empty "no count for Claude's own work" part is gone: an uncounted Claude part
  never shows beside jobs, and a point whose jobs are done stops just short of full until it is ticked.
- **PulseWise:** Claude is reminded to count a point after 8 of its calls without one, and asked about a background
  command still running 20 calls on with no count (it keeps running, or it is done). Nudge asks for the list, the
  counts and that background work.
- **PulseWise:** servers and watchers stay off the pulse: a track that says "serving", never holding the bar open.
  A command and the helper job its script starts show as one bar, and a job can name its point (`--point 3`).
  Background work started right after Claude counts a point joins that point.
- **PulseWise:** list changes show at once (points added, taken off, renamed); a point renamed in place keeps its
  time and count. A long name gets a short label from Haiku instead of Claude being asked to send the list again.
- **PulseWise:** a new list asks Claude for an estimate (an `estimate` tool), and each finished list is written to
  `~/.claude/progress/eta-log.jsonl` with the real times, waits for the person left out; the next estimate ask says
  how the past ones turned out. The helper is version 6 (`--point` takes the point's number).
- **PulseWise:** Other pulses shows every local chat on this computer, from any project (a chat in another project
  names its folder on its row). It finds the Claude app's chat records where the app from the Microsoft Store now
  keeps them (`%LOCALAPPDATA%\Claude-Data`), so other chats' titles show again and a finished chat leaves once you
  open it, or if you were on it when it finished, instead of staying up to two hours; an archived chat leaves at once.
- **PulseWise:** the end of Claude's turn (wrap_up) no longer ticks every point while this chat's background work
  still runs, so a point waiting on that work (an install after a retest) stays open. A script that starts its
  helper jobs one after another keeps them all on its command's point, and one piece of work outside the list
  names its own beat instead of "Other work".

## 2026-11-19 · MarkRoom 1.0.0 (number unchanged)

- **MarkRoom:** a link to a live round now opens it when the link opens a closed board. The page used to look for the
  linked round only in the first batch of rounds it was sent, which can come from the app's cache without it; then
  the newest round came forward instead. The link now waits for its round however the rounds arrive, and for an
  anchor the app sets just after the page loads; the viewer's first click or key press drops a link still waiting.
- **MarkRoom:** a new round comes forward only where it belongs: in the tab on screen, or in a related tab. A file
  built with `build_board.mjs --for "<tab>"` (a character sheet for an animation's tab, say) is related to that
  tab, and files made for the same tab are related to each other. A round in an unrelated tab moves no one: the
  corner notice says it has arrived, with Open. A note being typed still holds a round back until it is saved. A
  round you were only told about comes back as a notice on your next visit until you open or dismiss it, and
  `--for` warns when no tab on the board has the name it gives.
- **MarkRoom:** dismissing a newer file's notice no longer marks a live round as unseen, which brought an
  already-seen round forward again on the next visit. A scroll or zoom also drops a link still waiting for its round.
- **MarkRoom:** the Version list sits at the far right of the header, outside the tab row, so it never scrolls away.
- The page's version stamp is now 4 (`--link` reads it as before). A board gets these changes from its next republish.

## 2026-11-17 · MarkRoom 1.0.0 (number unchanged)

- **MarkRoom:** a link Claude sends opens the file it names on every board, whatever page the board was published
  with. A board only gets new page code from a republish, and pages from before `#open-<file id>` links opened the
  first tab for them. The page now carries its version (`markroom-page`), `build_board.mjs --published` records
  which one a board's published copy runs, and `--link <file id>` prints the link in the form that page reads: the
  plain `#<file id>` for an older page (with a one-time note that a republish would update it), else `#open-`.
  The current page also opens a plain `#<file id>`, a live round included, so links in older messages keep
  working after a republish; the page's own anchor still keeps your place.

## 2026-11-15 · Folio 1.0.0 (number unchanged)

- **Folio:** the Custom slider's knob is a larger disc (about 10 px, a little past the 8 px track) and sits on the
  track's centre; before, it was smaller than the track and 1 px low. The knob travels the whole slider on a layer of
  its own, so at the lowest or highest stop it covers that rounded end, with nothing past it. The fill is a gradient
  fixed to the track, blue up to 500k and blending to amber at 550k, so neither rounded end changes colour during a
  drag. After the code is reloaded the slider sets its pointer listener again, once, so the knob can't stay where it
  was dragged while the panel keeps its old value.

## 2026-11-15 · PulseWise 1.0.0 (number unchanged)

- **PulseWise:** a job's counts land on its own point. A job whose helper names only the shell or interpreter running
  it ("bash", "python") is matched to its command by the script file it runs, or by its name in the command
  (`progress.py run --name "..."`), so the command and its job show as one bar instead of two. With two points running
  side by side, a job that no command reports joins the one its name fits, not just the one listed last.
  A job first read before its command came in is linked at its next report, so the point's % counts that work once.
- **Shorter names:** Claude is asked to keep every point, job and background description to 32 characters, summarised,
  so the bar and its hover boxes show them whole; a list with longer names gets a note asking for it again with them
  summarised, and the list sent so keeps its points' times. A command still running after Claude finished no longer
  carries "left running after Claude finished" in its label.

## 2026-11-14 · Folio 1.0.0 (number unchanged)

- **Folio:** a fold no longer leaves its whole folded history in the chat. The fold's message is one short line
  ("[folio: folded history] Earlier parts of this chat were folded by Folio; …"), and Claude gets the same history
  in a context block of its own (`folio-history`), sent again after every fold, FolioPack rebuild and compaction.
  Folds made before keep their long messages until the next fold folds them away.
- **FolioPack:** "This chat" also lists files a shell command made or used (renders above all), from the chat's
  commands, old chats included: a file a command names, and in a folder a command names, the files that changed
  while the chat ran. Renders are grouped under their animation's name (the nearest folder above the renders folder
  that isn't a working folder such as anim or comp), with a row per place when one animation has renders in several.

## 2026-11-14 · PulseWise 1.0.0 (number unchanged)

- **PulseWise:** the beats' click and hover areas line up with the beats again. Each picture now sits in a box exactly
  as wide as the columns its click areas use and fills it, so the two stretch together whatever width the app gives
  the band; before, a picture sized in pixels could come out wider than its click areas, which then sat further left
  the further right a beat was. The pulse's and the other chats' bars are also pressed level with where they are drawn
  (they sat 1 px high).

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
