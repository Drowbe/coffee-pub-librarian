# TODO

## Bring Codex over from Squire

Quests are done (Squire 13.6.1). Codex is what remains. Audited against Squire at 13.6.1;
sizes are line counts at the time of the audit.

### Moves whole

| File | Lines | Notes |
|---|---|---|
| `panel-codex.js` | 2,061 | Browser, expand/collapse persistence, category management |
| `window-codex.js` | 1,269 | Single-entry editor (already ApplicationV2) |
| `utility-codex-parser.js` | 260 | Page HTML → codex data |
| `sheets/codex-page-sheet.js` | 159 | Codex subtype sheet |
| `data/codex-page-model.js` | 89 | Codex subtype data model |

Templates: `panel-codex.hbs`, `window-codex.hbs`, `page-codex-fields-edit.hbs`, `page-codex-fields-view.hbs`.

Styles: `panel-codex.css`, `window-codex.css`.

Settings: `codexJournal` and its H3 heading.

**Take the codex CSS that moved into Squire's stylesheets when quests left.** `panel-codex.css`
gained the pin-placement cursor rules (`squire-codex-pin-placement`, `codex-pin-preview`) and the
pin-icon state rules (`codex-pin-icon` / `-active` / `-dim`) — they used to be quest rules the codex
markup was borrowing. Rename the `squire-` prefix on the way over; `panel-codex.hbs` emits these
class names.

### Shared — do NOT move yet

- **`utility-base-parser.js`** (144) — base class for both the codex and notes parsers. Blacksmith withdrew the suggestion to hoist it: if Notes converges on an annotation model it may not survive at all, in which case Librarian simply takes it. Leave in Squire until the Notes shape settles.
- **`utility-journal.js`** (569) — read/render/permission helpers, imported by codex, quest **and** notes panels. Same reasoning; it follows whichever way Notes goes.
- **`manager-pins.js`** — **do not port wholesale.** It was budgeted as an adapter moving here. Under Blacksmith's annotation model, pins become one view of a general relationship and most of this wrapper stops existing. Take only what is genuinely codex-specific once that API lands. The quest slice already came over as `manager-quest-pins.js` (741 lines out of Squire's 2,325) — a useful size check on how much of that file is actually per-feature.
- **`manager-notifications.js`** (336) — watches quest status, objective status, codex unlock, party notes **and** actor effects. Spans all four domains, so it is a Blacksmith candidate, not a Librarian one.

### Migrations, to run as one pass

1. **Codex page subtype.** Squire declares `coffee-pub-squire.codex`; Librarian declares `coffee-pub-librarian.codex`. (Quest pages were plain `text` pages and needed no type migration, which is why the quest move needed only flags and pin re-stamping.)
   - Update `type` **in place**; never delete and recreate. Page ids and therefore UUIDs must survive, because codex pins reference pages by `codexUuid`.
   - Write `type` and `system` in the same update, reading the existing `system` first — a subtype change can otherwise reset system data to the new model's defaults.
   - Order: Librarian ships declaring the subtype → run the migration with both modules enabled → Squire's declaration comes out next release. Pages never spend a moment unclaimed.
2. **Flag namespace, codex half.** `coffee-pub-squire.*` → `coffee-pub-librarian.*` on codex pages and pins: `codexCollapsedCategories`, `codexExpandedEntries`, `codexPinId`, `codexSceneId`, `codexTagCloudCollapsed`, `codexUuid`, `originalCategory`, `pinId`, `sceneId`, `tags`, `visibility`, `visible`, `x`, `y`. The quest half is already migrated — see `macros/migrate-quests-from-squire.js` for the shape to copy.
3. **Quest storage rewrite** — stable `questId` / `taskId`, structured flags instead of parsing state out of HTML, merge-by-id on import. Now Librarian's to schedule; it was deliberately *not* folded into the move, since the migration macro copies the existing shape and a rewrite mid-move would have made a failure impossible to localise.

The first two touch every codex page. Doing them as one migration means one chance to get it wrong instead of two.

## Handover from Squire — done

