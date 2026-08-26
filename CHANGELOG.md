# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [13.1.1]

### Fixed

- **The module shipped no localization at all.** No `lang/` directory and no `languages` entry in the manifest, so Foundry's "Add Page" type picker showed the raw key `coffee-pub-librarian.codex` instead of a name. `TYPES.JournalEntryPage.coffee-pub-librarian.codex` → "Codex Entry" was specified in the data-model plan under a phase marked complete, and was never built.

## [13.1.0]

### Changed

- **Blacksmith minimum raised to 13.20.0.** The codex tag work depends on four things that were unreleased at the time it was written and shipped in 13.20.0: the serialised tag write queue, the removal of the pin mirror's assignment rows, the rename refusal logging that the curation sweep branches on, and `deleteRecordTags` firing a change hook.

  The manifest previously required 13.19.0, which would have allowed Librarian 13.1.0 to install against a Blacksmith with none of it. The worst pairing is not cosmetic: against the old write path a **player** client computed the whole tag-assignments object locally and shipped it to the GM to write verbatim, so a player holding a stale snapshot would overwrite every context key for every module in the world. Our own migration awaits sequentially and would have survived it; a connected player would not have.

- **Codex tags moved out of Librarian and into Blacksmith's central tag store.** `api-tags.md` is explicit — *"All tag assignments are stored in a Blacksmith world setting. Consuming modules do not store tags in their own record data"* — and `system.tags` was a direct contradiction of it. 342 entries migrated in the development world; `system.tags` is now empty on every codex page and the central store is the only copy.

  Reads and writes were converted across all six surfaces that touch tags: browser cards, the tag cloud and search, the Edit Entry window, the journal page's own view and edit sheets, the importer, and the canvas pin manager. The export needed no change — it builds from the same entry data the panel does, so it followed automatically.

  **The record id is the page uuid, and that was the one decision worth getting right.** `getRecordsByTag()` returns opaque strings, and a uuid is the only generic route back to a Foundry document; a page id would force every reader to scan journals to resolve one. Two other arguments were offered for it during design and both turned out to be false — recorded in `utility-tags.js` so neither gets reinvented.

  **Pin tags now read the entry rather than the category.** A codex pin used to derive its tags from its category slug alone. It now carries the entry's own tags plus that slug, strictly one-directional entity → pin: Blacksmith's pin mirror is clobbering, so anything written against a pin's own record id is discarded by the next pin update. The category slug is kept alongside rather than replaced, because it is what pin filtering has always keyed on and an untagged entry would otherwise produce a pin with no tags at all.

  **The importer carries tags across the legacy-page conversion.** Replacing an untyped `text` page with a typed one deletes and recreates it, so the uuid changes and the assignment would orphan silently. Tags are moved to the new id before the old row is dropped — and the delete comes last deliberately: an interruption then leaves the tags on both ids, duplicated and recoverable, where the reverse order loses them.

  **Tag changes fire no journal hook, so the browser needed a new signal.** With tags off the document, editing one no longer triggers `updateJournalEntryPage` and the open browser had nothing to react to. It now listens to `blacksmith.tags.changed` — plus Foundry's `updateSetting` for the tag settings, because Blacksmith's tag hooks fire only on the client that made the call. Without the second listener every other connected player keeps rendering a stale vocabulary indefinitely, which matters here because the codex is read by players. The `updateSetting` half is a workaround for a gap Blacksmith has recorded as theirs; it is marked for removal in the code.

  **The tag vocabulary was curated afterwards, not before.** Blacksmith's GM rename and delete propagate across every record, so merging `bcod` into `black-cult-of-the-dragon` is one call where hand-editing 36 entries is not. Ten merges and two deletions ran against pre-recorded expected counts, all thirteen matching. `dwarven` → `dwarf` was dropped rather than merged: all eight `dwarven` records are objects and places and all the people are under `dwarf`, so the merge would have collapsed a real distinction irreversibly — rename merges and does not unmerge.

  `system.tags` remains in the data model schema. Removing the field would make any unmigrated page fail validation, so it goes when the migration tooling does.

### Fixed

- **The codex read as washed-out and pastel beside every other Tool window, and the cause was a rule this project wrote for itself.** An earlier theming pass ruled that a colour literal at low alpha "tints the themed surface beneath rather than replacing it, and is fine under a themed foreground." That is true of *contrast* — the text stays legible — and false of everything else. A 20%-alpha red is muted brick over a dark panel and pale pink over parchment, so six brand colours at 0.08–0.4 alpha changed the panel's entire character between Light and Dark while passing every check that had been applied to them.

  `panel-codex.css` now opens with the rule that replaces it: every colour is **chrome** — surfaces, borders, dividers, secondary text, written as `var(--blacksmith-tool-*)` and following the theme — or **meaning** — brand, state, an affordance the eye must find, written **opaque**. There is no third category. A brand colour at low alpha claims to be constant and is not.

  Applied throughout: plot-hook and page-value surfaces take themed tokens; tag chips became chrome (there are ninety on screen and they are navigation, not emphasis) while a *selected* chip is the opaque brand orange; the pin-flash animation keeps its alpha because there the alpha is the thing being animated, and is annotated so it is not "fixed" later.

