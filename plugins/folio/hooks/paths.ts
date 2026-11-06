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

// ~ for the home folder, alone or at a path's start.
export function expandHome(path: string, home: string): string {
  return slash(path).replace(/^~(?=\/|$)/, home)
}

// A full path ("/…", or a drive's "C:/…"), not one inside the project.
export function isFullPath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:\//.test(path)
}
