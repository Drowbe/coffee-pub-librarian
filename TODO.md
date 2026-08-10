# TODO

## Codex — ported, awaiting live verification

Code is in. What remains is the live pass, in this order and no other:

1. **Run `macros/migrate-codex-from-squire.js`, DRY_RUN first**, with both modules enabled. Read the report; it names every page it would retype.
2. Set `DRY_RUN = false`, re-run. Each page keeps its original `type` and `system` in the `squireMigrationBackup` flag, and the macro re-reads the page afterwards to check the entry data actually survived the type change — a silently-defaulted `system` does not throw, which is the whole reason that check exists. If anything lands in the FAILED list, set `REVERT = true` and stop.
3. **Then** verify with Squire disabled. Not before: pages still typed `coffee-pub-squire.codex` fail validation when nothing declares that subtype, so a pre-migration test tells you nothing about Librarian.
4. **Then** Squire deletes its codex, and drops its `documentTypes` declaration.

This is per-world. A world that has not run step 2 still has codex pages addressed to Squire and must run it before that world updates Squire.

### Known, carried over rather than fixed in the port

- **The import progress bar has been dead since Squire 13.6.0.** `panel-codex.js` and `panel-quest.js` both drive `.tray-progress-bar-wrapper` / `-inner` / `-text`, which only ever existed in Squire's `tray.hbs`. Once the panels moved into windows the element stopped existing, so `querySelector` returns null and the progress display silently does nothing. Either put the markup in `window-campaign-browser.hbs` or delete the code; right now it is neither.
- **`squireSkipCodexRender`** is an update-option name that outlived its module. `panel-codex.js` sends it and `manager-journal-routing.js` reads it; renaming means changing both halves in one commit, so it is deliberately left alone until someone does.
- **`utility-base-parser.js` and `utility-journal.js` are now duplicated** between Squire and Librarian. Squire still needs them for Notes. They converge or diverge for real when Notes moves to Blacksmith — not before.

## Handover from Squire — done

- [x] Quests ported and verified rendering in a live world.
- [x] Quest/objective pin types, taxonomy and canvas double-click registered (`initQuestPins`).
- [x] Migration macro written — `macros/migrate-quests-from-squire.js`. Copies quest settings, page flags, per-user quest flags, and re-stamps quest pins from `coffee-pub-squire` to `coffee-pub-librarian`. Defaults to a dry run.
- [x] Migration run (dry run read, then applied).
- [x] Verified with Squire disabled — quest edit/save round-trip and canvas pin double-click both pass. That pass is what caught two leaked Squire class names and the `registerHelpers` gap; **keep running it for Codex**.
- [x] Quests removed from Squire (Squire 13.6.1).

Note the macro stays useful: it is per-world, and any other world still has quests
addressed to `coffee-pub-squire`. It must be run **before** that world updates Squire.

## Inherited from Squire's TODO with the codex code

Moved here with the files they describe (Squire 13.6.1). Line numbers are Squire's at the
time of the move and will have drifted. `documents/architecture-codex.md` and
`documents/plan-codex-datamodel.md` came across too, as did `architecture-quests.md`, which
should have travelled with the quest port and didn't.

### CODEX DATA MODEL (custom page subtype)
- [ ] **REFACTOR** Replace HTML-parsing of codex journal pages with a module-defined `JournalEntryPage` subtype (`coffee-pub-librarian.codex`): structured fields in `page.system` via a `TypeDataModel` (schema validation, no parsing), Expanded Details in native `page.text.content`, custom page sheet for view/edit. **No migration** — content will be re-imported and re-pinned; import replaces legacy text pages with typed pages, making re-import the conversion path. Full design and phased plan in `documents/plan-codex-datamodel.md`. The Notes panel adopts the same pattern afterward.

### CODEX TAB
- [ ] **BUG (High, M)** `related` shipped in 13.3.12 with **no UI at all**. It appears in exactly two places — the import/export schema and the tray card — and in *zero* edit or view surfaces. Confirmed by grep: the string `related` does not occur in `window-codex.js`, `templates/window-codex.hbs`, `sheets/codex-page-sheet.js`, `page-codex-fields-edit.hbs`, or `page-codex-fields-view.hbs`. Three separate gaps:
  - **Edit Entry window** (`window-codex.js` + `templates/window-codex.hbs`) — can't add, remove, or see related entries. `links` next door has a full drop-zone-and-chips UI; `related` has nothing. Since related entries are plain names resolved at render (not UUIDs), this wants a simple tag-style input — a `<string-tags>` chip control, like `tags` already uses — NOT a drop zone.
  - **Journal page edit form** (`page-codex-fields-edit.hbs`) — same gap on the page sheet.
  - **Journal page view** (`page-codex-fields-view.hbs`) — the bigger miss: Related isn't *displayed* on the page at all, so "Read More" shows an entry stripped of its relationships. The tray card shows them; the full page doesn't.
  - Not data-destructive today: both save paths write `page.update({ system: … })`, which **merges**, so a field absent from the payload survives (`discoveredBy` has always relied on this). So a GM can edit an entry without wiping `related` — they simply can't touch it. Verify that still holds if either save path is ever changed to replace rather than merge.
  - Resolution for the view/edit surfaces should reuse the tray's page index + `_renderCodexRef()` rather than growing a second name→page lookup — see the DUPLICATION TAX section for why that keeps mattering.

