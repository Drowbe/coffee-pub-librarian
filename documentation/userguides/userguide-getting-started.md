# Getting Started

**Audience:** A GM or player who has just installed Librarian.

The first five minutes: what appears on screen, how to point Librarian at a journal, and
where to go next.

## What you need

Librarian requires **Coffee Pub Blacksmith**, version 13.20.0 or later, and will not start
without it -- Blacksmith supplies the windows, the canvas pins, the shared tags and the
compendium lookups. Foundry v13, D&D 5e.

## What changes when you enable it

A **Librarian** button appears in the Coffee Pub menubar at the top of the screen. Clicking
it opens a small bar underneath with two entries, **Codex** and **Quests**. Picking either
opens that browser and closes the bar again.

Everyone sees the button. What is inside differs: a player sees only what a GM has revealed
to them, which on a fresh install is nothing.

Nothing else changes. Librarian adds no automation, alters no sheets, and touches nothing
until you point it at a journal.

![The Librarian menubar button with its Codex and Quests bar, and both browsers open beside a scene](../assets/librarian-product.webp)

## Point it at a journal

GM only, and nothing works until this is done.

1. Open the **Codex** browser from the Librarian button.
2. Click the **...** menu in the window's title bar, then **Codex options**.
3. Choose **Select Journal for Codex** and pick a journal. Create an empty one named "Codex"
   first if you have none.

Repeat for quests: open **Quests**, then **...** -> **Select Journal for Quests**.

Both can also be set in the module settings, as **Codex Journal** and **Quest Journal**.

## Make one entry, to see it work

Click **Add Codex Entry** in the codex window's title bar. Give it a name and a summary and
save. It appears in the browser, grouped under its category.

It is invisible to your players until you reveal it -- click the eye control on its row.

That is the whole loop: make an entry, reveal it when the party earns it.

## Where to go next

- **[The codex](userguide-codex.md)** -- adding and finding entries, how they link to each
  other, and deciding who sees them.
- **[Quests and objectives](userguide-quests.md)** -- creating quests, moving objectives
  along, and quest states.
- **[Importing and exporting](userguide-importing.md)** -- getting notes you already have
  into the codex without retyping them. Start here if you have existing campaign material.
- **[Canvas pins](userguide-canvas-pins.md)** -- putting entries, quests and objectives on
  the map.
- **[Running a session](userguide-gm.md)** -- the GM's workflow, in session order.
- **[What players see](userguide-player.md)** -- what your table can and cannot look at.
- **[Settings](userguide-settings.md)** -- every setting and what changing it does.

## Coming from Coffee Pub Squire

If your campaign used Squire's codex and quest tray, both moved here. Squire runs a
character -- the selected token, its items, its spells. Codex and quests describe the world
instead, and they were the larger half of a module named for the smaller one.

Your data does not move on its own. If you have codex or quest content in a world that used
the old Squire tray, point Librarian's **Codex Journal** and **Quest Journal** at the same
journals Squire was using and it will read them. Codex entries created by Squire are a
different page type and will not display; re-importing them through
[Importing and exporting](userguide-importing.md) converts them as it goes.
