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

- **The party roster comes from Blacksmith's Party API.** `getPartyActors()` now calls `api.party.acting()` — the party's player characters — instead of reading `campaign.getParty().members` and falling back to a hand-rolled `game.actors` filter. That fallback is exactly what `api.party` exists to own, and the `acting()` / `resting()` split matters: `resting()` includes familiars and companions, which rest with the party and cannot own the item that reveals a codex entry. The old path is kept behind a feature check for a Blacksmith predating the API, and auto-discovery now distinguishes "no primary party is set" from "the party has no player characters".
- **Handlebars helper registration reduced from seventeen helpers to one.** Five of the seventeen (`add`, `divide`, `eq`, `includes`, `multiply`) are names Blacksmith registers globally and unconditionally at `init`; `includes` was registered twice; and exactly one — `default` — was used by a Librarian template. Because Handlebars is a single global namespace with last-registration-wins semantics, re-registering those names did not give Librarian a private copy, it replaced Blacksmith's for every module in the world. Currently benign only because the implementations happened to agree.

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
