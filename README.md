# Coffee Pub Librarian

![Latest Release](https://img.shields.io/github/v/release/Drowbe/coffee-pub-librarian)
![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/Drowbe/coffee-pub-librarian/release.yml)
![GitHub all releases](https://img.shields.io/github/downloads/Drowbe/coffee-pub-librarian/total)
![MIT License](https://img.shields.io/badge/license-MIT-blue)
![Foundry v13](https://img.shields.io/badge/foundry-v13-green)

Campaign knowledge for Foundry VTT: a **codex** of people, places, factions and
artifacts, and the **quests** that run through them.

Librarian is where campaign lore lives. A codex entry is a document in its own
right — its own subtype, data model and sheet — imported from wherever you
actually write (Obsidian, for one) rather than authored in a journal and left to
rot. Quests sit alongside it, tracked by objective and pinned to the canvas.

Part of the [Coffee Pub](https://github.com/Drowbe) suite. Requires
[Coffee Pub Blacksmith](https://github.com/Drowbe/coffee-pub-blacksmith), which
supplies the window chrome, pins, tags and shared APIs.

## Status

Early. Codex and Quests have both moved here from Coffee Pub Squire, where they
grew up inside a character tray that was never the right home for campaign
content. See [`documents/TODO.md`](documents/TODO.md) for what is open and what
has landed.

## Why not Squire

Squire runs a character: the token you have selected, its items, its spells, its
health. Codex and quests describe the world instead — they do not care which
token is selected, and they were the larger half of a module named for the
smaller one.

The dividing line the suite settled on: **owning a document subtype means owning
a domain.** Codex declares one. That is what makes this a module rather than a
panel.

## Installation

**Manifest URL** — paste this into Foundry:

```
https://github.com/Drowbe/coffee-pub-librarian/releases/latest/download/module.json
```

1. Inside Foundry VTT, select the **Game Modules** tab in the Configuration and Setup menu.
2. Click **Install Module** and paste the manifest URL above.
3. Click **Install** and wait for installation to complete.

Prefer to install by hand? Download
[coffee-pub-librarian.zip](https://github.com/Drowbe/coffee-pub-librarian/releases/latest/download/coffee-pub-librarian.zip)
and unpack it into your Foundry `Data/modules/` directory, so that `module.json` sits at
`Data/modules/coffee-pub-librarian/module.json`.

All releases, with their changelogs, are listed on the
[Releases page](https://github.com/Drowbe/coffee-pub-librarian/releases).

## Dependencies

- [Coffee Pub Blacksmith](https://github.com/Drowbe/coffee-pub-blacksmith) **13.19.0 or later** — required. Librarian uses its window framework, pins, compendium resolver, party roster, menubar, toast and dialog APIs, its global Handlebars helpers, and will not start without it.
- Foundry VTT v13 (v14 declared as maximum).