- **Orange stopped meaning "link".** Brand orange is hover and selected state everywhere else in the suite, and using it at rest turned every resolved name — dozens per card — into a demand for attention. Links now take the theme's text colour and go orange on hover.

  Three separate link systems had to be brought into line, which is why the first two attempts left some links orange: our own `.codex-ref` markup, the same markup on the journal page sheet, and Foundry's enriched `@UUID` anchors, which are styled by a different rule entirely and had no hover state at all. **READ MORE** was an outlined brand-orange pill and is now a plain link — every card has one and none of them is what the reader came for, so it was the loudest element on screen while carrying the least.

  Also removed: three `text-shadow: 0 0 8px` glows behind icons, all link underlines, and the `opacity: 0.55` italics on unresolved names, which are real content awaiting a page rather than an error state.

- **Light theme was unreadable at codex density, and we now override three of Blacksmith's tokens to fix it.** Their Light palette is tuned for sparse windows — Compendium Search is a list of names. A codex card is a label, a summary, a plot hook, links, related names, four location rows and a tag strip. `text-muted` at 55% brown is fine for one subtitle and illegible for six stacked labels; their `border` is pale tan on pale ground, so card edges vanish.

  `styles/window-codex-browser.css` raises `text-muted`, `border` and `divider`, scoped to the codex browser **and** to Light only. Dark and Glass are untouched. Removing the block restores their palette exactly. Recorded as **M14** and flagged to raise with Blacksmith: this is a density their values were not designed for, not a bug on their side.

- **The filter row's padding, after several failed attempts in the wrong file.** The filter icon sat mashed against the window's right edge. `panel-codex.css` gives `.codex-filters` an 8px inset — and `window-codex-browser.css` overrode the whole shorthand with `padding: 2px 0` when the filters moved into the toolbar, discarding the horizontal half. Every fix applied to the panel stylesheet was thrown away by that one line. Now `padding: 8px` on all four sides, with a comment on the rule saying so.

  Two more in the same row: the clear button was `position: absolute; right: 28px` against the *whole row* rather than the input, leaving a dead gap; and the tag cloud painted its own `surface-sunken` background with a 4px radius inside `.codex-filters`, which paints `scrim` at 6px — two filled boxes with mismatched corners, so the outer one showed through. The cloud is transparent now, and its right padding accounts for the scrollbar, which is laid out *inside* the padding box and therefore makes symmetric padding look asymmetric.

- **The menubar is one "Librarian" button opening a secondary bar**, rather than two flat tools spending two slots of menubar width on one module. Codex and Quests are items on that bar, centred in its middle zone; picking either opens the browser and closes the bar, since it is a launcher and not a mode. Falls back to opening the codex directly if the secondary-bar API is unavailable, so an older Blacksmith gets the previous behaviour rather than a dead button.

- **The module shipped no localization at all.** No `lang/` directory and no `languages` entry in the manifest, so Foundry's "Add Page" type picker showed the raw key `coffee-pub-librarian.codex` instead of a name. `TYPES.JournalEntryPage.coffee-pub-librarian.codex` → "Codex Entry" was specified in the data-model plan under a phase marked complete, and was never built.

- **Quest import could not set task state or progress, and re-import silently reset them.** Both quest content writers emitted a bare `<li>` for every task, while the reader decodes `<s>` as completed, `<code>` as failed and `<em>` as hidden — so **the writer could not express what the reader could read.** Measured across all 30 production quests: every one round-tripped `completed`, `failed` and `hidden` back to `active`, and `progress: 71` back to `0`. Neither writer emitted a Progress line at all.

  A shared `_wrapTaskState` now encodes state exactly as the reader decodes it, used by both writers so the two halves cannot drift again, and both emit Progress. `_extractExistingState` learned to read Progress back, so a re-import preserves it.

  Two more surfaced while fixing it. The merge path only wrapped state it found already on the page, so a **newly added task landed as `active` however the payload described it** — it now falls back to the import's state, with existing state still winning so a GM ticking a task off is not undone by a re-import. And `_extractExistingState` defaulted `status` to the literal `'Not Started'`, which is truthy, so `existingState.status || importedQuest.status` always took the existing branch and **a re-import could never change a quest's status.** It now starts empty.

- **Every party member was re-added to a quest on every import.** The auto-add guard tested `p === actor.name`, but participants are stored as enriched link strings — `@UUID[Actor.abc]{Cyrus Bing}` — so the comparison was always false. Production pages already carried each party member twice, once as a link and once as a bare name.

  New `parseParticipant` / `isSameParticipant` / `dedupeParticipants` in `utility-resolver.js` handle all the shapes participants are stored in and compare on uuid first, name second. Both auto-add sites use them, and both writers dedupe before resolving, so a re-import **repairs** an already-damaged page rather than preserving its damage.

  The first version of the parser had the same class of bug it was written to fix: an object whose `name` is itself a link string was read as a name with no uuid, so one person keyed two different ways and nothing collapsed. Both branches now unwrap through a shared `parseLinkString`.

- **A blank quest description made the reader absorb the fields that followed it.** `description: ""` parsed back as `"Category: Side Quest

Participants: …"` — the whole document. The writer skipped the Description line for a blank string exactly as for an absent one, and the reader has an explicit *"if no description, use all text content"* fallback that then claimed everything after it.

  The writer now distinguishes blank from absent, and the fallback is gated on whether the page carried **any** structured field rather than on whether Description happened to be empty. The fallback itself is still wanted: a quest written by hand, with no field markup at all, should read as prose.

  This is the fourth blank-versus-absent defect found in this file, after the two above and the codex `expandedDetails` rule. The shared cause, in Blacksmith's words: *testing a parsed value cannot tell you whether the thing was there.*

