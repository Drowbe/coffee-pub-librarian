# Settings

**Audience:** A GM configuring Librarian.

Every setting Librarian adds, what it does, and what happens when you change it.

Find them in Foundry under **Game Settings**, **Configure Settings**, **Module Settings**,
then Coffee Pub Librarian. All of these are world settings: a GM sets them and they apply to
everyone.

## Quests

**Quest Journal**

*The journal to use for quest entries. Each quest is a separate page in this journal.*

A dropdown of every journal in the world. Nothing about quests works until this points
somewhere -- the quest browser will open and stay empty.

Pick a journal you keep for this purpose. Changing it later does not move anything: the
browser simply starts showing the new journal's quests instead. The old ones are still in
the old journal.

You can also set this from the quest window's **...** menu, **Select Journal for Quests**.

**Quest Categories**

*Available categories for quests.*

The list quests are grouped by in the browser. Defaults to **Main Quest** and **Side
Quest**.

Removing a category does not delete quests filed under it, and imported quests whose
category is not on this list are filed as **Side Quest**.

**Auto-Add Party Members to Imported Quests**

*When importing quests, add every party member as a participant. Applies to newly imported
quests and to quests updated by a re-import.*

On by default. Every quest that comes in through an import gains the whole party as
participants, including quests that already existed and are being updated.

Turn it off if you assign participants deliberately -- for a quest only part of the group
knows about, for instance. It has no effect on quests you create by hand.

## Codex

**Codex Journal**

*The journal to use for codex entries. Each entry is a separate page in this journal.*

The same idea as Quest Journal, for the codex. Nothing works until it is set, and changing
it switches which journal the browser reads rather than moving anything.

Also settable from the codex window's **...** menu, **Codex options**, **Select Journal for
Codex**.

Codex entries are a page type this module defines, so a journal you point this at will hold
pages that only display correctly while Librarian is enabled.

## Settings you will not find here

Some things that feel like settings are chosen elsewhere, deliberately:

- **The window theme** -- Light, Dark or Glass -- is on each window's own controls menu, not
  in the settings window. It is remembered per person, so two people at the same table can
  choose differently.
- **Whether the title bar is full or compact** is on the same menu.
- **Pin appearance** is per pin, through **Configure Pin** on an entry or quest.
- **Tag vocabulary** is shared across the whole Coffee Pub suite and managed by Blacksmith,
  not here.
