# TODO

Open work for Coffee Pub Librarian, ordered by severity.

## How this file works

- **One item, one ID.** IDs are stable — reference them in commits and PRs.
- **Nothing is finished until the docs are.** When an item lands, update the
  affected `documents/architecture/*.md`, the relevant Blacksmith API notes, and
  `CHANGELOG.md` in the same commit.
- **Completed items are deleted from this file**, not ticked — once the work is
  logged in the architecture doc and the changelog, this file has no reason to
  carry it. If it isn't logged, it isn't done.
- **Implemented plans are deleted.** A plan in `documents/plans/` lives only until
  every phase has shipped and been recorded elsewhere.
- **Severity is about the user, not the effort.** Critical means broken in shipped
  code. Size (S/M/L) is a separate column.

## Standing rule: Blacksmith first

Blacksmith owns the shared surface. Before building anything here, check
`../coffee-pub-blacksmith/documentation/api/` for an API that already covers it.
If one exists, use it. If one exists but does not cover the need, **request an
extension from Blacksmith** rather than working around it locally. Items tagged
**[EXT]** below are open extension requests.

---

## At a glance

| ID | Sev | Area | Item | Size |
|---|---|---|---|---|
| **C1** | Critical | Windows | `openQuestBrowser` is undefined — Blacksmith window registry opener throws | S |
| **C2** | Critical | Import | `prompts/prompt-codex.txt` does not exist; Copy Template copies an error string | S |
| **C3** | Critical | Branding | Squire named in a user-facing notification and a thrown error | S |
| **H1** | High | Blacksmith API | Librarian's Handlebars helpers shadow Blacksmith's global helpers | S |
| **H2** | High | Blacksmith API | Adopt `api.tags` + TagWidget; stop storing tags in record data | L |
| **H3** | High | Blacksmith API **[EXT]** | Tag taxonomy still says `coffee-pub-squire.*` — needs `coffee-pub-librarian.*` | S |
| **H4** | High | Blacksmith API | `getPartyActors()` reinvents the roster fallback — use `api.party.acting()` | S |
| **H5** | High | Blacksmith API | CSS uses 69 raw hex literals and 3 design tokens | M |
| **H6** | High | Blacksmith API **[EXT]** | `api.importer` is documented but unpublished — ~600 lines duplicated here | M |
| **H7** | High | Codex | `related` has no edit or view UI anywhere | M |
| **H8** | High | Perf | 31 `cloneNode`/`replaceChild` sites in the render path do nothing | S |
| **H9** | High | Perf | `enrichHTML` runs per link per render; output is deterministic | S |
| **H10** | High | Perf | `JSON.parse(JSON.stringify())` deep-clones the whole dataset every render | S |
| **H11** | High | UI | Import progress bar has been dead since Squire 13.6.0 | S |
| **M1** | Medium | Codex | Tag filter permanently expands every category | S |
| **M2** | Medium | Quests | Redundant post-render collapse restore with trim-matching | S |
| **M3** | Medium | Quests | **AUDIT** — quest pin visibility may share the codex pin no-op | M |
| **M4** | Medium | Cleanup | Six dead exports in `helpers.js` reference four undefined identifiers | S |
| **M5** | Medium | Cleanup | Three dead exports in `utility-quest-parser.js` | S |
| **M6** | Medium | Codex | New entries from the editor window set no ownership; import does | S |
| **M7** | Medium | Quests | `getQuestStatusDisplayLabel` doc says "Complete", returns "Succeeded" | S |
| **M8** | Medium | Blacksmith API | Adopt `api.entityList` for participant pickers | M |
| **M9** | Medium | Naming | `squireSkipCodexRender` outlived its module | S |
| **M10** | Medium | Windows | Three multi-instance windows share one saved position key | S |
| **L1** | Low | v14 | Bare `FilePicker` and `saveDataToFile` globals | S |
| **L2** | Low | Docs | `utility-resolver.js` cites `documents/architecture-squire.md`, which does not exist | S |
| **L3** | Low | Docs | Doc paths drifted after the `documents/` reorganisation | S |
| **L4** | Low | Docs | CHANGELOG 13.0.0 omits Auto-Link, `related`, and retain-unresolved links | S |
| **L5** | Low | Testing | No link-resolution test fixture | S |
| **L6** | Low | Debt | `utility-base-parser.js` / `utility-journal.js` duplicated with Squire | — |
| **L7** | Low | Menubar | Decide whether Librarian's menubar tools declare `supersedes` | S |
| **A1** | Decision | Architecture | Quests are still HTML-parsed; codex is not | L |
| **A2** | Decision | Architecture | Journal routing bypasses Blacksmith's HookManager | S |
| **A3** | Decision | Architecture **[EXT]** | No Blacksmith API covers a panel-style entity browser | — |
| **A4** | Decision | Architecture | Read `api-notes.md` before touching codex pins again | S |
| **A5** | Decision | Suite | `coffee-pub-scribe` exists and is under-developed | — |
| **A6** | Decision | Windows | Codex → Tool window; Quests → standard, master-detail. Zero Tool windows today | M |
| **A7** | Decision | Migration | Macros vs Blacksmith's settings-adoption table | M |

