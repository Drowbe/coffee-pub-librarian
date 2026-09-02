# Canvas Pins

**Audience:** A GM placing markers on a map, or a player using them.

How codex entries, quests and objectives get onto a scene, what a pin does when you click
it, and who can see one.

A pin is a marker on a scene that stands for something in Librarian. Three kinds exist:
codex entry pins, quest pins and objective pins.

Pins are drawn by Coffee Pub Blacksmith. Librarian decides what they point at; Blacksmith
decides how they look and behave on the canvas.

## Place a pin

GM only. Open the scene first -- a pin is placed on whichever scene is currently open.

- **A codex entry:** the pin control on its row in the codex browser, **Pin to scene**.
- **A quest:** **Pin to Scene** on its row in the quest browser.
- **An objective:** **Pin objective to Scene** on that objective.

The control then reads **Unplace pin from this scene**, **Unpin from Scene**, or **Unpin
objective from Scene**, and removes it.

An entry pinned on a *different* scene says so in its control's tooltip, so you can tell
"not pinned anywhere" from "pinned, but not here".

## Use a pin

**Double-click a pin to reveal what it points at.** A codex pin opens that entry in the
codex browser; a quest pin opens the quest; an objective pin opens the quest scrolled to
that objective. The window opens if it was closed.

This works for players too, for anything they are allowed to see.

**Hovering a pin shows its name.** A quest pin reads like `Quest 3: Recover the casing` and
an objective pin like `Quest 3.02: Ask around the tavern`, so the numbering tells you which
quest a step belongs to.

## Who can see a pin

A pin follows the visibility of the thing it points at.

- A codex pin is visible to a player only once the entry is revealed to them.
- A quest pin follows the quest's visibility, and a hidden quest's pins are hidden.
- An objective pin is hidden while its objective is hidden.

You do not manage pin visibility separately, and you should not try to -- changing an
entry's visibility updates its pin to match.

## Change how a pin looks

**Configure Pin**, from an entry's or quest's options menu, opens Blacksmith's pin
configuration: image, size, colour, label placement and so on.

**Clear Pin** removes the pin but keeps its configuration, so re-placing it later brings
your choices back rather than starting from the default.

## Clear a lot of pins at once

GM only. **Clear All Quest Pins**, in the quest window's **...** menu, asks whether you mean
the current scene or every scene, then removes all quest and objective pins accordingly.

There is no bulk equivalent for codex pins; remove those from each entry.

## If a pin does not appear

- **Check which scene you are on.** Pins belong to the scene that was open when you placed
  them.
- **Check the entry is revealed**, if a player reports not seeing one.
- **Reload** if pins are missing after an import. Imported pins are placed as the import
  runs, and a client that was already looking at the scene may not have picked them up.
