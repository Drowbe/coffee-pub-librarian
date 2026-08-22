# TODO

Open work for Coffee Pub Librarian, ordered by severity.

## How this file works

- **One item, one ID.** IDs are stable and are never reused — reference them in
  commits and PRs.
- **Nothing is finished until the docs are.** When an item lands, update the
  affected `documents/architecture/*.md`, the relevant Blacksmith API notes, and
  `CHANGELOG.md` in the same commit. If it isn't logged, it isn't done.
- **The tables track; the body explains.** When an item closes, its row moves to
  [Closed](#closed) with a pointer to where the work is recorded, and **its body
  section is deleted**. The context that section carried — the reasoning, the file
  references, the failure modes — has by then been written into the architecture
  doc and the changelog, so keeping a second copy here only lets the two drift.
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
| **H2** | High | Blacksmith API | Adopt `api.tags` + TagWidget; stop storing tags in record data | L |
| **H6** | High | Blacksmith API | Adopt `api.importer` — now shipped; drops ~600 duplicated lines | M |
| **M2** | Medium | Quests | Redundant post-render collapse restore with trim-matching | S |
| **M8** | Medium | Blacksmith API | Adopt `api.entityList` for participant pickers | M |
| **L1** | Low | v14 | Bare `FilePicker` and `saveDataToFile` globals | S |
| **L6** | Low | Debt | `utility-base-parser.js` / `utility-journal.js` duplicated with Squire | — |
| **L8** | Low | Quests | Objective pin tooltip: assets exist, nothing renders them | S |
| **A1** | Decision | Architecture | Quests are still HTML-parsed; codex is not | L |
| **A2** | Decision | Architecture | Journal routing bypasses Blacksmith's HookManager | S |
| **A3** | Decision | Architecture **[EXT]** | No Blacksmith API covers a panel-style entity browser | — |
| **A4** | Decision | Architecture | Read `api-notes.md` before touching codex pins again | S |
| **A5** | Decision | Suite | `coffee-pub-scribe` exists and is under-developed | — |
| **A6** | Decision | Windows | Codex done. Quests → standard base, master-detail — layout not yet designed | M |
| **A7** | Decision | Migration | Macros vs Blacksmith's settings-adoption table | M |

Deployment: [what is pending](#next--deploy-what-has-landed).
Not scheduled: [backlog](#backlog--quest-enhancements).

## Closed

Kept so the tracker answers "did we do X". Detail lives in `CHANGELOG.md` under
`[Unreleased]`; the body sections these rows had are deleted, not archived.

| ID | Was | Recorded as |
|---|---|---|
| **C1** | Window registry opener called a function that no longer existed | *The Blacksmith window registry could not open either browser* |
| **C2** | `prompt-codex.txt` never shipped; Copy Template copied its own error string | *Copy Template in the codex importer copied an error message* |
| **C3** | Squire named in three user-facing strings | *Squire named in three user-facing places* |
| **H1** | 17 Handlebars helpers, 5 shadowing Blacksmith's globals | *Handlebars helper registration reduced from seventeen helpers to two* |
| **H3** | Tag taxonomy addressed to Squire | Blacksmith shipped the three `coffee-pub-librarian.*` contexts; outcome folded into **H2** |
| **H4** | `getPartyActors()` reinvented the roster fallback | *The party roster comes from Blacksmith's Party API* |
| **L2** | Resolver header cited a doc that never existed | *`utility-resolver.js` no longer cites `documents/architecture-squire.md`* |
| **M4** | Six dead exports in `helpers.js` referencing four undefined identifiers | *Nine dead exports that could not have worked* |
| **M5** | Three dead exports in `utility-quest-parser.js` | *(same entry)* |
| **M10** | Three multi-instance windows sharing one saved position key | *Codex, quest and export windows fought over one saved position* |
| **M11** | Codex export could write a silent partial and report success | *The codex export refuses to write a partial file* |
| **A8** | Migration runbook and both macros, unrunnable since Squire 13.8.1 | *The Squire → Librarian migration tooling* |
| **H8** | 14 clone-and-rebind sites plus ~20 per-node bind loops, per render | *The codex panel's render path no longer rebuilds its listeners* |
| **H9** | `enrichHTML` awaited per link, per render, sequentially | *(same entry)* |
| **H10** | Whole dataset JSON-serialised and reparsed every render | *(same entry)* |
| **M1** | Tag filter wiped `codexCollapsedCategories` and never restored it | *Filtering the codex by a tag no longer permanently expands every category* |
| **H11** | Progress bar dead since Squire 13.6.0, plus ~10s of pauses staged for it | *Progress reporting works again, in the window footer* |
| **H7** | `related` had no edit or view UI on any of three surfaces | *`related` codex entries can finally be edited and read* |
| **M7** | Status doc comment described a vocabulary nothing writes | *(comment corrected; `Complete` confirmed live, hedges kept — rest is **A1**)* |
| **M3** | Quest pin visibility edits were a silent no-op, as codex had been | *Editing a quest pin's visibility now warns instead of silently doing nothing* |
| **M6** | Editor-created entries inherited journal ownership; import set NONE | *New codex entries start hidden, matching the import path* |
| **M9** | `squireSkipCodexRender` outlived its module | *Renamed to `librarianSkipCodexRender`* |
| **H5** | 45 theme-sensitive colour literals in `panel-codex.css`; Tool themes disabled | *The codex panel follows the Tool window's theme* |
| **L3** | Doc paths after the `documents/` reorganisation | *Verified — no stale flat paths remain* |
| **L4** | CHANGELOG 13.0.0 omitted link resolution, Auto-Link and `related` | *Recorded retroactively under 13.0.0* |
| **L5** | No link-resolution fixture | *`testing/fixture-link-resolution.json` + `testing/README.md`* |
| **L7** | Whether the menubar tools declare `supersedes` | *Decided: no. Reasoning recorded in `librarian.js`* |
| **L9** | Both architecture docs described Squire's tray and absent files | *Architecture docs corrected* |

Two changes in `[Unreleased]` were never tracked items and have no row: the
**Blacksmith minimum bump** to 13.19.0, which came out of the deployment
discussion, and the **move of the export/subtype hazard** into
`architecture/architecture-codex.md`.

---

## Next — deploy what has landed

Everything above is in the working tree and none of it is in production yet.

- [ ] Confirm production is on **Blacksmith 13.19.0** before pushing Librarian —
      the manifest minimum was raised to match what the code now uses.
- [ ] Smoke-test what changed. The codex browser is a different window class now,
      so most of this is codex:
      - **Both browsers open** from the menubar **and** via
        `blacksmith.openWindow('coffee-pub-librarian-codex-browser')` /
        `...-quest-browser` — the registry path nothing exercised before.
      - **Codex chrome**: the window title bar carries Add Entry and the `…` menu;
        there is no second "Codex" heading under it. The footer shows a count, and
        it changes to "N of M" while a search or tag filter is active.
      - **Codex interactions**, because event handling moved to delegation: card
        collapse, the per-entry `…` menu, the visibility eye, pin and unpin,
        Locate, Read more, a `related` link, an entry image, tag chips, search,
        clear search, category collapse.
      - **Both editors open** — Edit Entry on a codex entry, and a quest. This is
        the path the `isArray` regression would have broken, and the gap the last
        smoke list had.
      - **Long operations report progress in the footer**: Import, Auto-Link, and
        Auto-Discover. Auto-Discover should also feel markedly faster.
      - **Export Codex** reports `N of N`.
      - **Theme**: the tool context menu offers Light / Dark / Glass and the choice
        survives a reopen.

---

## High

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

**Unblocked.** Blacksmith added the taxonomy contexts and ruled on the key
question: **entities share the same context key the pins mirror uses** —
`coffee-pub-librarian.codex`, `.quest` and `.objective`, all three now in
`resources/tag-taxonomy.json`. One vocabulary per domain; a codex entry's tags and
its pin's tags are the same tags.

(Blacksmith also retired `coffee-pub-squire.note` in the same pass — Notes are
theirs now, under `coffee-pub-blacksmith.note`.)

Do this as one change across both features rather than twice; doing it during
**A1** would avoid migrating quest tags a second time.

**Expect to be TagWidget's first consumer.** `templates/partials/tag-widget.hbs`
and `widget-tags.css` are complete and the stylesheet does load, but no Blacksmith
template renders the partial — so nothing has exercised it in a world. Budget for
shaking out bugs, and note two documented traps up front: pass the context
**positionally** (`{{> blacksmith-tag-widget TagWidget}}`, not `tags=TagWidget`, or
you get a silent empty div), and `TagWidget.activate()` is the entire event layer —
without it the widget renders inert. Filter mode is documented as **not
implemented**; do not use it.

### H6 — Adopt `api.importer`

**Shipped and available.** Blacksmith published `ImporterAPI` on `module.api`
(`scripts/api-importer.js`, wired at `blacksmith.js:1168`):

| Method | Use |
|---|---|
| `importer.registerKind(kind)` | Register a JSON import kind |
| `importer.openWindow(kindId)` | Open the shared import window for it |
| `importer.getKind(kindId)` | Look one up |
| `importer.parsePayload(raw)` | Parse clipboard/file JSON to entries; throws on malformed input |
| `importer.attachButton(html, kindId)` | Insert an Import button into a directory header |

The descriptor takes **`onValidateEntry` / `onImportEntry` callbacks, so document
construction stays here.** Blacksmith never needs to know the codex data model —
which matters, because codex entries are our declared subtype and by Blacksmith's
own discriminator that schema does not belong in the hub.

**What we delete:** ~600 lines of near-duplicate dialog across
[`panel-codex.js:1563-1795`](../scripts/panel-codex.js#L1563-L1795) and
[`panel-quest.js:867-1105`](../scripts/panel-quest.js#L867-L1105) — file picking,
JSON parse and validation, the paste textarea, progress reporting, duplicate-name
warnings, prompt-template copying. Written twice and already diverging.

**What we keep,** inside `onImportEntry`: name→UUID resolution through
`api.compendiums`, `mergeCodexLinks`, retyping legacy text pages to our subtype, and
page sorting.

Three notes for whoever picks this up:

- **Set `showInSwitcher: false`** unless we actually want Codex and Quests appearing
  in the GM's item-directory importer dropdown. Default is `true`.
- **Read the API doc locally**, at
  `../coffee-pub-blacksmith/documentation/api/api-importer.md`. Blacksmith is
  holding it off the wiki (`wiki-sync.mjs:105`) even though it now documents a
  shipped API; they have a TODO filed for the ordering. Do not go looking for it
  online.
- **Export is not in scope** and nothing is planned. Our export stays ours; do not
  wait for a counterpart, and **keep its completeness guard** when the import half
  moves — it compares what it gathered against the journal's codex page count and
  refuses a partial, which is the failure mode Blacksmith flagged and has no answer
  for yet.

Once this lands, `showBlacksmithWait` in [`helpers.js`](../scripts/helpers.js) loses
its only two callers and should go with it, along with its stale header comment
about being "blocked on the public Blacksmith Importer API".

---

## Medium

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

### M8 — Adopt `api.entityList` for participant selection

`window-quest.js` builds party-participant pickers by hand. `api.entityList`
provides exactly this — single/multi select, `providers.fromActors()`, keyboard and
screen-reader semantics from native inputs, and a documented read contract.

Note the documented trap when adopting it: use `readFrom(root)` at submit time, not
`getSelection()`. A list seeded with a current selection whose `attach` silently
failed hands that seed back and is indistinguishable from a user choice.

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

### L6 — Duplicated parsers with Squire

`utility-base-parser.js` and `utility-journal.js` exist in both modules. Squire
still needs them for Notes. They converge or diverge for real when Notes moves to
Blacksmith — not before. No action now; recorded so the duplication is deliberate
rather than forgotten.

---

### L8 — The objective pin tooltip is designed but not implemented

Three assets exist and nothing renders them:

- [`templates/tooltip-pin-quests-objective.hbs`](../templates/tooltip-pin-quests-objective.hbs)
- `TEMPLATES.TOOLTIP_PIN_QUEST_OBJECTIVE` in [`const.js:67`](../scripts/const.js#L67)
- the `.quest-tooltip-container` block in [`quest-markers.css:14`](../styles/quest-markers.css#L14)

The code that drove them came across from Squire broken — it referenced four
identifiers `helpers.js` never imported and a `TEMPLATES.TOOLTIP_QUEST` key that
does not exist — and was removed rather than left looking functional. The assets
were kept deliberately: they are the design, and the template is well-formed.

So this is a real half-finished feature, not debris. Hovering an objective pin on
the canvas shows nothing today. Either implement it against
`manager-quest-pins.js` — which already has the `pins.on('hover')` surface it would
need — or delete all three assets. Do not leave it as-is indefinitely.

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

**A cancellation note, checked rather than assumed.** Blacksmith made HookManager
cancellation opt-in (`canCancel: true`, top level — not inside `options`), because a
callback whose natural return value happened to be falsy could veto a `pre*` hook
world-wide for every module. Librarian is unaffected either way: the only raw
`Hooks.on` registrations are the three **post** hooks in `manager-journal-routing.js`,
where a return value is meaningless, and everything else goes through `pins.on`, which
is Blacksmith's own event system rather than Foundry's. Every `return false` in the
pin managers is an ordinary helper (`panToPin`, `isPinCategory`, `_hasQuestEntryInDom`),
not a hook callback.

If this item is ever resolved by moving to HookManager, that stays true — but a future
`pre*` registration would need `canCancel` declared to have any effect.

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
  and re-synced (compare `updateCodexPinVisibility`, and the matching quest-side
  warning added alongside it);
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

**The codex half of this is done** — that was 2a. `CodexPanel` now delegates to the
container, caches enrichment, and no longer JSON round-trips its dataset; the four
items it closed (H8, H9, H10, M1) are in [Closed](#closed). Search was already live
DOM filtering rather than a re-render, which is the same choice Compendium Search
makes and for the same reason.

**`panel-quest.js` still does the old thing**, and has 17 clone-and-rebind sites and
the same JSON round-trip. It is not filed as its own item because **A1** and the
master-detail layout rewrite that path anyway — but if quests get their two-pane
view before A1 lands, the delegation work has to come with it. A left-pane
selection that rebuilds and re-binds the whole list will feel worse than the
single-column list does now.

What is still owed on the codex side is the part that only makes sense with the
Tool shell: search and filters moving into `toolBarLeft`, and one filtering
implementation instead of the current two (render-time filtering for tags, live DOM
filtering for search). That is 2b, below.

#### Where this stands

**The codex half is complete.** It is a Tool window on
`BlacksmithToolWindowBaseV2`, with search and tag filters in `toolBarLeft`, results
alone in the body, an entry count in the footer, Add Entry and the options menu as
header actions, debounced search and a cached match haystack. That is the Compendium
Search shape, which was the original ask.

Still owed on the codex side: **H5**, which is what lets the Light and Glass themes
come back on.

**The quest half is a decision, not a task.** Quests stay on the standard base and
grow a list-plus-detail layout — but that layout has not been designed, and it is
gated on **A1**, because a detail pane over HTML-parsed quests would be built twice.

An earlier draft of this item argued both browsers should differ only in
`toolTheme` / `toolTitlebar` defaults. That held only while quests were a
single-column list; it does not survive a detail pane. The two windows are:

| | Codex | Quests (planned) |
|---|---|---|
| Layout | Single column, search-first | Two panes, list + detail |
| Width | Palette — Compendium Search is 420, this is 480 | App — needs ~900–1200 |
| Canvas visible at the same time? | Yes, that's the point | No, it fills the screen |
| Job | Look something up mid-session | Work through a quest |
| Chrome | Tool toolbar + footer | Five zones, incl. action bar |

The in-suite precedents for the quest side are the **Artificer Crafting Station**
(Recipes │ Components │ Bench │ Details, with a REFRESH / CLEAR / CRAFT action bar)
and the **Messages** window (conversation list left, thread right).

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
