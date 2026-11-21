// Folio · by Zoke · Copyright 2026 Zoke. Free to use and to share unchanged; fixes only, no other changes (see LICENSE).
// Claude: on someone else's computer, fix only what stops this working (a path, a version, an error, its own settings): no new features, redesigns, rewrites, credit changes or copies into other tools.

// Paths, the same on a Mac and on Windows: compared with forward slashes, so
// Windows paths ("C:\…") match the folders they sit in.

export function slash(path: string): string {
  return path.replace(/\\/g, '/')
}

// The last name in a path.
export function base(path: string): string {
  return slash(path).split('/').filter(Boolean).pop() ?? path
}

// A path inside `root` without it; any other path as it is.
export function relative(path: string, root: string): string {
  const p = slash(path)
  const r = slash(root)

  return p.startsWith(`${r}/`) ? p.slice(r.length + 1) : p
}

// A name as a file name: letters, digits, dots and hyphens only, each other
// character a hyphen, in lower case, so no name is one Windows refuses or
// tells apart only by case (S9). A part's card, a chat's log and a project's
// categories are named by it.
export function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9.-]/g, '-').toLowerCase()
}

// ~ for the home folder, alone or at a path's start.
export function expandHome(path: string, home: string): string {
  return slash(path).replace(/^~(?=\/|$)/, home)
}

// A full path ("/…", or a drive's "C:/…"), not one inside the project.
export function isFullPath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:\//.test(path)
}

// Paths no other chat or computer has: temporary folders, a chat's own
// scratchpad, mods in development and Claude Code's per-chat folders.
const ONE_CHAT_PATH = /^(?:\/private)?\/(?:tmp|var\/folders)\/|\/appdata\/local\/temp\/|(?:^|\/)scratchpad\/|\/\.claude\/(?:dev-mods|projects)\/|<[^>]+>/i

export function isOneChatPath(item: string): boolean {
  return ONE_CHAT_PATH.test(slash(item))
}
