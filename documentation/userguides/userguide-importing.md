# Importing and Exporting

**Audience:** A GM bringing existing campaign notes into Librarian, or taking them back out.

How to get material you already have into the codex and the quest log without retyping it,
and how to get it out again.

GM only, throughout.

This is where your own material meets the module. If you keep campaign notes anywhere --
Obsidian, a document, a pile of text files -- importing is how they become a codex rather
than something you copy in by hand.

## The shape of it

Librarian imports JSON: a list of entries, each with the same fields the edit form shows.
You paste it into a dialog or load it from a file.

You do not have to write that JSON yourself. The import dialog has a **Copy Template**
button that puts a full description of the format on your clipboard, written as a prompt.
Hand that to an AI assistant along with your notes and it produces the JSON. That is the
intended path, and the prompt is filled in with your campaign's details automatically.

## Import codex entries

Codex window, **...** menu, **Codex options**, then **Import Codex from JSON**.

1. **Copy Template** puts the format description on your clipboard.
2. Produce the JSON -- by hand, or by giving that template and your notes to an assistant.
3. Paste it into the box, or use the file picker.
4. **Import JSON**.

Progress is reported in the window's footer as it runs.

**Importing the same material twice updates rather than duplicates.** Entries are matched
by their identifier if they have one, and by name otherwise, so a corrected export
re-imported changes the entries it matches instead of creating a second copy.

Two things are preserved rather than overwritten when an entry already exists:

- **Links you added by hand** are kept, because they are not in the JSON and could not be
  recovered from it.
- **Expanded Details** are only replaced if the import actually contains that field. An
  older export that predates your write-up will not wipe it.

## When links do not resolve

An entry can reference an actor, item or journal by name. On import, Librarian looks each
one up through Blacksmith's compendium mapping.

Names that resolve become links. **Names that do not are kept as plain text rather than
discarded** -- the relationship is still recorded, it simply is not clickable yet.

After an import you may be told how many are unresolved. **Auto-Link Unresolved Links**, in
the same menu, retries all of them. Run it after adding the missing documents to your world
or compendiums.

If a name you can see in your world refuses to resolve, the usual cause is Blacksmith's
Compendium Mapping not including the world as a source for that type. Player characters and
world NPCs live in the world, not a compendium. See [Known issues](../known-issues.md).

## Reveal entries the party has already found

**Auto-Discover from Party Inventories** scans what the party is carrying and reveals any
codex entry whose name exactly matches an item they hold. If someone has the *Map of Phlan*,
the **Map of Phlan** entry is revealed.

The match is exact and deliberately so: revealing an entry cannot be undone from the
players' memory, so a near-miss would spoil something permanently.

## Import quests

Quests window, **...** menu, **Import Quests from JSON**. The flow is the same, with its own
template.

Quest JSON can also carry canvas pin positions, so a quest export moved between worlds can
bring its map markers with it. Scenes are matched by name.

**Auto-Add Party Members to Imported Quests** is on by default. Every imported or
re-imported quest gains the whole party as participants. Turn it off in the settings if you
would rather assign participants yourself -- see [Settings](userguide-settings.md).

## Export

**Export Codex as JSON** and **Export Quests to JSON**, in the respective **...** menus.
Both offer the result for copying or as a file download.

**The codex export refuses to write an incomplete file.** It counts what it gathered against
what is actually in the journal and stops if they disagree, rather than quietly writing a
short file. A backup that looks complete and is not is worse than an error, so take a
refusal seriously and do not use that file as a backup.

**One rule that matters if you use exports as backups: never export the codex with Librarian
disabled.** Codex entries are a document type this module defines, so with the module off,
Foundry will not load them and anything reading that journal -- including Foundry's own
export -- sees an empty list and reports success. Enable Librarian, confirm the browser
lists your entries, then export.
