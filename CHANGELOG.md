# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **The Blacksmith window registry could not open either browser.** `registerCampaignBrowserWindows` registered an opener calling `openQuestBrowser`, which stopped existing in 13.0.0 when the file was renamed and the function became `openCampaignBrowser` — so `blacksmith.openWindow('coffee-pub-librarian-quest-browser')` threw a `ReferenceError`. Nothing caught it because the menubar tools reach `module.api.openCampaignBrowser` directly and never route through the registry.
- **Copy Template in the codex importer copied an error message.** `prompts/prompt-codex.txt` was never shipped — only the quest prompt came across from Squire. The fetch failed, the template variable was set to the literal string `Failed to load prompt-codex.txt.`, and the button put that on the GM's clipboard under a "Template copied to clipboard!" toast. The prompt now ships, a failed load leaves the template empty and reports to the console, and the button refuses rather than copying its own error. The same latent defect in the quest importer is fixed too, along with a duplicate success toast that fired even when the copy had failed.
- **Codex, quest and export windows fought over one saved position.** Each mints a per-instance id so several can be open at once, but left `rememberPosition` on. `windowPositionKey` falls back to the class name, so siblings shared a single key and each new window opened on top of the last one the user had moved. They no longer persist position; the browsers, which set a per-kind key, are unaffected.
- **Squire named in three user-facing places**: the codex pin visibility warning told the GM to use "the Squire codex tray", the campaign browser's startup error was prefixed `Coffee Pub Squire |`, and the codex page summary placeholder referred to "the Squire tray".

### Changed

- **Blacksmith minimum raised from 13.12.2 to 13.19.0.** The declared minimum had fallen behind what the code actually needs, in three places: Blacksmith's global Handlebars helpers only became unconditional in **13.13.2**, and Librarian now depends on them having deleted its own colliding copies; `api.party` arrived in **13.18.2**; and `api.importer`, which the JSON import moves to next, in **13.19.0**. Nothing was broken by the old floor — the party call is feature-detected and Librarian's own templates need no Blacksmith helper — but a manifest that understates its requirements is a promise the module cannot keep.

- **The party roster comes from Blacksmith's Party API.** `getPartyActors()` now calls `api.party.acting()` — the party's player characters — instead of reading `campaign.getParty().members` and falling back to a hand-rolled `game.actors` filter. That fallback is exactly what `api.party` exists to own, and the `acting()` / `resting()` split matters: `resting()` includes familiars and companions, which rest with the party and cannot own the item that reveals a codex entry. The old path is kept behind a feature check for a Blacksmith predating the API, and auto-discovery now distinguishes "no primary party is set" from "the party has no player characters".
- **Handlebars helper registration reduced from seventeen helpers to one.** Five of the seventeen (`add`, `divide`, `eq`, `includes`, `multiply`) are names Blacksmith registers globally and unconditionally at `init`; `includes` was registered twice; and exactly one — `default` — was used by a Librarian template. Because Handlebars is a single global namespace with last-registration-wins semantics, re-registering those names did not give Librarian a private copy, it replaced Blacksmith's for every module in the world. Currently benign only because the implementations happened to agree.

- **The codex export refuses to write a partial file.** An export is a backup, and the dangerous failure is not an error — it is a file that looks complete and is not, found only when someone tries to restore it. Three paths produced exactly that: the export ran off whatever the panel had last rendered rather than refreshing first, so a page added since was silently absent; a page whose content would not read was exported as though it simply had no Expanded Details; and `_refreshData` skips a page that throws while parsing, which removed it from the file with nothing but a console line. The export now refreshes, counts what it gathered against the codex pages actually in the journal, refuses on any mismatch or unreadable page, and reports `N of N` rather than `N` so the check is visible on success.

  It cannot detect the worst case, and does not pretend to: with Librarian disabled, Foundry refuses codex pages at world load, so *any* export taken in that state omits them and reports success. The codex panel cannot open in that state either, so the rule lives in `documents/architecture/architecture-codex.md` — enable Librarian and confirm the browser lists your entries before backing up.

