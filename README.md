# Coffee Pub Librarian

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

Early. The module scaffold is in place; Codex and Quests are moving here from
Coffee Pub Squire, where they grew up inside a character tray that was never the
right home for campaign content. See `TODO.md` for the inventory and the
migration plan.

## Why not Squire

Squire runs a character: the token you have selected, its items, its spells, its
health. Codex and quests describe the world instead — they do not care which
token is selected, and they were the larger half of a module named for the
smaller one.

The dividing line the suite settled on: **owning a document subtype means owning
a domain.** Codex declares one. That is what makes this a module rather than a
panel.
