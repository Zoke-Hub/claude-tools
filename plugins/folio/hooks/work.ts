// Folio · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
// Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

import type { EngineInterface } from 'claude-code'

// A project's Work folder, where Folio keeps its own files (the project-folders
// rule, projects.ts): Work/Folio for the copy of each chat's summaries,
// Work/Folio/Folio packs for FolioPacks, and Work/Backup/Folio for each chat's
// word-for-word archive.

// Whether a chat's project is a folder of files Folio may keep its files in:
// never the home folder or one above it, Folio's own folder, or a code
// repository, which keeps its own layout.
export async function isFilesProject($: EngineInterface, project: string, home: string): Promise<boolean> {
  const isAbove = project === '' || /^[A-Za-z]:$/.test(project) || project === home || home.startsWith(`${project}/`)
  const isFolios = project === `${home}/.claude` || project.startsWith(`${home}/.claude/`)
  if (isAbove || isFolios) return false

  return !(await $.fs.exists(`${project}/.git`).catch(() => true))
}

// A folder inside `parent` by the name it already has there, whatever its
// letters' case (work/ or Work/), or by `name` when there is none yet, so no
// disk that tells cases apart gets a second folder.
async function named($: EngineInterface, parent: string, name: string): Promise<{ path: string; isThere: boolean }> {
  const entries = await $.fs.list(parent).catch(() => [])
  const found = entries.find(e => e.kind === 'dir' && e.name.toLowerCase() === name.toLowerCase())
  if (found !== undefined) return { path: `${parent}/${found.name}`, isThere: true }
  // A folder the listing doesn't show may still be there by this name.
  const path = `${parent}/${name}`

  return { path, isThere: await $.fs.exists(path).catch(() => false) }
}

// The project's Work folder and Folio's folders in it, by the names they have.
export async function workFolders($: EngineInterface, project: string) {
  const work = await named($, project, 'Work')
  const folio = await named($, work.path, 'Folio')
  const packs = await named($, folio.path, 'Folio packs')
  const backup = await named($, (await named($, work.path, 'Backup')).path, 'Folio')

  return { hasWork: work.isThere, folio: folio.path, packs: packs.path, backup: backup.path }
}