- **Quest import threw on every quest, and reported it as `Invalid JSON.`** `game.settings.get(MODULE.ID, 'autoAddPartyMembers')` was called by both quest content writers — `_mergeJournalContent` on the update path and `_generateJournalContentFromImport` on the create path — and that setting was registered nowhere. Foundry's `game.settings.get` throws on an unregistered key rather than returning undefined, so the first quest of any import killed the run.

  **The error message is why this survived.** There is no per-quest try/catch; the outer handler in the import dialog caught the throw and reported `Invalid JSON.` So the failure named the wrong cause, pointed at the user's payload, and the payload was always fine. It came across from Squire without its registration, the same way the dead quest-collapse code and the orphaned pin tooltip did.

  The setting is now registered, world-scoped, **defaulting to on** — every imported or re-imported quest gains the party as participants. Note that this switches on a code path that has never executed in Librarian, so the auto-add behaviour itself is being exercised for the first time.

  **Found by the H12 reader audit on its first run.** Not by reading the writer, which had been read twice that day while chasing a different question, by two passes that both missed it. It surfaced in a synthetic import payload the moment something actually called the function.

- **A tracked debt item was recorded against a duplication that no longer exists.** The tracker carried `utility-base-parser.js` and `utility-journal.js` as knowingly duplicated with Squire, deliberately left alone until Notes moved to Blacksmith. Squire has neither file any more — nothing matching `*pars*` or `*journal*` remains in its `scripts/` — so there is no duplication and the "wait for Notes" reasoning was void.

  Closed rather than carried. Two facts worth keeping from the check: `utility-journal.js` is live, supplying `showJournalPicker` to both panels, while `utility-base-parser.js` now has exactly one consumer — `utility-codex-parser.js`, which is itself legacy-only. That makes the base parser a candidate for removal once the legacy codex reader goes, which is a different item from the one that just closed.

- **The orphaned objective-pin tooltip is removed, because pin hover already works.** Three assets had no code rendering them — `templates/tooltip-pin-quests-objective.hbs`, `TEMPLATES.TOOLTIP_PIN_QUEST_OBJECTIVE`, and `styles/quest-markers.css` — kept on the belief that hovering an objective pin showed nothing and the design was worth preserving.

  **That belief was wrong.** Both pin types set `text` and `textDisplay: 'hover'`, and Blacksmith's pin renderer honours it: a quest pin reads `Quest 3: Recover the Wayfinder casing.` and an objective pin reads `Quest 3.02: Ask around the Laughing Goblin.` — the objective's own text, numbered against its quest. The "shows nothing" note described Squire, where the tooltip was hand-rolled and there was no Pins API to fall back on; it did not survive the migration and was never re-checked.

  Implementing the template would have replaced a working, Blacksmith-rendered label with a bespoke one, against the Blacksmith-first rule, and would have bypassed the per-pin-type design properties users configure — `textLayout`, `textDisplay`, `textColor`, `textSize`, `textMaxLength`. A GM who sets pins to `textDisplay: 'always'` would have got our tooltip instead.

  `styles/quest-markers.css` went in full: every rule in it was tooltip styling, its only other content a comment noting pins are PIXI-rendered now. Its `@import` is removed from `default.css`. Richer hover content — objective state, treasure, GM hints — remains a legitimate future feature, but it is a new one to design against the Pins API's hover surface, and under the standing rule it belongs upstream rather than as a parallel tooltip.

- **Quest category collapse was dead code, not a redundant pass.** It was filed as a post-render pass duplicating what the template already did. It was worse: every quest section the template renders carries `quest-section--no-titlebar`, and all four sites that applied `questCollapsedCategories` skipped exactly those sections — so the feature could never fire. The click handler that wrote the flag was bound to `.quest-category`, which the template does not render at all, so nothing ever wrote it either. It arrived from Squire in that state and has never worked in Librarian.

  Removed: the writer, all four apply passes, a `classList.remove('collapsed')` for a class nothing adds, the now-callerless `_findQuestSectionByStatus`, and four orphaned `.quest-category` / `.quest-section.collapsed` rules in `panel-quest.css`. The `questCollapsedCategories` user flag is left in place, inert. Restoring per-category collapse is a feature decision, not a bug fix — the sections are deliberately title-bar-less.

- **Three v13 deprecation shims replaced before v15 removes them.** `FilePicker` in the codex and quest editors, and `saveDataToFile` in the export window, were bare globals that Foundry maps through a compatibility table (`since: 13, until: 15`).

  `FilePicker` now resolves `foundry.applications.apps.FilePicker.implementation` — `.implementation` specifically, because that is what the global resolved to and it respects a system's subclass — and `saveDataToFile` resolves `foundry.utils.saveDataToFile`. Each keeps a fallback to the old global so any build lacking the namespaced path still works. The `FilePicker` sites were guarded such that failure meant a silently missing feature; `saveDataToFile` already had a Blob fallback, so it would have degraded to the worse path rather than breaking.

