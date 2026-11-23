// Folio · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
// Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

import type { EngineInterface } from 'claude-code'

// A copy of the open chat's Folio files inside its project, so a project holds
// its chats' work with the rest of it: the summaries' store (index, map, tasks,
// ledger, part cards) in <project>/Work/Folio/<chat>/, and the word-for-word
// archive (originals, shortened outputs) and the chat's log in
// <project>/Work/Backup/Folio/<chat>/ (work.ts finds those folders). Folio still reads and writes its own store in
// ~/.claude/folio; the copy follows each write, so recall never depends on a
// project folder being there (a project moved, or a drive away). private.json
// is never copied: every other file holds a placeholder for each private value.
type Copies = { chat: string; work: string; backup: string }

let copies: Copies | null = null

export function setCopies(c: Copies | null) {
  copies = c
}

// The two folders for a chat, inside the project's Folio and backup folders.
export function copiesIn(folders: { folio: string; backup: string }, chat: string): Copies {
  return { chat, work: `${folders.folio}/${chat}`, backup: `${folders.backup}/${chat}` }
}

// Where a stored file's copy goes, by its path inside the chat's store
// ("log/<date>.jsonl" for the chat's log); null for one never copied.
function copyPath(c: Copies, rel: string): string | null {
  if (rel === 'private.json') return null

  return /^(originals|outputs|log)\//.test(rel) ? `${c.backup}/${rel}` : `${c.work}/${rel}`
}

// Writes the copy of one stored file of this chat. A copy that can't be
// written is let go: the store is what Folio reads, and the next catch-up
// tries it again.
export async function copyTo($: EngineInterface, chat: string, rel: string, text: string): Promise<void> {
  const c = copies
  if (c === null || c.chat !== chat) return
  const to = copyPath(c, rel)
  if (to !== null) await $.fs.write(to, text).catch(() => {})
}

// Copies each stored file whose copy is missing or of another size: a chat's
// whole store the first time it is copied, then only what changed while the
// copy was off or a write was let go. `dir` is the chat's store, `logs` the
// folder of dated log folders.
export async function catchUp($: EngineInterface, c: Copies, dir: string, logs: string): Promise<{ copied: number; failed: number }> {
  let copied = 0
  let failed = 0
  const size = (path: string) => $.fs.stat(path).then(
    s => s.size,
    () => null,
  )
  const one = async (from: string, rel: string) => {
    const to = copyPath(c, rel)
    if (to === null) return
    const [a, b] = await Promise.all([size(from), size(to)])
    if (a !== null && a === b) return
    try {
      await $.fs.write(to, await $.fs.read(from))
      copied += 1
    } catch {
      failed += 1
    }
  }
  const visit = async (sub: string) => {
    const entries = await $.fs.list(sub === '' ? dir : `${dir}/${sub}`).catch(() => [])
    for (const e of entries) {
      const rel = sub === '' ? e.name : `${sub}/${e.name}`
      if (e.kind === 'dir') await visit(rel)
      else if (e.kind === 'file') await one(`${dir}/${rel}`, rel)
    }
  }
  await visit('')
  for (const day of await $.fs.list(logs).catch(() => [])) {
    const from = `${logs}/${day.name}/${c.chat}.jsonl`
    if (day.kind === 'dir' && (await $.fs.exists(from).catch(() => false))) await one(from, `log/${day.name}.jsonl`)
  }

  return { copied, failed }
}
