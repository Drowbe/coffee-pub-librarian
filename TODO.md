# TODO

## Bring Codex and Quests over from Squire

Audited against Squire at 13.6.1. Sizes are current line counts.

### Moves whole

| File | Lines | Notes |
|---|---|---|
| `panel-quest.js` | 4,161 | Browser + import/export dialogs + pin placement + objective state |
| `panel-codex.js` | 2,061 | Browser, expand/collapse persistence, category management |
| `window-quest.js` | 1,702 | Single-quest editor (already ApplicationV2) |
| `window-codex.js` | 1,269 | Single-entry editor (already ApplicationV2) |
| `utility-quest-parser.js` | 425 | Page HTML → quest data |
| `utility-codex-parser.js` | 260 | Page HTML → codex data |
| `sheets/codex-page-sheet.js` | 159 | Codex subtype sheet |
| `data/codex-page-model.js` | 89 | Codex subtype data model |

Templates: `panel-codex.hbs`, `panel-quest.hbs`, `window-codex.hbs`, `window-quest.hbs`, `page-codex-fields-edit.hbs`, `page-codex-fields-view.hbs`, `tooltip-pin-quests-objective.hbs`, `partials/quest-entry.hbs`.

Styles: `panel-codex.css`, `panel-quest.css`, `window-codex.css`, `window-quest.css`, `quest-markers.css`.

Settings: `codexJournal`, `questJournal`, `questCategories`, and their two H3 headings.

### Shared — do NOT move yet

- **`utility-base-parser.js`** (144) — base class for both the codex and notes parsers. Blacksmith withdrew the suggestion to hoist it: if Notes converges on an annotation model it may not survive at all, in which case Librarian simply takes it. Leave in Squire until the Notes shape settles.
- **`utility-journal.js`** (569) — read/render/permission helpers, imported by codex, quest **and** notes panels. Same reasoning; it follows whichever way Notes goes.
- **`manager-pins.js`** (2,325) — **do not port wholesale.** It was budgeted as an adapter moving here. Under Blacksmith's annotation model, pins become one view of a general relationship and most of this wrapper stops existing. Take only what is genuinely quest/codex-specific once that API lands.
- **`manager-notifications.js`** (336) — watches quest status, objective status, codex unlock, party notes **and** actor effects. Spans all four domains, so it is a Blacksmith candidate, not a Librarian one.

### Migrations, to run as one pass

1. **Codex page subtype.** Squire declares `coffee-pub-squire.codex`; Librarian declares `coffee-pub-librarian.codex`. **Quest pages are plain `text` pages and need no type migration** — confirmed against Squire's manifest and its page-creation calls, so this is one document type, not two.
   - Update `type` **in place**; never delete and recreate. Page ids and therefore UUIDs must survive, because codex pins reference pages by `codexUuid`.
   - Write `type` and `system` in the same update, reading the existing `system` first — a subtype change can otherwise reset system data to the new model's defaults.
   - Order: Librarian ships declaring the subtype → run the migration with both modules enabled → Squire's declaration comes out next release. Pages never spend a moment unclaimed.
2. **Flag namespace.** `coffee-pub-squire.*` → `coffee-pub-librarian.*` on journal pages, entries, pins and users: `activeObjectives`, `authorId`, `codexCollapsedCategories`, `codexExpandedEntries`, `codexPinId`, `codexSceneId`, `codexTagCloudCollapsed`, `codexUuid`, `originalCategory`, `pinId`, `pinnedQuests`, `questCardCollapsed`, `questCollapsedCategories`, `questIcon`, `questPins`, `questTagCloudCollapsed`, `questUuid`, `sceneId`, `tags`, `visibility`, `visible`, `x`, `y`.
3. **Quest storage rewrite** — stable `questId` / `taskId`, structured flags instead of parsing state out of HTML, merge-by-id on import. Carried over from Squire's TODO.

All three touch every campaign page. Doing them as one migration means one chance to get it wrong instead of three.

## Open

- **Scribe.** An under-developed `coffee-pub-scribe` exists. Worth reading before this module accumulates a personality it can't share.
- **Pin taxonomy across modules.** Blacksmith registers pin types per module. Confirm quest/codex pins registered by Librarian coexist with anything Squire still registers on the same scene.
