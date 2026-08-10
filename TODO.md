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