- **Quest scene pins were exported empty and imported into nothing.** Both halves of the feature had been reading and writing `scene.getFlag('coffee-pub-librarian', 'questPins')` — a flag nothing has written since quest pins moved to Blacksmith's Pins API. The only writer left in the module was the pin importer itself.

  The consequences compounded. **Export** emitted `"scenePins": {}` in any world whose pins were placed after that migration, while the summary reported `Scenes with Pins: 0` and the file wrote successfully — a backup that looks complete and is not, discovered only at restore. **Import** wrote merged pin records back into the same dead flag, so restored pins were stored where nothing renders from and never appeared on the canvas.

  Both halves now go through the Pins API. The export enumerates with `listAllQuestPins` and the import creates through `createQuestPin` / `createObjectivePin`.

  **Only identity and placement travel** — `questUuid`, `questIndex`, `questCategory`, `x`, `y`, and `objectiveIndex` on objective pins. Design, ownership, icon, visibility and objective text are re-derived from the live quest page at import, because carrying them would mean two sources for the same values with a stale copy winning. Scenes are still matched by name rather than id, since ids differ between worlds and moving quests between worlds is the case the feature exists for.

  **The export now refuses a partial**, matching the guard the codex export has carried since 13.0.2: it reconciles placed plus unplaced against the total the Pins API reports and aborts without writing if anything is unaccounted for. The summary reports `N of M` so the check is visible on success rather than only firing on failure. Unplaced pins — real state with no placement to restore — are counted separately and recorded in the export metadata, so a pin total lower than a GM expects has a visible reason.

  A pin naming a quest that does not exist is now reported to the GM with the count and listed in the console, rather than silently skipped. `_mergePinData` is deleted; deduplication is now "does a live pin already exist for this quest and objective on this scene", which is a question the Pins API can answer.

  The quest export envelope also gains a `kind` field (`coffee-pub-librarian.quest`), diagnostic only and never used for dispatch, so a reader can name the owning module when Librarian is absent.

## [13.0.2]

### Added

- **`related` codex entries can finally be edited and read.** The field shipped in Squire 13.3.12 and has had no UI at any point since: it existed in the data model, the import/export schema and the browser card, and in **zero** edit or view surfaces. A GM could see relationships an import had created but could not add, remove, or even read one anywhere else. All three gaps are closed:

  - **Edit Entry window** — a comma-separated Related Entries field, matching how `tags` works in the same window, with a live preview showing which names currently resolve to an entry and which do not. Deliberately not the drop zone `links` uses next door: these are other codex entries referenced by name, so there is no uuid to drop.
  - **Journal page edit sheet** — a `<string-tags>` chip control, matching how `tags` works on that sheet.
  - **Journal page view** — Related is now displayed. This was the worst of the three: "Read more" showed an entry stripped of its relationships while the browser card showed them.

  Naming an entry that does not exist yet stays valid and is the point of the design — the relationship is kept verbatim and links itself the moment that entry is created, with no migration, rescan, or import ordering problem.

- **One codex name→entry resolver, in `scripts/utility-codex-index.js`.** `normalizeName`, `buildCodexPageIndex` and `renderCodexRef` were private to `panel-codex.js`; the journal page view and the editor window both needed them, and copying was how the category icon map drifted between the panel and the pin manager before it moved to `const.js`. A codex reference now renders identical markup in all three places and can only differ in what a click does, which is the one thing that legitimately varies by surface.

### Fixed

- **The codex filters rendered unstyled in the toolbar.** Every rule in `panel-codex.css` is scoped to `.librarian-panel-host[data-position="left"]`, and the toolbar slot was not inside it — so moving search and tags there stripped their styling. The tag cloud in particular became a wall of plain wrapping text that overflowed the bar. The slot now carries the same host class the body wrapper does. A `max-height` this stylesheet had put on the tag cloud also out-specified `panel-codex.css`'s `.collapsed { max-height: 0 }`, leaving the cloud stuck open; that override is gone.

- **The Blacksmith window registry could not open either browser.** `registerCampaignBrowserWindows` registered an opener calling `openQuestBrowser`, which stopped existing in 13.0.0 when the file was renamed and the function became `openCampaignBrowser` — so `blacksmith.openWindow('coffee-pub-librarian-quest-browser')` threw a `ReferenceError`. Nothing caught it because the menubar tools reach `module.api.openCampaignBrowser` directly and never route through the registry.
- **Copy Template in the codex importer copied an error message.** `prompts/prompt-codex.txt` was never shipped — only the quest prompt came across from Squire. The fetch failed, the template variable was set to the literal string `Failed to load prompt-codex.txt.`, and the button put that on the GM's clipboard under a "Template copied to clipboard!" toast. The prompt now ships, a failed load leaves the template empty and reports to the console, and the button refuses rather than copying its own error. The same latent defect in the quest importer is fixed too, along with a duplicate success toast that fired even when the copy had failed.
- **Codex, quest and export windows fought over one saved position.** Each mints a per-instance id so several can be open at once, but left `rememberPosition` on. `windowPositionKey` falls back to the class name, so siblings shared a single key and each new window opened on top of the last one the user had moved. They no longer persist position; the browsers, which set a per-kind key, are unaffected.
- **Squire named in three user-facing places**: the codex pin visibility warning told the GM to use "the Squire codex tray", the campaign browser's startup error was prefixed `Coffee Pub Squire |`, and the codex page summary placeholder referred to "the Squire tray".

### Changed