- [x] Quests ported and verified rendering in a live world.
- [x] Quest/objective pin types, taxonomy and canvas double-click registered (`initQuestPins`).
- [x] Migration macro written — `macros/migrate-quests-from-squire.js`. Copies quest settings, page flags, per-user quest flags, and re-stamps quest pins from `coffee-pub-squire` to `coffee-pub-librarian`. Defaults to a dry run.
- [x] Migration run (dry run read, then applied).
- [x] Verified with Squire disabled — quest edit/save round-trip and canvas pin double-click both pass. That pass is what caught two leaked Squire class names and the `registerHelpers` gap; **keep running it for Codex**.
- [x] Quests removed from Squire (Squire 13.6.1).

Note the macro stays useful: it is per-world, and any other world still has quests
addressed to `coffee-pub-squire`. It must be run **before** that world updates Squire.

## Inherited from Squire's TODO with the quest code

These describe files that now live here. Line numbers are Squire's at the time of the move
and will have drifted.

- [ ] **BUG (Medium)** `panel-quest.js:4117` — a post-render collapse restore that iterates every key
  in `questCollapsedCategories` and matches sections with `.trim()`, on top of the template already
  applying collapse by exact key. **Latent, not live**, only because quest's keys come from a fixed
  status set (`Active`/`Complete`/…) rather than user-authored names, so they never got polluted.
  Codex's equivalent did get polluted and overrode the real state on every render. Delete the
  redundant pass — the template is correct. The same trim-match also sits at `:2043` and `:2200`.
- [ ] **BUG (Medium)** Applying a tag filter in codex does `setFlag('codexCollapsedCategories', {})`
  and never restores it, so filtering once permanently expands every category. Quest likely has the
  same shape — check when the panels land together.
- [ ] **AUDIT** Quest pin visibility may share the silent no-op that was fixed for codex pins.
  Visibility is *derived*, never configured, and the pin's `ownership` — not
  `config.blacksmithVisibility` — is what actually gates players, so a GM editing visibility in
  Blacksmith's Configure Pin changes nothing and gets reverted by the next sync.
  `createQuestPin` derives from the page's `visible` flag; `createObjectivePin` derives from
  quest/objective state.
- [ ] **PERF (High, S)** `panel-quest.js` has **19 clone-and-rebind sites** in `_activateListeners()`
  — `cloneNode` + `replaceChild` before every `addEventListener`. The idiom exists to strip
  pre-existing listeners, but `_activateListeners` runs once, immediately after
  `container.innerHTML = html`, so every node it touches is microseconds old and has none. Delete the
  clone/replace and bind to the original node; better still, delegate to a stable parent.
- [ ] **CHORE (Low)** Keep a link-resolution test fixture in the repo: a quest JSON with a known-good
  name **and a guaranteed-miss control**. Name resolution silently did nothing for years in Squire and
  nobody noticed — "it linked" alone cannot distinguish a working resolver from an indiscriminate one.

## Quest future enhancements (carried from Squire)

- [ ] Quest relationships (prerequisites, follow-ups)
- [ ] Timeline view (chronological quest events)
- [ ] Quest templates (pre-built structures)
- [ ] Automated rewards (auto-grant XP/items on completion)
- [ ] Quest chains (automatic progression through sequences)
- [ ] Player notes on quests
- [ ] Quest sharing between GMs or worlds
- [ ] Advanced filtering (participants, location, timeframe)
- [ ] Quest analytics (completion rates, average time)

## Open

- **Scribe.** An under-developed `coffee-pub-scribe` exists. Worth reading before this module accumulates a personality it can't share.
- ~~**Pin taxonomy across modules.**~~ Answered by the quest move: Librarian's quest/objective pins and Squire's note/codex pins coexist on one scene, verified both with Squire enabled and with it disabled.
- **Global namespaces are shared, so "both enabled" is a false pass.** Handlebars helpers and partials are world-global and CSS class names are too — while Squire ran, Librarian's templates were silently using Squire's `registerHelpers` output, and every one of them broke the moment Squire was disabled. **Test Codex with Squire disabled before Squire deletes anything.**