In flight: [the Squire → Librarian migration](#in-flight--squire--librarian-migration).
Not scheduled: [backlog](#backlog--quest-enhancements).

---

## In flight — Squire → Librarian migration

Codex code is in; what remains is the live pass. **The procedure is
[`documents/migration-runbook.md`](migration-runbook.md)** — it is the single
source and is not restated here.

- [ ] Run the runbook end to end on production.

Two things about it that outlive the run:

- **It is per world.** Any other world still has quests and codex pages addressed
  to `coffee-pub-squire`, and must run the macros **before** that world updates
  Squire past the release that drops them.
- **Step 5 — verify with Squire disabled — is the load-bearing one.** Handlebars
  helpers, partials and CSS class names are world-global, so while both modules
  run Librarian can be silently borrowing Squire's. That is not hypothetical: it
  is how the missing `registerHelpers` and the unstyled import/export dialog were
  found. See also **H1**, which is the same failure mode pointed at Blacksmith.

---

## Critical

Broken in shipped code.

### C1 — `openQuestBrowser` is undefined

[`window-campaign-browser.js:200`](../scripts/window-campaign-browser.js#L200) registers
each browser with Blacksmith's window registry using an opener that calls
`openQuestBrowser(kind)`. That function does not exist in the file — it was renamed
to `openCampaignBrowser` in 13.0.0 and this call site was missed. Any caller going
through `blacksmith.openWindow('coffee-pub-librarian-quest-browser')` gets a
`ReferenceError`.

It has gone unnoticed because the menubar tools call
`module.api.openCampaignBrowser` directly and never route through the registry.

**Fix:** rename the call. **Also:** add a smoke check that opens both browsers
through `blacksmith.openWindow` rather than through the module API, since that is
the path nothing currently exercises.

### C2 — `prompts/prompt-codex.txt` does not exist

[`panel-codex.js:1566`](../scripts/panel-codex.js#L1566) fetches
`modules/coffee-pub-librarian/prompts/prompt-codex.txt`. Only `prompt-quests.txt`
shipped. The fetch fails, `template` is set to the literal string
`Failed to load prompt-codex.txt.`, and **Copy Template** in the codex import
dialog puts that string on the GM's clipboard — silently, with an
"Template copied to clipboard!" toast.

**Fix:** ship the prompt (it exists in Squire's history), and make the failure
path refuse to copy rather than copying its own error message.

### C3 — Squire named in user-facing strings

- [`manager-codex-pins.js:439`](../scripts/manager-codex-pins.js#L439) — a GM warning
  tells them to *"Use the visibility toggle … in the Squire codex tray instead."*
- [`window-campaign-browser.js:14`](../scripts/window-campaign-browser.js#L14) — thrown
  error is prefixed `Coffee Pub Squire |`.
- [`page-codex-fields-edit.hbs:10`](../templates/page-codex-fields-edit.hbs#L10) —
  placeholder reads *"shown in the Squire tray."*

---

## High

### H1 — Handlebars helpers shadow Blacksmith's globals

[`helpers.js:626`](../scripts/helpers.js#L626) registers 17 global Handlebars
helpers. Five of them — `add`, `divide`, `eq`, `includes`, `multiply` — are names
Blacksmith already registers globally and **unconditionally** at `init`
(`api-core.md`, "Handlebars helpers"). Handlebars is last-registration-wins, so
whichever module inits last defines them **for every module in the world**, not
just for Librarian.

It is currently benign only because the implementations happen to be equivalent.
Any future divergence in either module silently breaks the other's templates.

Worse, the duplication buys nothing: **only one of the 17** (`default`) is used by
any Librarian template. `concat`, `copyToClipboard`, `formatNumber`,
`formatTimestamp`, `isArray`, `lte`, `renderTask`, `some`, `times`, `toLowerCase`,
`toUpperCase` are used by nothing at all, and `includes` is registered twice in the
same function.

**Fix:** delete every helper Blacksmith already provides and every helper nothing
uses. Depend on Blacksmith's globals — they are documented as unconditional, and
Blacksmith is a hard dependency. The 13.0.0 rationale ("Squire registers its own
set, so Librarian was borrowing them") was right about the problem and wrong about
the fix: the answer was to depend on Blacksmith, not to grow a third copy.

### H2 — Adopt `api.tags` and TagWidget

`api-tags.md` is explicit: *"Consuming modules do not store tags in their own
record data."* Librarian stores them three separate ways:

- codex entry tags in `system.tags` ([`codex-page-model.js`](../scripts/data/codex-page-model.js));
- quest tags parsed out of `<strong>Tags:</strong>` ([`utility-quest-parser.js`](../scripts/utility-quest-parser.js));
- codex **pin** tags derived from the category slug at
  [`manager-codex-pins.js:211`](../scripts/manager-codex-pins.js#L211).

None of the three know about each other, and none participate in the shared
vocabulary. Blacksmith already ships the storage, the taxonomy, GM-wide
rename/delete that propagates to every record, and an embeddable `TagWidget` —
against which Librarian's hand-built tag cloud, chip input and filter are a
reimplementation.

**Blocked on H3.** Do this as one change across both features rather than twice;
doing it during **A1** would avoid migrating quest tags a second time.

**Expect to be TagWidget's first consumer.** `templates/partials/tag-widget.hbs`
and `widget-tags.css` are complete and the stylesheet does load, but no Blacksmith
template renders the partial — so nothing has exercised it in a world. Budget for
shaking out bugs, and note two documented traps up front: pass the context
**positionally** (`{{> blacksmith-tag-widget TagWidget}}`, not `tags=TagWidget`, or
you get a silent empty div), and `TagWidget.activate()` is the entire event layer —
without it the widget renders inert. Filter mode is documented as **not
implemented**; do not use it.

### H3 — [EXT] Tag taxonomy is still addressed to Squire

`../coffee-pub-blacksmith/resources/tag-taxonomy.json` defines
`coffee-pub-squire.codex`, `coffee-pub-squire.quest` and
`coffee-pub-squire.objective`. Those domains moved here in 13.0.0.

**Request:** Blacksmith adds `coffee-pub-librarian.codex`,
`coffee-pub-librarian.quest` and `coffee-pub-librarian.objective` contexts, and
decides whether the Squire entries are retired or aliased. Note the protected-tag
rule — anything Librarian checks by value (`main`, `side`) must be
`protected: true`.

`tags.register()` can carry this at runtime for development, but a shipped module
belongs in the JSON.

### H4 — `getPartyActors()` reinvents the roster fallback

[`helpers.js:234`](../scripts/helpers.js#L234) reads
`campaign.getParty()?.members`, then falls back to a hand-rolled
`game.actors.filter(a => a.type === 'character' && a.hasPlayerOwner && !a.isToken)`.

`api-party.md` describes that fallback as *"the part every consumer reinvents
slightly differently, which is most of why this exists"*, and draws a distinction
Librarian's version misses: `acting()` (player characters — who can act on their
own behalf) versus `resting()` (party creatures, including familiars and
companions). Auto-discovery wants `acting()`.

`campaign.getParty()` returns the *configured* party block from campaign settings;
`api.party` returns the live roster with the fallback owned upstream. They are not
interchangeable.

**Fix:** `blacksmith.party.acting()`, and surface `hasPrimaryParty()` in the
auto-discovery warning so "no party members found" explains itself.

### H5 — CSS ignores the design system

`styles/` contains **69 raw hex colour literals** and **3** `var(--blacksmith-*)`
references. `design-tokens.md` states the rule directly: *"new CSS references
tokens rather than repeating literal values."*

`window-import-export.css` additionally carries 25 `!important` declarations,
inherited from the Squire copy.

**Fix:** convert to the token scale (`--blacksmith-space-*`,
`--blacksmith-surface-*`, `--blacksmith-color-brand-*`), always with a literal
fallback so the module degrades if Blacksmith is disabled. Read
`design-system/design-extending.md` first.

### H6 — [EXT] `api.importer` is documented but unpublished

`api-importer.md` describes a full import/validate/template contract, but is marked
*"Proposed contract. This namespace is not yet guaranteed"* — and `api.importer` is
genuinely absent from Blacksmith's API object.

The cost is here: ~600 lines of near-duplicate import/export dialog across
[`panel-codex.js:1563-1795`](../scripts/panel-codex.js#L1563-L1795) and
[`panel-quest.js:867-1105`](../scripts/panel-quest.js#L867-L1105) — file picking,
JSON validation, progress reporting, duplicate-name warnings and template copying,
written twice.

**Request:** publish `api.importer` with `journal.codex` and `journal.quest`
profiles. Failing that, expose the shared importer window Blacksmith already drives
internally, so Librarian stops reimplementing the dialog.

The note in [`helpers.js`](../scripts/helpers.js) about `showBlacksmithWait` being a
stopgap "while their eventual importer replacement is blocked on the public
Blacksmith Importer API" is still accurate — there is now a documented contract to
converge on.

### H7 — `related` has no edit or view UI

Shipped in Squire 13.3.12 and carried across intact: `related` appears in the
import/export schema, the data model, and the panel card — and in **zero** edit or
view surfaces. The string does not occur in `window-codex.js`,
`templates/window-codex.hbs`, `sheets/codex-page-sheet.js`,
`page-codex-fields-edit.hbs`, or `page-codex-fields-view.hbs`. Three gaps:

- **Edit Entry window** — cannot add, remove, or see related entries. `links` next
  door has a full drop-zone-and-chips UI. Related entries are plain names resolved
  at render, not UUIDs, so this wants a chip-style text control (`<string-tags>`,
  as `tags` uses) and **not** a drop zone.
- **Journal page edit form** — same gap on the page sheet.
- **Journal page view** — the bigger miss: Related is not *displayed* on the page
  at all, so "Read More" shows an entry stripped of its relationships. The card
  shows them; the full page does not.

Not data-destructive today: both save paths write `page.update({ system: … })`,
which **merges**, so a field absent from the payload survives (`discoveredBy` has
always relied on this). A GM can edit an entry without wiping `related` — they
simply cannot touch it. **Verify that still holds** if either save path ever
changes to replace rather than merge.

Reuse the panel's page index and `_renderCodexRef()` rather than growing a second
name→page lookup.

### H8 — 31 clone-and-rebind sites do nothing

`_activateListeners()` runs `cloneNode(true)` + `replaceChild` before binding —
**14 sites in `panel-codex.js`, 17 in `panel-quest.js`**. The idiom exists to strip
pre-existing listeners, but `_activateListeners` runs once, immediately after
`container.innerHTML = html`, so every node it touches is microseconds old and has
none.

Against a 314-entry codex that is roughly 2,200 deep subtree clones plus 2,200
`replaceChild` per render. `.codex-entry-image img` is cloned too, which can force
image re-decode.

**Fix:** bind to the original node. Better: delegate to a stable parent, which also
removes the per-entry binding cost entirely.

### H9 — Link enrichment is re-done every render

[`panel-codex.js:1946`](../scripts/panel-codex.js#L1946) awaits
`TextEditor.enrichHTML()` once per resolved link, inside `for (const entry of
entries)`. Categories are parallel; entries within a category are not. Characters
alone can be up to 120 sequential awaits, ~314 across a real codex.

`@UUID[uuid]{label}` output is deterministic given `uuid` + `label`, both stored on
the link. A session-scoped `Map` keyed `` `${uuid}|${label}` `` takes a full render
from ~314 enrich calls to ~0.

### H10 — Whole dataset deep-cloned through JSON on every render

[`panel-codex.js:2029`](../scripts/panel-codex.js#L2029) and
[`panel-quest.js:3572`](../scripts/panel-quest.js#L3572) both do
`JSON.parse(JSON.stringify(templateData))` immediately before rendering — a full
serialise-and-reparse of every entry, tag, link and objective, per render.

The stated intent is "break references and ensure only primitives are passed."
Establish what actually needs breaking; if the answer is "nothing", delete it. If
something does, `foundry.utils.deepClone` is cheaper and does not silently drop
`undefined`, `Map`, and `Set` values the way a JSON round-trip does.

### H11 — The import progress bar has been dead since Squire 13.6.0

`panel-codex.js` and `panel-quest.js` both drive `.tray-progress-bar-wrapper`,
`-inner` and `-text`, which only ever existed in Squire's `tray.hbs`. Once the
panels moved into windows the elements stopped existing, so every `querySelector`
returns null and the progress display silently does nothing — through imports,
Auto-Link, and auto-discovery alike.

It is not just cosmetic: `_autoDiscoverFromInventories` interleaves
`await moduleDelay(...)` calls of 200ms–5s specifically to make progress *visible*,
so a scan is slowed down substantially for a display nobody can see.

**Fix:** either add the markup to `window-campaign-browser.hbs` or delete the code
and the delays with it. Right now it is neither.

---

## Medium

### M1 — Tag filter permanently expands every category

[`panel-codex.js:726`](../scripts/panel-codex.js#L726) — applying a tag filter does
`setFlag('codexCollapsedCategories', {})`. The comment says "temporarily clear
while filtering"; nothing restores it. Filter by any tag once and every category is
permanently expanded.

`render()` already computes `collapsedCategories` as `{}` when a tag filter is
active, so the flag write is redundant as well as destructive — deleting it is
likely the whole fix.

### M2 — Redundant collapse restore in the quest panel

`panel-quest.js` runs a post-render pass that iterates every key in
`questCollapsedCategories` and matches sections with `.trim()`, on top of the
template already applying collapse by exact key.

**Latent, not live**, only because quest keys come from a fixed status set
(`Active`/`Complete`/…) rather than user-authored names, so they never got
polluted. The codex equivalent *did* get polluted and overrode real state on every
render — which is why pinning an entry appeared to collapse its category.

Delete the redundant pass; the template is correct. The same trim-match appears at
three sites (search for `attrValue.trim() === category.trim()`).

### M3 — AUDIT: quest pin visibility

Quest pin visibility may share the silent no-op that was fixed for codex pins.
Visibility is *derived*, never configured, and the pin's `ownership` — not
`config.blacksmithVisibility` — is what actually gates players. A GM editing
visibility in Blacksmith's Configure Pin changes nothing and gets reverted by the
next sync.

`createQuestPin` derives from the page's `visible` flag; `createObjectivePin`
derives from quest/objective state. Codex has the warning
(`_warnIfCodexPinVisibilityEdited`); quests do not.

See **A4** — `api-notes.md` documents Blacksmith's own answer to this exact
problem, and it may make the warning unnecessary rather than needing a second copy.

### M4 — Dead exports in `helpers.js` with broken references

Six exports are called by nothing in the module:
`getOrCreateQuestTooltip` (:18), `showQuestTooltip` (:357), `hideQuestTooltip`
(:420), `getTaskText` (:444), `getObjectiveTooltipData` (:490),
`getHandleFavoriteLimit` (:585).

They are not merely unused — they reference four identifiers the file never
imports (`TEMPLATES`, `QuestParser`, `trackModuleTimeout`, `clearTrackedTimeout`),
plus `TEMPLATES.TOOLTIP_QUEST` which is not a key in `const.js`, and a
`handleFavoritesMax` setting Librarian never registers. Two also log with a
`SQUIRE |` prefix.

Harmless while unused; a `ReferenceError` the moment anyone wires one up. Delete
them, or restore them properly if the objective tooltip is meant to come back —
`TEMPLATES.TOOLTIP_PIN_QUEST_OBJECTIVE` and
`templates/tooltip-pin-quests-objective.hbs` both exist and are otherwise unused,
which suggests it was mid-port.

### M5 — Dead exports in `utility-quest-parser.js`

`QUEST_STATUSES`, `getQuestStatusDisplayLabel` and `migrateQuestJournalData` are
exported and referenced nowhere. `migrateQuestJournalData` performs bulk journal
writes and requires a GM — dead code that rewrites documents is worth removing
deliberately rather than leaving reachable from the console.

### M6 — New codex entries set no ownership

The import path explicitly creates pages with
`ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }`
([`panel-codex.js`](../scripts/panel-codex.js)), so an imported entry starts hidden
from players. The editor window's create path
([`window-codex.js` `_updateObject`](../scripts/window-codex.js)) omits `ownership`
entirely and inherits the journal default.

Two ways to create an entry, two different starting visibilities. Pick one — almost
certainly hidden — and apply it in both.

### M7 — Status label contract disagrees with itself

`getQuestStatusDisplayLabel` is documented as returning *"Available, Active, or
Complete"* but delegates to `normalizeQuestStatus`, which returns `Succeeded`.
`_applyQuestStatus` documents persisted values as *"`Not Started`, `In Progress`,
`Complete`, `Failed`"*, which is a third vocabulary and matches neither the
canonical set (`QUEST_STATUSES`) nor what the parser writes.

`_setObjectiveState` hedges with `['Complete', 'Succeeded'].includes(currentStatus)`,
which is the smell. Settle on one vocabulary and fix the comments; **A1** would
settle it structurally.

### M8 — Adopt `api.entityList` for participant selection

`window-quest.js` builds party-participant pickers by hand. `api.entityList`
provides exactly this — single/multi select, `providers.fromActors()`, keyboard and
screen-reader semantics from native inputs, and a documented read contract.

Note the documented trap when adopting it: use `readFrom(root)` at submit time, not
`getSelection()`. A list seeded with a current selection whose `attach` silently
failed hands that seed back and is indistinguishable from a user choice.

### M9 — `squireSkipCodexRender`

An update-option name that outlived its module. `panel-codex.js` sends it
([:1083](../scripts/panel-codex.js#L1083)) and `manager-journal-routing.js` reads it
([:34](../scripts/manager-journal-routing.js#L34)). Renaming means changing both
halves in one commit — small, but it must be atomic or the codex visibility toggle
starts triggering full re-renders again.

### M10 — Multi-instance windows share one saved position key

`CodexWindow`, `QuestWindow` and `DataExportWindow` each mint a random instance id
(`${BASE}-${randomID().slice(0, 8)}`) so several can be open at once, but none sets
`windowPositionKey` or `rememberPosition: false`.

`window-base.js:135` falls back to `blacksmith-win-pos-${this.constructor.name}`,
so every instance of a class shares one key — and per `api-window.md`, siblings then
overwrite each other's saved position and the second opens on top of the first.

**Fix:** `rememberPosition: false` on all three. They are transient editors, not
placed tools. `CampaignBrowserWindow` already does this correctly — it sets a
per-kind key ([:94](../scripts/window-campaign-browser.js#L94)) — so this is the
odd-one-out rather than a module-wide pattern.

---

## Low

### L1 — v14 deprecation hazards

The manifest declares `"maximum": "14"`. Three bare globals are v13 deprecation
shims that will not survive it:

- `FilePicker` — [`window-codex.js:849`](../scripts/window-codex.js#L849),
  [`window-quest.js:855`](../scripts/window-quest.js#L855). Use
  `foundry.applications.apps.FilePicker`.
- `saveDataToFile` — [`window-data-export.js:101`](../scripts/window-data-export.js#L101).
  Use `foundry.utils.saveDataToFile`. (It is already guarded with a Blob fallback,
  so this one degrades rather than breaks.)

Both `FilePicker` sites are guarded with `typeof FilePicker !== 'function'`, so the
failure mode is a silent missing feature rather than an error. Blacksmith ships
`documentation/plans/migration-v14.md` — read it before doing this.

### L2 — Stale doc reference in code

[`utility-resolver.js:6`](../scripts/utility-resolver.js#L6) cites
`documents/architecture-squire.md`, which has never existed in this repo. The same
header still says "Squire never searches packs" throughout. Retarget to
`documents/architecture/architecture-codex.md` and reword.

### L3 — Doc paths drifted after the `documents/` reorganisation

Architecture docs moved to `documents/architecture/` and plans to
`documents/plans/`. Sweep for references to the old flat paths, including in
`CHANGELOG.md` and any macro headers.

### L4 — CHANGELOG omits shipped Phase 4 work

[`documents/plans/plan-codex-datamodel.md`](plans/plan-codex-datamodel.md) records
Phase 4 as implemented July 15, 2026 — `related` entries, retain-unresolved links,
and the Auto-Link rescan tool. `CHANGELOG.md` 13.0.0 does not mention any of the
three, though all are present in the code.

Per the completion rule, this is the gap that keeps Phase 4 from being closeable.
Reconcile the changelog, then Phases 1–2 and 4 can be struck from the plan; Phase 3
(verification) and Phase 5 (suggested discoveries, designed but not built) keep the
plan alive.

### L5 — Link-resolution test fixture

Keep a fixture in the repo: a quest JSON with a known-good name **and a
guaranteed-miss control**. Name resolution silently did nothing for years in Squire
and nobody noticed — "it linked" alone cannot distinguish a working resolver from
an indiscriminate one.

### L6 — Duplicated parsers with Squire

`utility-base-parser.js` and `utility-journal.js` exist in both modules. Squire
still needs them for Notes. They converge or diverge for real when Notes moves to
Blacksmith — not before. No action now; recorded so the duplication is deliberate
rather than forgotten.

---

### L7 — Decide whether the menubar tools declare `supersedes`

`registerMenubarTool` accepts `supersedes: [toolId, ...]`, which drops or refuses a
duplicate registration in either load order. Blacksmith's
`plan-squire-tool-adoption.md` kept the mechanism specifically because *"the
Librarian extraction meets the same problem"* — a user with one module updated and
the other not sees two identical Quests icons.

Librarian's two tools (`librarian-quests`, `librarian-codex`) declare nothing today.

But the same plan removed its own three `supersedes` entries on the grounds that
they *"were written to protect users who do not exist"*, and left this instruction:
**ask who the affected user is before building the affordance.** For a single
consumer releasing both modules together, the answer is nobody.

**Action is to record the decision, not necessarily to write code.** Note it here so
it is not relitigated, and revisit only if Librarian ever ships to a world that
updates the two modules independently. Squire's tool ids are `squire-quests` /
`squire-codex` if it turns out to be needed.

## Architecture decisions

Not bugs. Each needs a call before the code that depends on it is written.

### A1 — Quests are still HTML-parsed

Codex was modernised in 13.0.0 — a `JournalEntryPage` subtype, a `TypeDataModel`,
schema validation, no parsing. **Quests were not.** They remain plain `text` pages,
and every read and write goes through regex and `DOMParser` against
`<strong>Status:</strong>` markup:

- [`utility-quest-parser.js`](../scripts/utility-quest-parser.js) — 425 lines that
  exist only to un-parse HTML the module itself wrote;
- [`panel-quest.js` `_setObjectiveState`](../scripts/panel-quest.js#L630) — rewrites
  `<li>` inner HTML to encode state as `<s>` / `<code>` / `<em>`;
- `_applyQuestStatus`, `_mergeJournalContent`,
  `_generateJournalContentFromImport` — string surgery on generated markup;
- GM hints and treasure encoded as `||text||` and `((Treasure))` inside task text.

This is the largest single lever in the repo. Moving quests onto a data model would
delete the parser, the status regexes and most of the objective-state code, and it
is the natural moment to adopt **H2** — otherwise quest tags get migrated twice.

Against it: it is a real migration with a live-world runbook, on top of one that
has not finished running yet (**In flight**). Sequencing matters more than the
decision itself.

### A2 — Journal routing bypasses HookManager

[`manager-journal-routing.js:62-64`](../scripts/manager-journal-routing.js#L62-L64)
registers `createJournalEntryPage` / `updateJournalEntryPage` /
`deleteJournalEntryPage` with raw `Hooks.on`, and the file header argues the case:
plain post-event hooks, own cleanup, no need for the indirection.

Reasonable, but it forfeits `key` dedupe and `disposeByContext`, and Blacksmith's
own `manager-notes.js` watches the same three hooks — so ordering between them is
currently unspecified. Given the standing Blacksmith-first rule, this should be an
explicit exception or it should change. Note also that two panels carry comments
claiming *"Journal hooks are handled by HookManager"*
([`panel-codex.js:129`](../scripts/panel-codex.js#L129),
[`panel-quest.js:735`](../scripts/panel-quest.js#L735)) which is not true either way.

### A3 — [EXT] No Blacksmith API covers an entity browser

The codex and quest panels are ~6,000 lines of list rendering, search, tag
filtering, category collapse with persisted per-user state, inline pin controls and
visibility toggles. There is no Blacksmith counterpart, and `api.entityList` is
explicitly *not* it — it renders a picker, not a browser.

Worth asking Blacksmith whether this belongs upstream before investing further,
particularly since Notes has the same shape and Blacksmith already ships a
`blacksmith-notes` list window.

### A4 — Read `api-notes.md` before touching codex pins again

Blacksmith's Notes API solved three problems Librarian solved separately, and
solved them differently:

- **visibility rewrites ownership**, including the pin's, rather than being derived
  and re-synced (compare `updateCodexPinVisibility` and **M3**);
- **the pin owns the icon**, so "the pin uses the icon I chose" is true by
  construction — Librarian keeps `system.categoryIcon` and re-derives the pin image
  on every update (`_codexCategoryToImage`);
- **unplace preserves icon and design**, which Librarian reimplements.

Codex is rightly its own domain with its own subtype — this is not a call to adopt
`api.notes`. It is a call to read how Blacksmith models the same relationships
before the codex pin wrapper grows further, since
[`manager-codex-pins.js`](../scripts/manager-codex-pins.js) already says the
annotation model is *"expected to dissolve most of this wrapper."*

### A5 — Scribe

An under-developed `coffee-pub-scribe` exists. Worth reading before this module
accumulates a personality it cannot share.

### A6 — Which windows should be Tool windows?

**Librarian uses `BlacksmithToolWindowBaseV2` for nothing.** All four windows —
both browsers, both editors, and the export window — extend the standard
`BlacksmithWindowBaseV2`. `getToolWindowBaseV2` is never called.

**The reference implementation is Blacksmith's Compendium Search**
(`../coffee-pub-blacksmith/scripts/window-compendium-search.js`, 581 lines). It is
the closest analogue in the suite to what the codex browser is: a search-first,
filtered, grouped, scrolling list of records you keep open beside the canvas and
drag out of.

An earlier reading of this said a Tool window could not host a long list, on the
strength of the base's `height: 'auto'` / `resizable: false` defaults and the
absence of the five-zone layout. **That is wrong**, and Compendium Search is the
counter-example on every point:

| Objection | What Compendium Search actually does |
|---|---|
| Tool windows are auto-height, non-resizable palettes | `position: { width: 420, height: 620 }`, `resizable: true`, `windowSizeConstraints: { minWidth: 320, minHeight: 300 }` |
| No zone to hang search and filters on | `toolBarLeft` carries the search input and both filter selects; `bodyContent` is a bare `<div data-results>` |
| No status or action affordance | `toolFooterLeft` / `toolFooterRight` — "17 in 9 sources (103ms)" and "Drag onto a sheet" |
| No titlebar controls | `getToolHeaderActions()` returns the refresh icon; the menu dot carries the rest |
| Can't be a long list | Grouped, iconed results across nine packs |

#### The real prize is the render architecture, not the shell

Compendium Search **paints results into the results container directly and never
re-renders the Application on a keystroke**, because re-rendering would rebuild the
search input and drop focus and caret. Listeners are **delegated to the results
container**, so a repaint needs no rebinding. It re-renders only when the *shape*
changes — picking a type rebuilds the subtype list — and restores focus explicitly
afterwards. A monotonic token stops a slow query repainting over a newer one, and
the query is debounced 140ms.

Librarian's panels do the opposite. `CodexPanel.render()` rebuilds
`codexContainer.innerHTML` wholesale and re-binds every node, which is the root of
three separate items already on this list:

- **H8** — 31 `cloneNode`/`replaceChild` sites exist to strip listeners from nodes
  that were just created. Delegation makes them unnecessary by construction.
- **H9** — ~314 sequential `enrichHTML` awaits, redone on every render because
  every render is a full rebuild.
- **H10** — the whole dataset JSON round-tripped per render, same cause.

It also explains a fourth. Because a full re-render is too expensive to run per
keystroke, search and tag filtering were implemented **a second time** as live DOM
show/hide inside `_activateListeners` — so filtering exists twice, in two
languages, and the two must agree. **M1** (the tag filter clobbering
`codexCollapsedCategories`) is a direct symptom: filter state lives in the DOM
*and* in a user flag, and the two fell out of step.

The numbers make the case. Compendium Search reports **103ms across nine
compendium packs** — genuinely expensive I/O. Librarian is slower than that against
314 journal pages **already in memory**. The gap is not the data; it is the render
architecture.

#### Recommendation

**Codex → Tool window, modelled on Compendium Search. Quests → stays on the
standard base and grows into a master-detail app.**

An earlier draft of this item argued the opposite — that both browsers were the same
interaction shape and should differ only in `toolTheme` / `toolTitlebar` defaults.
**That holds only while Quests stays a single-column list.** It does not survive the
planned master-detail layout: quest list in a left pane, quest detail in the right.

Those are two different windows once the detail pane exists:

| | Codex | Quests (planned) |
|---|---|---|
| Layout | Single column, search-first | Two panes, list + detail |
| Width | Palette — Compendium Search is 420 | App — needs ~900–1200 |
| Canvas visible at the same time? | Yes, that's the point | No, it fills the screen |
| Job | Look something up mid-session | Work through a quest |
| Chrome | Tool toolbar + footer | Five zones, incl. action bar |

The in-suite precedents are both in the same screenshot as the question: the
**Artificer Crafting Station** (Recipes │ Components │ Crafting Bench │ Details,
with per-pane search and a REFRESH / CLEAR / CRAFT action bar) and the **Messages**
window (conversation list left, thread right). Both are multi-pane standard windows.
Compendium Search is the other pole, and Codex belongs at it.

**The fork of `CampaignBrowserWindow` is caused by the layout divergence, not by the
base-class choice.** Once Quests has a detail pane the two stop sharing a body
template regardless of what they extend, so "it would fork the shared class" is no
longer an argument against. Record that here so the fork is not later blamed on the
tool-window decision.

**Sequence Codex first.** It is read-mostly; Quests carries pin placement, objective
state writes, per-user flag mirroring and the notification trackers — and now a
layout change on top. Note the warning from `plan-squire-tool-adoption.md`, where
the proving-run pick was wrong: Dice Tray *looked* self-contained and turned out to
be the one wired into Squire's lifecycle. Verify entanglement before committing; on
a first read Codex genuinely is the lighter half.

#### The render fix is orthogonal to the base class

**Do not read "Quests stays standard" as "Quests keeps its current render path."**
Paint-into-container, delegated listeners, debounce, and no-re-render-on-keystroke
are **panel** concerns. They apply to `panel-quest.js` whichever shell it lands in,
and master-detail makes them *more* urgent, not less:

- Selecting a quest in the left pane must repaint the right pane **without
  rebuilding the list**. Today `render()` rebuilds `innerHTML` wholesale and re-binds
  17 clone-and-rebind sites — so every selection would rebuild both panes, lose
  scroll position in the list, and drop focus.
- The reverse also has to hold: editing an objective in the detail pane must update
  that one row in the list, not re-render everything.

So **H8, H9 and H10 are prerequisites for the master-detail work**, not alternatives
to it. If the two-pane layout is built on the current render path it will feel worse
than the single-column list does now.

#### Master-detail changes what "reveal this quest" means

Three call paths currently mean "scroll the list to this card and flash it":
`focusQuestInPanel(uuid, objectiveIndex)` from a canvas pin double-click, the
menubar notification `onClick` handlers, and `revealCampaignPanel('quest')` in
[`campaign-panels.js`](../scripts/campaign-panels.js).

Under master-detail they mean something different — *select it in the left pane and
load the right pane*, possibly scrolled to an objective. That is a contract change
across the pin manager, the notification trackers and the panel registry. Design it
with the layout rather than discovering it afterwards; the codex side has the
matching problem today, where `_focusEntry` returns false when an active tag filter
has rendered the target out and falls back to a notification saying so.

#### What this costs, and what it pays for

**Costs.** The Tool base *"deliberately omits the full editor header"* — the
illustrated CODEX banner in the current window goes away. That is a real design
decision, not an oversight to route around. Both panels' render paths need
restructuring into paint-plus-delegate, which is the bulk of the work and touches
`panel-codex.js` and `panel-quest.js` rather than the window files — and that cost
is owed for Quests too, see above.

**Pays for.** H5 comes almost free: `window-compendium-search.css` contains **zero
colour literals** and five `--blacksmith-tool-*` variables, and gets Light, Dark and
Glass with no theme-specific rules of its own. H8, H9 and H10 are absorbed rather
than fixed separately. The duplicate DOM-filtering path disappears, taking M1 with
it.

#### Do not lose these when porting

- `classes` must list `'blacksmith-window-tool'` **explicitly** —
  `mergeObject` replaces arrays, so omitting it strips the Tool shell styling.
- The `activeWindow`-assigned-before-`await` guard. Librarian's
  `CampaignBrowserWindow.openByKind` already does this correctly and for the same
  documented reason; keep it.
- Not GM-only. Compendium Search is explicit that the player case is the main one,
  and the codex is read by players too.
- A status line. "17 in 9 sources (103ms)" is a genuinely good affordance and
  Librarian has no equivalent.

**Editors are not affected.** `CodexWindow` (760×820) and `QuestWindow` are
five-zone forms; the standard base is correct and they already use it.
`DataExportWindow` is a plausible Tool candidate — transient, single-purpose, and
Blacksmith's own Send Toast window is the precedent for an ephemeral unregistered
Tool instance — but it is a small win and should not gate this.

**Related:** **A3**, which asks whether any of this belongs upstream at all. If
Blacksmith ever grows an entity-browser API, Compendium Search is what it would be
built from — so porting toward this shape moves Librarian *closer* to that API
rather than further from it, whichever way A3 lands.

### A7 — Migration path: macros vs Blacksmith's settings-adoption table

Librarian hands data over with two GM-run macros and a runbook. Blacksmith built a
general mechanism for exactly this during the tool adoption —
`scripts/manager-settings-adoption.js`, a table of
`{ fromModule, fromKey, toKey, scope }` run from `ready` — and the plan says
outright: **"It will be reused for Librarian."**

Its argument against the macro approach is worth weighing: a departing module can
only migrate if the user installs the one release carrying the migration *before*
removing it, and nothing guarantees that ordering. Blacksmith reading the old keys
is order-independent. It also handles the three scopes correctly, including the
trap that a `client`-scope value is per browser and no migration changes that.

Librarian has settings (`questJournal`, `codexJournal`, `questCategories`) and four
per-user flags (`pinnedQuests`, `activeObjectives`, `codexCollapsedCategories`,
`codexExpandedEntries`) in the same position.

The counterweight: **the codex macro does something adoption cannot** — it rewrites
the `type` of live documents and keeps a per-page revert backup. That is not a
settings migration and has to stay a macro.

**The decision is whether to split them:** document retyping stays a macro; settings
and flags move to Blacksmith's adoption table. That would shorten the runbook and
remove one class of "the GM forgot to run it" failure. Not urgent — the current run
is already in flight and should finish on the mechanism it started with.

---

## Backlog — quest enhancements

Carried from Squire. Not scheduled, not sized. Most are cheaper after **A1**.

- Quest relationships (prerequisites, follow-ups)
- Timeline view (chronological quest events)
- Quest templates (pre-built structures)
- Automated rewards (auto-grant XP/items on completion) — via `api.inventory.grantItems`
- Quest chains (automatic progression through sequences)
- Player notes on quests — likely `api.notes` rather than anything new here
- Quest sharing between GMs or worlds
- Advanced filtering (participants, location, timeframe)
- Quest analytics (completion rates, average time)

## Backlog — codex enhancements

- **Suggested discoveries** — designed in
  [`plan-codex-datamodel.md`](plans/plan-codex-datamodel.md) Phase 5, not built.
  Auto-discovery matches an owned item to a codex entry by exact name, so finding
  "Map of Phlan" reveals **Map of Phlan** but never **Phlan**. Rather than loosen
  the match — discovery writes to the world, and a false positive spoils something
  permanently — surface *candidates* for GM review. See the plan for why substring
  auto-unlock is hazardous (`Lore`, `The Ride`, `Old Town`).
- Clicking a tag on a codex item filters the codex by that tag. **Do this as part of
  H2**, not before.
- A "new" flag on added items that clears at the next client refresh.
- Dragging a token onto manual-add pulls the bio into the description.

---

## Known caveat worth not rediscovering

Compendium resolution needs the GM's Blacksmith Compendium Mapping to include the
**world** for the type. PCs and NPCs live in the world, so an Actor mapping with
world search off resolves nothing and looks like a Librarian bug. Nothing in
Librarian can detect this.