- **All five windows import their base class from Blacksmith's bridge.** Each previously resolved `BlacksmithWindowBaseV2` / `BlacksmithToolWindowBaseV2` from `module.api` at file top level and threw if it was missing — which is what Blacksmith's documentation advised, and is unsafe: `extends` is evaluated when the module script is, `game` does not exist then, and an ES module that throws during evaluation stays dead for the whole session rather than being retried. Merchant took a live world down that way on 2026-08-19.

  Librarian never hit it, for two reasons worth keeping in mind rather than congratulating ourselves over: the lookup used optional chaining (`globalThis.game?.modules?.get?.(...)`), so it returned null instead of throwing, and every one of these files is dynamically imported at `ready`, by which point `game` exists. It was a private workaround to a documented-wrong instruction, and `api/blacksmith-api.js` is now the supported path — a real ES module that resolves at evaluation time.

- **The codex panel follows the Tool window's theme.** Its surfaces, text tones and dividers now come from the `--blacksmith-tool-*` family instead of 45 hardcoded values, each keeping its original value as a fallback so the module still renders with Blacksmith absent. Light and Glass are offered again — `allowToolThemeToggle: false` was set precisely because they rendered a dark panel inside a parchment or frosted frame.

  Two families stayed literal deliberately: the brand accent (`#ff6400`, `#e2551d`, `#ff7a3c`), which is Librarian's identity rather than a surface, and the state colours used for tags, selection and category headers. **A theme may repaint a surface; it must not repaint meaning.** Canvas pin markers were untouched — they are set per pin by the Pins API and are not part of the window.

- **Codex search and tag filters moved into the Tool window's toolbar.** This is the shape Blacksmith's Compendium Search uses and the point of moving to the Tool shell in the first place: the toolbar is chrome, the body is nothing but results. They had been rendering at the top of the body, which left the shell's toolbar zone empty and the list pushed down by its own controls.

  The mechanism is a host slot, the same idiom as the footer status: the window supplies `<div data-codex-filters>` in `toolBarLeft`, and `CodexPanel._renderFilters` paints into it — because the panel is what knows the filter state and the tag vocabulary, and the host is what knows where its chrome goes. A host offering no slot gets the filters prepended to the body, so the panel still works anywhere.

  For that to work the panel's delegated listeners had to move from the panel container to the **host element**: the toolbar sits outside the container, and delegation only sees what it contains. That also means binding happens once per window rather than once per panel container.

- **Codex search is debounced and no longer walks the DOM per keystroke.** Two changes, both borrowed from Compendium Search, which reports 103ms across nine compendium packs — a codex already in memory has no excuse to be slower:

  - **140ms debounce**, long enough to skip a fast typist's intermediate states.
  - **A per-entry match haystack**, computed once per render and cached on the node. Filtering previously read `entry.textContent` for every entry on every character typed, forcing a tree walk of each card across 300+ entries.

  The footer count now updates off a `librarian.codexFiltered` event the panel fires after visibility changes, rather than off `input` — with the debounce in place, an `input` listener reads the DOM before filtering has run and reports a count one keystroke stale.

- **The codex browser is now a Blacksmith Tool window.** It was sharing `CampaignBrowserWindow` with quests, on the standard editor base. The two stop being the same shape the moment quests grow a list-plus-detail layout, and they want different shells regardless: the codex is a lookaside you keep open beside the canvas and search mid-session, which is a palette. Blacksmith's own Compendium Search is the reference for what one looks like.

  What this buys: Light / Dark / Glass themes the user picks per tool, an optional micro title bar, a compact resizable frame, and a `--blacksmith-tool-*` palette so content follows the theme instead of hard-coding colours. What it costs, accepted deliberately: the illustrated header, which the Tool base omits by design.

  The window id and `windowPositionKey` are unchanged, so saved position, title-bar mode and theme survive the move. `CampaignBrowserWindow` now hosts quests only; `openCampaignBrowser('codex')` routes to the new window, so the menubar tool, the module API and `revealCampaignPanel` are all unaffected.

- **The codex panel no longer draws its own title row.** It opened with a "Codex" heading carrying Add Entry and the `…` menu — a second title bar directly beneath the window's own, styled by `.tray-title-small`, a class that only ever existed in Squire's tray stylesheet and so had rendered unstyled since the split. Both controls are now Tool header actions on the window, and the panel's delegated handler still recognises the old selectors so another host may render its own.

- **Progress reporting works again, in the window footer.** `_showProgressBar`, `_updateProgressBar` and `_hideProgressBar` drove `.tray-progress-bar-wrapper` / `-inner` / `-text` — elements that only ever existed in Squire's `tray.hbs`. Once the panels moved into windows the markup stopped existing, every `querySelector` returned null, and all three had been silent no-ops since Squire 13.6.0, through imports, Auto-Link and auto-discovery alike. They now write to whatever status slot the host provides; the codex browser puts one in its Tool footer, and a host that provides none gets a no-op rather than an error.

  This was not only cosmetic. `_autoDiscoverFromInventories` interleaved pauses of 500ms at the start, 200ms per party member, 1.2s per discovery, 1.5s for the summary and 5s at the end — roughly ten seconds of deliberate stalling on a small party, plus 1.2s per revealed entry, all to make a display readable that nobody could see. Only a periodic 50ms yield remains, which exists to keep a long scan from freezing the UI thread. The scan also no longer returns early while leaving `isImporting` set, which used to leave the panel ignoring journal updates for the rest of the session.

