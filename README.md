# Folio, PulseWise and MarkRoom

Three tools for Claude Code, by Zoke. Install any one of them, or all three.

| Tool | What it does |
|---|---|
| [Folio](plugins/folio/README.md) | **A quiet archive that keeps long chats light.** It folds the older parts of a long chat into summaries and keeps every original on your computer, so Claude can recall any of it word for word. |
| [PulseWise](plugins/pulsewise/README.md) | **A live bar for everything Claude is doing.** A progress bar under the task list, filled by real work, with a bar for each background job. |
| [MarkRoom](plugins/markroom/README.md) | **Your review room: mark it, note it, and Claude changes it.** A review page for images and videos: you draw on them and write notes, and Claude reads the notes, makes the changes and replies on the same page. |

## Install

In a terminal, one line per tool:

```
claude plugin install folio --marketplace Zoke-Hub/claude-tools
claude plugin install pulsewise --marketplace Zoke-Hub/claude-tools
claude plugin install markroom --marketplace Zoke-Hub/claude-tools
```

Or in a chat: `/plugin marketplace add Zoke-Hub/claude-tools` once, then `/plugin install <tool>@zoke` for each.

Open a new chat afterwards. Each tool's README says what it needs and where it keeps its data.

**Updating:** send Claude "Update Folio, PulseWise and MarkRoom from https://github.com/Zoke-Hub/claude-tools: read its
UPDATE.md and follow it." It updates only the tools whose files changed, also when an update keeps the version number,
and says what's new from [CHANGES.md](CHANGES.md).

## Licence

Copyright 2026 Zoke. Free to use, paid work included, and to share unchanged; fixes only, no other changes. The "by Zoke" credit stays.
The full terms are in [LICENSE](LICENSE).
