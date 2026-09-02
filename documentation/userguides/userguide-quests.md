# Quests and Objectives

**Audience:** A GM running quests, or a player following them.

How to create a quest, break it into objectives, move it through its states, and put it on
the map.

Open quests from the **Librarian** button in the menubar, then **Quests**.

## How the list is organised

Three filters across the top of the window select what you are looking at:

- **Active quests** -- being worked on now.
- **Available quests** -- known but not started.
- **Complete and failed quests** -- finished, either way.

Within each, quests are grouped by category. Two exist by default, **Main Quest** and
**Side Quest**, and you can change that list in the settings -- see
[Settings](userguide-settings.md).

Search and tag filtering work the same way as in the codex: type to filter, use
**Toggle tag filters** to narrow by tag, **Clear search** to reset.

## Create a quest

GM only. Use **Add Quest**, or import several at once -- see
[Importing and exporting](userguide-importing.md).

A quest carries a name, a category, a description, a plot hook (GM only), a location, its
objectives, a reward in XP and treasure, a timeframe, participants and tags.

**Objectives** are the steps. Each is a line of text with a state. You can also attach to an
individual objective:

- **A GM hint**, written between double pipes: `Search the cellar ||the key is behind the
  barrel||`. Players never see the part between the pipes.
- **A treasure unlock**, written in double parentheses: `Open the vault ((Gem Ring))`.

## Move an objective along

This is the part that is not discoverable by looking, so it is worth stating plainly.

**As a GM, clicking an objective changes its state, and which button you use decides how:**

- **Left-click** marks it complete.
- **Middle-click** hides it from players.
- **Right-click** marks it failed.

Clicking again returns it to active. The quest's progress is worked out from how many of its
objectives are complete.

**As a player, clicking an objective sets it as your active objective** -- a marker of what
you are currently pursuing. It does not change the objective's state; only a GM can do that.

## Move a quest along

GM only. From a quest's **Quest options** menu, **Set Status**:

- **Complete**
- **Incomplete**
- **Failed**
- **Hidden** -- removes it from players' view entirely.

Use **Edit Quest** from the same menu to change anything else.

## Show a quest to players

GM only. The eye control on a quest's row toggles **Show to Players** and
**Hide from Players**, exactly as in the codex. Hidden quests do not appear in a player's
list at all.

## Put a quest on the map

Both a whole quest and an individual objective can be pinned.

- **Pin to Scene** on a quest's row places a marker for the quest. Once placed the control
  reads **Unpin from Scene**.
- **Pin objective to Scene** on an objective does the same for that step, so a map can show
  where each stage happens.

Double-clicking a pin on the canvas reveals that quest, scrolled to the objective if the pin
was an objective pin.

**Clear All Quest Pins** in the window's **...** menu removes them in bulk -- it asks
whether you mean the current scene or every scene.

See [Canvas pins](userguide-canvas-pins.md).

## Other things on the options menu

The window's **...** menu (GM only unless noted):

- **Refresh Quests** -- rebuild the list. Available to everyone.
- **Open Quest Journal** -- the journal holding every quest. Available to everyone.
- **Select Journal for Quests** -- choose which journal that is.
- **Clear All Quest Pins** -- as above.
- **Import Quests from JSON** and **Export Quests to JSON** -- see
  [Importing and exporting](userguide-importing.md).