- **Blacksmith minimum raised from 13.12.2 to 13.19.0.** The declared minimum had fallen behind what the code actually needs, in three places: Blacksmith's global Handlebars helpers only became unconditional in **13.13.2**, and Librarian now depends on them having deleted its own colliding copies; `api.party` arrived in **13.18.2**; and `api.importer`, which the JSON import moves to next, in **13.19.0**. Nothing was broken by the old floor — the party call is feature-detected and Librarian's own templates need no Blacksmith helper — but a manifest that understates its requirements is a promise the module cannot keep.

- **The party roster comes from Blacksmith's Party API.** `getPartyActors()` now calls `api.party.acting()` — the party's player characters — instead of reading `campaign.getParty().members` and falling back to a hand-rolled `game.actors` filter. That fallback is exactly what `api.party` exists to own, and the `acting()` / `resting()` split matters: `resting()` includes familiars and companions, which rest with the party and cannot own the item that reveals a codex entry. The old path is kept behind a feature check for a Blacksmith predating the API, and auto-discovery now distinguishes "no primary party is set" from "the party has no player characters".
- **Handlebars helper registration reduced from seventeen helpers to two.** Five of the seventeen (`add`, `divide`, `eq`, `includes`, `multiply`) are names Blacksmith registers globally and unconditionally at `init`, and `includes` was registered twice. Because Handlebars is a single global namespace with last-registration-wins semantics, re-registering those names did not give Librarian a private copy — it replaced Blacksmith's for every module in the world, benign only for as long as the two implementations happened to agree. Librarian now keeps only what nothing else provides: `default` and `isArray`.

  Librarian's templates depend on Blacksmith's `eq`, `includes`, `and`, `or` and `gt`, which is part of why the Blacksmith minimum moved to a version that registers them unconditionally.

- **The codex export refuses to write a partial file.** An export is a backup, and the dangerous failure is not an error — it is a file that looks complete and is not, found only when someone tries to restore it. Three paths produced exactly that: the export ran off whatever the panel had last rendered rather than refreshing first, so a page added since was silently absent; a page whose content would not read was exported as though it simply had no Expanded Details; and `_refreshData` skips a page that throws while parsing, which removed it from the file with nothing but a console line. The export now refreshes, counts what it gathered against the codex pages actually in the journal, refuses on any mismatch or unreadable page, and reports `N of N` rather than `N` so the check is visible on success.

  It cannot detect the worst case, and does not pretend to: with Librarian disabled, Foundry refuses codex pages at world load, so *any* export taken in that state omits them and reports success. The codex panel cannot open in that state either, so the rule lives in `documents/architecture/architecture-codex.md` — enable Librarian and confirm the browser lists your entries before backing up.

- **The codex panel's render path no longer rebuilds its listeners.** `_activateListeners` ran on every render and did three expensive things for no benefit:

  - **14 `cloneNode(true)` + `replaceChild` sites**, plus around twenty per-node `querySelectorAll().forEach(addEventListener)` loops. The clone idiom exists to strip listeners a node is already carrying, but this ran immediately after `container.innerHTML = html`, so every node it touched was microseconds old and carried none — roughly 2,200 deep subtree clones per render against a 314-entry codex. `.codex-entry-image img` was cloned too, which can force an image re-decode. Handlers are now delegated to the container, which survives `innerHTML`, so they bind once per container instead of once per node per render.
  - **`TextEditor.enrichHTML` awaited once per resolved link, per render.** Categories ran in parallel but entries within a category did not, so a large codex cost hundreds of sequential awaits every time anything re-rendered — including pinning a single entry. The output is deterministic given `uuid` + `label`, both of which are stored on the link, so it is now cached for the session.
  - **The whole dataset serialised and reparsed through JSON**, to "break references and ensure only primitives are passed". It protected nothing: Handlebars does not mutate its context, and the render loop already writes `linksHtml`, `relatedHtml`, `isExpanded` and `locationParts` onto the live entry objects, so the clone came too late to isolate anything.

  Category-collapse restore also switched from `attrValue.trim() === category.trim()` to an exact key match, which is what the template has always used. Trim-matching let a polluted key such as `" Locations\n "` claim a real section — the pollution `_pruneCategoryFlags` exists to clean up after.

- **Filtering the codex by a tag no longer permanently expands every category.** Applying a tag filter called `setFlag('codexCollapsedCategories', {})`, commented "temporarily clear the collapsed state while filtering" — but nothing restored it, so filtering by any tag once destroyed that user's collapse state for good. It was redundant as well as destructive: `render()` already treats an active tag filter as "no categories collapsed", so the expanded-while-filtering behaviour survives without touching stored state.

- **`testing/preflight.py` now verifies every Handlebars helper a template calls has someone registering it**, reading Blacksmith's set from its source rather than assuming it, so Blacksmith dropping one is caught too. Handlebars fails at *render* time with "Missing helper", not at load, so a helper used on one screen can go missing while every other screen still looks correct — which is how the `isArray` removal above got as far as it did. Subexpressions are counted, and the check looks only inside `{{ }}` so that prose like "(GM only)" is not reported as a helper.