- **The codex panel's render path no longer rebuilds its listeners.** `_activateListeners` ran on every render and did three expensive things for no benefit:

  - **14 `cloneNode(true)` + `replaceChild` sites**, plus around twenty per-node `querySelectorAll().forEach(addEventListener)` loops. The clone idiom exists to strip listeners a node is already carrying, but this ran immediately after `container.innerHTML = html`, so every node it touched was microseconds old and carried none — roughly 2,200 deep subtree clones per render against a 314-entry codex. `.codex-entry-image img` was cloned too, which can force an image re-decode. Handlers are now delegated to the container, which survives `innerHTML`, so they bind once per container instead of once per node per render.
  - **`TextEditor.enrichHTML` awaited once per resolved link, per render.** Categories ran in parallel but entries within a category did not, so a large codex cost hundreds of sequential awaits every time anything re-rendered — including pinning a single entry. The output is deterministic given `uuid` + `label`, both of which are stored on the link, so it is now cached for the session.
  - **The whole dataset serialised and reparsed through JSON**, to "break references and ensure only primitives are passed". It protected nothing: Handlebars does not mutate its context, and the render loop already writes `linksHtml`, `relatedHtml`, `isExpanded` and `locationParts` onto the live entry objects, so the clone came too late to isolate anything.

  Category-collapse restore also switched from `attrValue.trim() === category.trim()` to an exact key match, which is what the template has always used. Trim-matching let a polluted key such as `" Locations\n "` claim a real section — the pollution `_pruneCategoryFlags` exists to clean up after.

- **Filtering the codex by a tag no longer permanently expands every category.** Applying a tag filter called `setFlag('codexCollapsedCategories', {})`, commented "temporarily clear the collapsed state while filtering" — but nothing restored it, so filtering by any tag once destroyed that user's collapse state for good. It was redundant as well as destructive: `render()` already treats an active tag filter as "no categories collapsed", so the expanded-while-filtering behaviour survives without touching stored state.

### Documentation

- **The export/subtype hazard now lives in `documents/architecture/architecture-codex.md`**, under "Export completeness, and the subtype hazard". It was briefly written into the migration runbook, which was the wrong home: it is a permanent consequence of owning a declared page subtype, not a step in a migration that is now finished. The runbook points at it instead.
- **`utility-resolver.js` no longer cites `documents/architecture-squire.md`**, a file that never existed in this repo, and its header no longer describes Librarian's behaviour as Squire's.

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
  - **Run `macros/migrate-codex-from-squire.js` with both modules enabled before updating Squire.** Unlike the quest migration, this one rewrites the page `type` on live documents: codex pages are a declared subtype, so they must be re-typed from `coffee-pub-squire.codex` to `coffee-pub-librarian.codex`. It updates in place so page ids — and therefore the `codexUuid` every codex pin references — survive, writes `type` and `system` in the same update so the entry data is not reset to model defaults, and stashes the original of both in a flag so `REVERT = true` puts it back.
  - Verifying with Squire disabled only means something **after** migrating. Pages still typed `coffee-pub-squire.codex` fail validation when nothing declares that subtype, so the codex would look broken for reasons unrelated to Librarian.
- **Journal page changes now reach the open browser.** A new `manager-journal-routing.js` re-renders the quest or codex panel when a page in its journal is created, updated or deleted. Squire did this and it was missed in the quest port — the quest window refreshes its own panel after saving, so the round-trip everyone tested worked while edits from the journal sheet, another client, or a macro left the browser stale.

### Fixed
- **The import/export dialog was styled by Squire.** Its markup used `squire-*` class names whose rules only ever existed in Squire's stylesheet, so the dialog would have lost its styling the moment Squire stopped shipping them — invisible while both modules were enabled, which is why the "Squire disabled" pass missed it. The stylesheet is now Librarian's own and every class is renamed. The last `squire-` names elsewhere in the module went with it.

### Changed
- `window-quest-browser.js` is now `window-campaign-browser.js` and hosts both kinds; `QuestBrowserWindow` → `CampaignBrowserWindow`, `openQuestBrowser` → `openCampaignBrowser` (the old API name is kept as an alias).
- The codex subtype string has one definition, in `const.js`, re-exported by the data model. It has to agree exactly with `module.json`'s `documentTypes` or every page fails validation at load, so two copies was one too many.