- [ ] **ENHANCEMENT (Designed — `plan-codex-datamodel.md` Phase 4)** `related` codex-to-codex entries, retain-unresolved links, and a rescan tool. Three connected pieces: (1) `links` keeps `{name, type, uuid?}` and renders unresolved names as plain text instead of discarding them — a codex is authored incrementally, so "Moonsea" may not exist *yet*, and today the relationship is destroyed at import; (2) a `related` field for entry→entry relations, resolved against pages in the codex journal (Librarian's own lookup — a corpus `api.compendiums` doesn't model — in a second pass after all pages exist); (3) a GM rescan that crawls the codex and links whatever has since become linkable, reusing the inventory auto-discovery progress bar. Discovered by feeding the 13.3.12 resolver a real AI-authored codex: 19 of 22 links on one entry pointed at other codex entries and were structurally unresolvable (`type: "journal"` finds `JournalEntry` documents; codex entries are `JournalEntryPage`s). The AI wasn't over-linking — it was describing a graph the schema can't hold.
- [ ] **ENHANCEMENT (Designed — `plan-codex-datamodel.md` Phase 5)** Suggested discoveries. Auto-discovery matches an owned item to a codex entry by exact name, so finding "Map of Phlan" reveals **Map of Phlan** but never **Phlan**. Rather than loosen the match — discovery writes to the world, and a false positive spoils something permanently — surface *candidates* for GM review: the discovered entry's own `related` names (authored, high confidence, one hop only), plus name-containment hits (coincidental, low confidence, whole-word + min-length guarded). Nothing reveals until ticked. See the plan for why substring auto-unlock is hazardous on the entry side (`Lore`, `The Ride`, `Old Town`) and why an item-type heuristic doesn't fix it.
- [ ] **ENHANCEMENT** Clicking a tag on a codex item should filter the codex by that tag
- [ ] **ENHANCEMENT** Need to add a "new" flag to added items that goes away at next client refresh
- [ ] **ENHANCEMENT** When dragging a token to the manual add, pull the bio and put it in the description
- [x] **ENHANCEMENT — DONE (13.3.12)** ~~Auto-link codex entry names to the assigned actor/item compendiums on import.~~ The blocking prerequisite landed: Blacksmith 13.8.4 shipped `api.compendiums` (`resolve`/`resolveMany`/`resolveLink`), which owns the mapping *and* the search semantics — a better contract than the `api.resolveEntityByName(name, type)` wrapper anticipated here, since world-first/last ordering and Spell/Feature subtype filtering live inside it rather than in each caller. Shipped as specced: prompt now emits `links: [{name, type}]` instead of a hard-coded empty array; import resolves names → UUIDs → `system.links`; the "N of M linked, K unmatched" report exists (split into asserted vs speculative misses, so a self-link that legitimately matches nothing doesn't drown the signal). Squire reads none of Blacksmith's settings — `scripts/utility-resolver.js` is the only contact point. Scope grew past codex: quest treasure (`item`) and participants (`actor`) had the same dead end and were wired too - that half left with Quests in 13.6.1.
  - **Caveat worth remembering**: resolution needs the GM's Blacksmith Compendium Mapping to include the *world* for the type. PCs/NPCs live in the world, so an Actor mapping with world search off resolves nothing and looks like a Squire bug. Nothing in Squire can detect this.

### Codex performance, carried over

- **PERF (High, S)** Link enrichment runs on every render, sequentially: `panel-codex.js` awaits `TextEditor.enrichHTML()` once per resolved link inside `for (const entry of entries)`. Categories are parallel, entries within a category are not, so Characters alone is up to 120 sequential awaits and ~314 across a real codex. `@UUID[uuid]{label}` output is deterministic given `uuid` + `label`, both stored on the link, so a session `Map` keyed `` `${uuid}|${label}` `` takes a full render from ~314 enrich calls to ~0.
- **PERF (High, S)** `_activateListeners()` clones and replaces every node before binding — 14 sites in `panel-codex.js`, ~7 running per entry, so ~2,200 deep subtree clones plus ~2,200 `replaceChild` per render against a 314-entry codex. The idiom exists to strip pre-existing listeners, but `_activateListeners` runs once immediately after `container.innerHTML = html`, so every node is microseconds old and has none. `.codex-entry-image img` is cloned too, which can force image re-decode. Delete the clone/replace and bind to the original node; better still, delegate to a stable parent.
- **BUG (Medium)** `panel-codex.js:717` — applying a tag filter does `setFlag('codexCollapsedCategories', {})`. The comment says "temporarily clear while filtering" but nothing restores it: filter by any tag once and every category is permanently expanded.

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