- **Editing a quest pin's visibility now warns instead of silently doing nothing.** An audit confirmed quest pins had the exact shape codex pins had before their warning was added, rather than merely resembling it: the pin's `ownership` is what gates players, not `config.blacksmithVisibility`, and `syncQuestPinOwnership` re-derives both from the quest's `visible` flag and the objective's state. So a GM changing visibility in Blacksmith's Configure Pin was making a no-op that looked like it worked and got reverted by the next sync. `manager-quest-pins.js` had no `pins.on('updated')` subscription at all; it now has one, sharing the `AbortController` that `initQuestPins` already created.

- **New codex entries created from the editor window start hidden.** The import path has always created pages with `ownership.default: NONE`; the editor omitted ownership and inherited the journal's default, so the same codex could hold entries with two different starting visibilities depending on how each was made. Hidden is the safe default for campaign content — an entry revealed by accident cannot be un-revealed from the players' memory. Applied on create only; editing never touches ownership, which is the visibility toggle's job.

- **`squireSkipCodexRender` renamed to `librarianSkipCodexRender`.** A private update-option contract between `panel-codex.js` and `manager-journal-routing.js` that outlived the module it was named for. Both halves changed together, which is the only safe way — a half-rename silently returns the codex visibility toggle to triggering full re-renders.

### Documentation

- **The export/subtype hazard now lives in `documents/architecture/architecture-codex.md`**, under "Export completeness, and the subtype hazard". It was briefly written into the migration runbook, which was the wrong home: it is a permanent consequence of owning a declared page subtype, not a step in a migration that is now finished. The runbook points at it instead.
- **`utility-resolver.js` no longer cites `documents/architecture-squire.md`**, a file that never existed in this repo, and its header no longer describes Librarian's behaviour as Squire's.

- **Both architecture documents described a module that no longer exists.** `architecture-codex.md` and `architecture-quests.md` came across from Squire and were never rewritten. They described the tray as the host, named five files absent from this repo (`templates/tray.hbs`, `handle-codex.hbs`, `handle-quest.hbs`, `scripts/manager-pins.js`, `scripts/manager-notifications.js`), and the codex one built its "Core Design Philosophy" on *Structured HTML Content* and a *Parser-Based Architecture* — which the data model replaced in 13.0.0. That mattered more than ordinary staleness, because the project's own rule points a contributor at these files when work lands.

  Corrected rather than rewritten, to avoid discarding detail that is still accurate. The codex document now describes the Tool window host, the page subtype, the shared name→entry resolver, delegated event handling, and the export/subtype hazard; the quest document describes the real hook wiring and pin event subscriptions. **Two sections were replaced with an explicit statement that the feature was not ported** — the codex "unlock notification" and the quest "transient event toasts" both lived in Squire's `manager-notifications.js`, which never came across. Documenting behaviour a reader cannot find is worse than documenting nothing, and both are now flagged as new features rather than restorations if they are ever wanted.

- **`testing/` gained a link-resolution fixture and a README.** `fixture-link-resolution.json` carries four controls, deliberately including failures: a self-link that must resolve, a self-link miss that must stay *out* of the GM-facing count as speculative, an explicit link miss that must be counted **and** retained for Auto-Link to retry, and a `related` pair where one name resolves and one must survive as plain text. Name resolution silently did nothing for years in Squire precisely because "it linked" cannot distinguish a working resolver from an indiscriminate one, and a fixture of names that all *should* resolve proves nothing.

- **The 13.0.0 entry now records the link-resolution work that shipped with the codex port** — name→document resolution through Blacksmith's compendium mapping, retention of unresolved names, the Auto-Link retry, and `related`. The detail existed only in `plan-codex-datamodel.md`, which meant the plan could not be retired.

### Removed

- **The Squire → Librarian migration tooling.** `documents/migration-runbook.md` and both macros in `macros/` are deleted, along with the README section pointing at them. The migration is finished — every world that ever held Squire-era codex data has run it, and since neither module was ever released, no other world exists or can be created. It was also no longer runnable: the runbook's central instruction is to keep Squire on 13.6.1 so its manifest still declares `coffee-pub-squire.codex`, and Squire is on 13.8.1 with `documentTypes` and all codex/quest code removed — under which `migrate-codex-from-squire.js` would pass its own `game.modules.get(SQUIRE)?.active` precondition while the protection that check stood for was gone, and read `system` back from unvalidated pages. Git holds the history.

  Two things were moved out first rather than lost with it: the export/subtype hazard, and a note that migrated pages still carry the `squireMigrationBackup` flag holding their original type and system data. Both now live in `documents/architecture/architecture-codex.md`, which is where a permanent property of the subtype belongs. Clearing those flags remains optional, is the point of no return, and nothing reads them.

- **Nine dead exports that could not have worked.** `helpers.js` carried a quest tooltip surface (`getOrCreateQuestTooltip`, `showQuestTooltip`, `hideQuestTooltip`, `getObjectiveTooltipData`, `getTaskText`, `cleanTaskText`) and a tray accessor (`getHandleFavoriteLimit`) that arrived from Squire, were called by nothing, and between them referenced four identifiers the file never imported (`TEMPLATES`, `QuestParser`, `trackModuleTimeout`, `clearTrackedTimeout`), a `TEMPLATES.TOOLTIP_QUEST` key that does not exist, and a `handleFavoritesMax` setting Librarian never registers. `utility-quest-parser.js` carried `QUEST_STATUSES`, `getQuestStatusDisplayLabel`, and `migrateQuestJournalData` — the last performing bulk journal writes — none of them referenced anywhere. Harmless while unused; a `ReferenceError` the moment anyone wired one up. `helpers.js` is now 379 lines, down from 819.

  The objective pin tooltip's *design* survives — `templates/tooltip-pin-quests-objective.hbs`, its `TEMPLATES` entry, and its stylesheet block are kept for whoever implements it, since no code renders them today.

