# Known Issues

**Audience:** Anyone using Librarian who has hit something that does not work.

Defects that are known and not yet fixed, with a workaround where one exists. Fixed items
move to the CHANGELOG and leave this list.

## A revealed entry does not appear for a player until they reopen the codex

When a GM makes a codex entry visible, a player who already has the codex browser open
keeps seeing the old list. The entry is readable and their permission is correct; the
browser simply never learns.

**Workaround:** close and reopen the codex.

This is not the same mechanism as a tag change, which does update live. Revealing an entry
rewrites ownership on a page that was previously invisible to that player, and a document
that has only just become visible is the case least likely to arrive as an ordinary update.

## A player's codex may not reflect a tag change made on another client

Blacksmith's tag hooks fire only on the client that made the change. Librarian works around
this by also listening for the underlying setting update, which does reach every client, so
in practice a tag change made by the GM does update an open player codex.

The workaround is doing the work rather than the hook, which means it is coincidence-shaped:
if the hook set changes, this could regress without anything failing loudly.

**Workaround if it does regress:** close and reopen the codex.

## Compendium resolution needs the world included in Blacksmith's mapping

A codex link to an actor or item resolves through Blacksmith's Compendium Mapping. PCs and
NPCs usually live in the world rather than in a compendium, so a mapping for that type with
world searching switched off resolves nothing, and the link stays plain text.

Nothing in Librarian can detect this, and it looks exactly like a Librarian bug.

**Workaround:** in Blacksmith's Compendium Mapping settings, include the world as a source
for the type that is failing to resolve.
