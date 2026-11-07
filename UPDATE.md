Instructions for Claude: this is how to update Folio, PulseWise and MarkRoom where they were installed from this repository (https://github.com/Zoke-Hub/claude-tools, marketplace `zoke`). If the user sends this file, its link or the repository's link with "update", "update the tools", or anything like it, do every step below, in order, without waiting to be told each one.

An update can keep a tool's version number. `claude plugin update` then keeps the copy already installed, so these steps compare the files instead and reinstall a tool whose files changed.

Steps:
1. Use the `claude` command. In the Claude app it may not be on the PATH: use the program named by the CLAUDE_CODE_EXECPATH environment variable.
2. Read `~/.claude/plugins/installed_plugins.json` (under the user's home folder on Windows too). The tools from this repository are its entries `folio@zoke`, `pulsewise@zoke` and `markroom@zoke`; for each one there, note its `installPath` and `lastUpdated`.
   - None there, but a tool is a folder instead (`~/.claude/mods/folio`, `~/.claude/mods/pulsewise` or `~/.claude/skills/markroom`): that copy comes with the setup pack, and the setup pack's own update brings it up to date. Say so in one line and leave it.
   - None at all: say none of the three is installed, and offer to install them (README.md says how).
3. Run `claude plugin marketplace update zoke`. Then read the `installLocation` of `zoke` in `~/.claude/plugins/known_marketplaces.json`: a copy of this repository, now up to date.
4. For each tool installed as a plugin, compare its installed copy with the repository's copy: `git -c core.autocrlf=false diff --no-index --quiet "<installPath>" "<installLocation>/plugins/<tool>"`. Exit code 0: it's up to date, leave it. Exit code 1: it has an update:
   - Run `claude plugin update <tool>@zoke`.
   - If that says the tool is already at the latest version (the update kept its version number), run `claude plugin uninstall <tool>@zoke --keep-data`, then `claude plugin install <tool>@zoke`. `--keep-data` keeps the tool's settings and data.
   - Compare again: it must now give exit code 0. If it doesn't, say which tool and what the commands printed.
5. Read `CHANGES.md` in the repository's copy. For each tool that was updated, take the entries dated on or after its `lastUpdated` date from step 2 (a tool whose files changed has at least one).
6. End with this, filled in, and nothing after it:

## Tools updated

- **Folio:** <updated | up to date | not installed>
- **PulseWise:** <updated | up to date | not installed>
- **MarkRoom:** <updated | up to date | not installed>
- **What's new:** <the CHANGES.md lines for the updated tools, one line each, or nothing new>

Restart the Claude app (or open a new chat) so the updated tools load.