## [13.0.1]

### Added

- Download link added to the README.

## [13.0.0]

First release. Quests and Codex both arrive from Coffee Pub Squire in it, so
everything below ships together — there is no earlier version to have shipped
the quest half separately.

### Added
- Module scaffold: manifest, entry point, constants, and the Blacksmith readiness contract.
- **Quests, moved from Coffee Pub Squire.** The quest browser, the single-quest editor, the parser, and quest/objective canvas pins, with a menubar launcher. Quest pages are ordinary journal pages — no document subtype — so nothing about existing quests needs migrating to be read here.
  - The quest panel keeps its own window rather than a tray tab. Squire's `PanelManager` owned the panel because the tray rebuilt it whenever the selected token changed; the quest list is the same list regardless of selection, so one lazily-created instance is the whole lifecycle.
  - **Only the quest slice of Squire's pin manager came across** — 741 lines of the 2,325, covering quest and objective pins and the shared API plumbing they need. The codex half follows codex; the note half is Blacksmith's. It was deliberately not ported wholesale: Blacksmith is designing a general annotation model in which a pin is one view of a relationship, and most of a wrapper like this stops existing under it.
  - Quest and objective pin types, their taxonomy, and the canvas double-click that reveals a quest in the browser are registered on ready. Squire did this inside one initialiser covering quests, objectives, notes and codex entries; only the quest half belongs here.
  - `macros/migrate-quests-from-squire.js` hands existing data over: quest settings, page flags, per-user quest state, and the `moduleId` on every quest and objective pin — which is what makes pins placed under Squire visible here. It copies rather than moves, so it is safe to re-run and changes nothing about Squire.
  - Helpers were taken as a subset rather than copied for symmetry — sixteen functions quests actually call, not the whole of Squire's helpers file.
- **Codex arrives from Squire.** The browser, the single-entry editor, the parser, the page subtype and its sheet, codex pins, and import/export. Launched from the Blacksmith menubar beside Quests.
  - **Link resolution and entry relationships shipped with it**, recorded here after the fact — this entry originally listed only the port itself, while `documents/plans/plan-codex-datamodel.md` carried the detail. Three connected pieces, all live since the first release:
    - **`links` resolve names to documents** through Blacksmith's compendium mapping (`api.compendiums.resolveMany`). An entry's own name is resolved against a type derived from its category; cross-references carry their own `type`. Resolution is reported to the GM as "linked N references / M did not resolve", with self-link misses kept out of the count as speculative — most Locations and Factions legitimately have no document of the same name.
    - **Unresolved names are retained**, not discarded. A codex is authored incrementally and the source JSON is gone after import, so a name written before its document exists is a real statement. It renders as plain text and keeps `name`/`type` so it can be retried.
    - **Auto-Link Unresolved Links**, in the codex options menu, is that retry: a GM-triggered pass over every entry holding an unresolved link. Manual by design, since it is a bulk write to journal pages.
  - **`related` — entry-to-entry relationships by name** also shipped here, in the data model, the import/export schema and the browser card. It had no edit or view UI until the `[Unreleased]` entry above; that gap was the field's whole history until then.
  - **Run `macros/migrate-codex-from-squire.js` with both modules enabled before updating Squire.** Unlike the quest migration, this one rewrites the page `type` on live documents: codex pages are a declared subtype, so they must be re-typed from `coffee-pub-squire.codex` to `coffee-pub-librarian.codex`. It updates in place so page ids — and therefore the `codexUuid` every codex pin references — survive, writes `type` and `system` in the same update so the entry data is not reset to model defaults, and stashes the original of both in a flag so `REVERT = true` puts it back.
  - Verifying with Squire disabled only means something **after** migrating. Pages still typed `coffee-pub-squire.codex` fail validation when nothing declares that subtype, so the codex would look broken for reasons unrelated to Librarian.
- **Journal page changes now reach the open browser.** A new `manager-journal-routing.js` re-renders the quest or codex panel when a page in its journal is created, updated or deleted. Squire did this and it was missed in the quest port — the quest window refreshes its own panel after saving, so the round-trip everyone tested worked while edits from the journal sheet, another client, or a macro left the browser stale.

### Fixed
- **The import/export dialog was styled by Squire.** Its markup used `squire-*` class names whose rules only ever existed in Squire's stylesheet, so the dialog would have lost its styling the moment Squire stopped shipping them — invisible while both modules were enabled, which is why the "Squire disabled" pass missed it. The stylesheet is now Librarian's own and every class is renamed. The last `squire-` names elsewhere in the module went with it.

### Changed
- `window-quest-browser.js` is now `window-campaign-browser.js` and hosts both kinds; `QuestBrowserWindow` → `CampaignBrowserWindow`, `openQuestBrowser` → `openCampaignBrowser` (the old API name is kept as an alias).
- The codex subtype string has one definition, in `const.js`, re-exported by the data model. It has to agree exactly with `module.json`'s `documentTypes` or every page fails validation at load, so two copies was one too many.
