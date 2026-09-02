# The Codex

**Audience:** A GM building a campaign codex, or a player reading one.

How to add entries, find them again, connect them to each other, and decide who can see
them.

The codex is a list of everything in your world worth remembering: people, places,
factions, artifacts, events. Open it from the **Librarian** button in the menubar, then
**Codex**.

## Add an entry

GM only.

Click **Add Codex Entry** in the codex window's title bar. The form asks for:

- **Name** -- required. Everything else can wait.
- **Summary** -- the short text shown on the card. A couple of sentences; the long version
  goes in Expanded Details.
- **Plot Hook** -- GM only, always. Players never see it, on the card or on the page.
- **Category** -- how entries are grouped in the browser. Type a new one to create it.
- **Location** -- a path like `Faerun > Moonsea > Phlan`. Each level gets its own labelled
  row on the card, and becomes a link if an entry by that name exists.
- **Related Entries** -- other codex entries, by name, comma separated.
- **Links** -- actors, items or journals. Drag them onto the form, or type a name.
- **Tags** -- comma separated, and shared with the rest of the Coffee Pub suite.
- **Expanded Details** -- the full write-up, edited with Foundry's usual rich text editor.
  This is what **Read more** opens.

You can drag an actor, item or journal entry onto the form to prefill the name, image and
description.

To change an entry later, use **Entry options** on its row, then **Edit Entry**.

## Names, not links: how entries connect

Related entries and location levels reference other entries **by name**, not by a link you
have to maintain.

The practical consequence is that you can reference something you have not written yet.
Give an entry a related entry called `Moonsea` before any such entry exists and the name
sits there as plain text. The moment you create an entry named Moonsea, it becomes a link,
everywhere it was mentioned. Nothing to go back and fix.

The same is true of location paths. An entry in `Faerun > Moonsea > Phlan` links each of
those three levels as and when they exist as entries.

## Find an entry

Type in the search box at the top of the window. It filters as you type, matching names and
entry contents. The **Clear search** control beside it empties it again.

The **Toggle tag filters** control shows or hides the tag list. Click a tag to narrow the
list to entries carrying it; click it again to release. Search and tags work together --
both must match.

The count at the bottom left tells you how many entries are showing out of how many exist.
When a filter is active it reads as "N of M", which is how you tell "the codex is small"
from "a filter is hiding most of it".

Category headings collapse and expand: click the heading or its arrow. The browser
remembers which you collapsed, per person.

## Read an entry

Click a card to expand it in place. **Read more** opens the entry's own journal page, which
shows the same fields plus the full Expanded Details.

A card shows the summary, plot hook (GM only), links, related entries, the location path and
tags. Entries begin collapsed; the ones you expand stay expanded for you.

## Decide who sees it

GM only. **New entries start hidden -- no player sees one until you reveal it.**

The eye control on an entry's row toggles it: **Show to Players** or **Hide from Players**,
and the icon reflects the current state.

Reveal is per entry. There is no way to reveal a whole category at once.

A player who already has the codex open will not see a newly revealed entry until they close
and reopen the window.

## Put an entry on the map

Two separate controls, and they do different things:

- **Pin to scene** places a marker for this entry on the current scene. Once placed, the
  control becomes **Unplace pin from this scene**. If the entry is pinned on a different
  scene, the control says so.
- **Show on Canvas** jumps the canvas to an existing pin rather than creating one.

Double-clicking a codex pin on the canvas opens that entry in the browser.

See [Canvas pins](userguide-canvas-pins.md) for how pins behave.

## Other things on the options menu

**Entry options** on a row:

- **Open Journal Page** -- the underlying Foundry page.
- **Edit Entry** -- the edit form.
- **Configure Pin** and **Clear Pin** -- pin appearance and removal.
- **Delete Entry** -- removes the entry and its page.

The window's **...** menu, under **Codex options** (GM only unless noted):

- **Refresh Codex** -- rebuild the list. Available to everyone.
- **Open Codex Journal** -- the journal holding every entry. Available to everyone.
- **Select Journal for Codex** -- choose which journal that is.
- **Auto-Discover from Party Inventories** and **Auto-Link Unresolved Links** -- see
  [Importing and exporting](userguide-importing.md).
- **Import Codex from JSON** and **Export Codex as JSON** -- same guide.
