# TODO

Open work for Coffee Pub Librarian, ordered by severity.

## How this file works

- **One item, one ID.** IDs are stable and are never reused — reference them in
  commits and PRs.
- **Nothing is finished until the docs are.** When an item lands, update the
  affected `documentation/architecture/*.md`, the relevant Blacksmith API notes, and
  `CHANGELOG.md` in the same commit. If it isn't logged, it isn't done.
- **The tables track; the body explains.** When an item closes, its row moves to
  [Closed](#closed) with a pointer to where the work is recorded, and **its body
  section is deleted**. The context that section carried — the reasoning, the file
  references, the failure modes — has by then been written into the architecture
  doc and the changelog, so keeping a second copy here only lets the two drift.
- **Implemented plans are deleted.** A plan in `documentation/plans/` lives only until
  every phase has shipped and been recorded elsewhere.
- **Severity is about the user, not the effort.** Critical means broken in shipped
  code. Size (S/M/L) is a separate column.

## Owed to Blacksmith

Things they need to hear, held here rather than in a conversation so they survive one.

**This is a staging area, and it is only legitimate while it empties.** Cross-module work
belongs in the hub's `TODO-GLOBAL.md`; a satellite cannot write that file, so an item waits
here until the handoff lands and is deleted the moment it does. A section that stops
emptying has become a second backlog, which is the thing the rule guards against.

**Re-verify every `file.js:120` reference at the moment of handover**, not when it was
written. A line number rots without anyone editing it, and the dangerous shape is a
citation that is still valid while the real defect has moved above it: someone fixes the
cited line, sees no change, and closes the item.

**Sent 2026-08-26:** the dev-world caveat on every measurement we had given them, the
registry-audit result, and the H12 reader-audit findings. Both threads are closed with
nothing owed back except the item below.

- **Production migration numbers, when H2 runs there.** They asked specifically, and it
  will be the first measurement either side has taken against real content. The open
  question the dev world could not answer is **whether the singleton pattern survives** —
  452 tags with 264 used once told us little, because an unknown share of it was our own
  test noise. Capture the vocabulary report before curating anything in production.
- **We are overriding three of their Light theme tokens** — see **M14**. Density, not a
  bug on their side, but they should know a consumer diverged and why.
- **That `getTagCounts` works**, once the codex tag cloud is built on it — it is
  unexercised on their side too.
- **Our lang file did not exist.** `TYPES.JournalEntryPage.coffee-pub-librarian.codex`
  was specified in the data-model plan and never built, so the "Add Page" type picker
  showed the raw key. Worth a line only because module-declared subtypes are something
  their declaration model will generate, and a missing `languages` entry is an easy
  thing for a generator to forget.
- **Quest import still has not been exercised end-to-end.** It could not run at all
  until **C5** was fixed, and has not been tried since the tag migration. The next
  import is the first real exercise of that path in months — tell them how it goes,
  since they are sequencing our profile against it.

---

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
| **H2** | High | Blacksmith API | Tags on `api.tags` — **dev done**; production run + teardown remain | S |
| **H6** | High | Blacksmith API | Adopt `api.importer` — **blocked**: contract withdrawn, declaration model replacing it | L |
| **H12** | High | Quests | Audit the quest HTML reader before A1 converts anything | M |
| **M14** | Medium | Blacksmith API **[EXT]** | We override Blacksmith's Light theme tokens locally; raise it with them | S |
| **M15** | Medium | Docs | Eight user guides written from source, unwalked; 5 of 8 still have no capture | M |
| **M16** | Medium | Quests | Quest tag case-folding — **fixed, unverified in a world**; watch multi-word tags | S |
| **M13** | Medium | Codex | Players do not see an entry become visible until they reopen | M |
| **M8** | Medium | Blacksmith API | Adopt `api.entityList` for participant pickers | M |
| **L10** | Low | Blacksmith API **[EXT]** | Orphan-tag check: deliberately not built, blocked upstream | S |
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
| **C6** | Auto-add party duplicated participants on every import | *Every party member was re-added to a quest on every import* |
| **C7** | Writer emitted neither task state nor progress | *Quest import could not set task state or progress* |
| **H13** | Blank Description absorbed the fields after it | *A blank quest description made the reader absorb the fields that followed it* |
| **C5** | Quest import threw on every quest; setting read but never registered | *Quest import threw on every quest, and reported it as `Invalid JSON.`* |
| **M12** | Curate the codex tag vocabulary | *Ten merges and two deletions ran, 13/13 against pre-recorded counts; `dwarven` dropped on evidence* |
| **L6** | Parsers said to be duplicated with Squire | *Verified void — Squire has neither file; no duplication exists* |
| **L8** | Objective pin tooltip, filed as a half-built feature | *The orphaned objective-pin tooltip is removed, because pin hover already works* |
| **M2** | Quest category collapse, filed as a redundant pass | *Quest category collapse was dead code, not a redundant pass* |
| **L1** | Bare `FilePicker` and `saveDataToFile` globals | *Three v13 deprecation shims replaced before v15 removes them* |
| **C4** | Quest scene pins exported empty and imported into a dead flag | *Quest scene pins were exported empty and imported into nothing* |
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

**Shipped as 13.0.2.** The smoke list below is kept as the regression checklist for
the codex browser, not as pending release work; the items above it that remain open
are tracked in [At a glance](#at-a-glance).

### MUST DO on the next push to production: run the codex tag migration

**Nothing in the module will prompt for this.** The codex tag migration (**H2**) is
console-run — no macro, no menu item, no detect-and-prompt, and **no fallback read
from `system.tags`**. That was a deliberate trade: Librarian has exactly two worlds,
dev and production, both the maintainer's, so building discoverability for an
install base of zero was not worth the code. The cost of the trade is that this
checklist item is the only thing standing between a production push and a codex
that displays **no tags at all**, silently, on every entry.

In the production world, as GM, after the build is installed:

1. **F5** to reload — `migrate-codex-tags.js` is an ES module and will not exist in
   a running session.
2. **F12** → Console. Not a Script macro: Foundry's macro editor has mangled a
   pasted comment block into code before.
3. `await game.modules.get('coffee-pub-librarian').api.migrateCodexTags.dryRun()`
   — writes nothing. Check `codexPages` is the number you expect and the tag
   vocabulary looks real.
4. `await game.modules.get('coffee-pub-librarian').api.migrateCodexTags.migrate()`
   — safe to re-run, safe to interrupt. `failed` should be `0`.
5. Open the codex and confirm tags render.

**Then delete the migration.** Once dev and production are both migrated and
confirmed there is no third world, so `scripts/migrate-codex-tags.js` and its
`module.api.migrateCodexTags` wiring come out, along with this section. Migration
tooling that outlives its purpose is exactly how **A8** happened — a runbook and two
macros that silently stopped being runnable and were only found much later.

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

### H12 — Audit the quest reader before A1 converts anything

**Round-trip clean as of 2026-08-25.** Trip A reports 0 of 30 production quests
differing; Trip B reports 2 of 19 synthetic cases, both accepted. The harness is
`scripts/audit-quest-reader.js`, wired at `api.auditQuestReader.run()`, and it writes
nothing. **Re-run it before A1 converts anything**, and again after — it is the only
check that the conversion preserved what the pages actually held.

Eight defects came out of it: **C5**, **C6**, **C7**, **H13**, plus a re-import that
could never change status, a merge path that ignored imported task state, participant
duplicates that survived forever, and a participant parser whose first version had the
same bug it was written to fix. **One of the eight was found by reading.**

The two accepted Trip B results, recorded so nobody re-files them:

- `<em>` / `<b>` in a description strip to plain text on round trip. Data loss, not
  corruption, and A1 removes the encoding.
- A description containing `<strong>Status:</strong>` reads back as the plain text
  `The Status: is a lie` rather than forging a Status field. That one is arguably a
  *good* result — a hostile description cannot inject a field.

**The conversion constraint this item exists to protect** still stands, and is the
thing to carry into A1: read with the parser and write to the schema **directly**. If
conversion round-trips through `_generateJournalContentFromImport` at any point it will
apply that writer's behaviour to every quest in the world, permanently. The writer is
correct today; it was not two days ago, and the pages would have carried the difference
forever.

#### Original scope

**Prerequisite for A1, and it did not exist before Blacksmith's August 2026 rule:**

> A conversion inherits every defect of the reader that feeds it. Converting untyped
> pages to a declared subtype means reading them with the existing reader and writing
> the result into the new schema. Any bug in that reader stops being a bug and becomes
> **data** at the moment of conversion — permanently, because the source it was derived
> from is gone and no later reader fix can reach it.

So a reader defect must be fixed **before conversion**, not merely before the profile is
declared. Blacksmith found this sequencing Artificer's recipe migration, where a
blank-versus-absent bug would have written a wrong apparatus into every converted recipe.

**Our exposure is larger than theirs and they said so.** Artificer's reader matches bolded
labels. [`utility-quest-parser.js`](../scripts/utility-quest-parser.js) is 425 lines of
regex and `DOMParser` over HTML the module generated itself, inferring status, category,
task state, GM hints, treasure and participants. More inference means more surface to
inherit from.

**The one we already know about.** The quest import writes the literal `Not Started`
([`panel-quest.js`](../scripts/panel-quest.js), `_generateJournalContentFromImport`), while
`normalizeQuestStatus` maps that string to `Available`. So a value we write is one our own
reader immediately renames. Harmless while both live in markup we are about to delete —
and *not* harmless at conversion, because the reader carrying the disagreement is the one
feeding it. Fix before conversion.

**The point of the audit is that it is probably not alone.** Do not treat the known
defect as the finding. Areas worth exercising rather than reading, per everything this
tracker has learned the hard way:

- **Blank versus absent**, throughout. Testing a parsed value cannot tell you whether the
  thing was there; presence has to be tracked separately from content at the point of
  reading, or the two collapse and one silently takes the other's behaviour. Our
  `expandedDetails` rule (absent preserves, present-and-empty replaces) is the earliest
  known instance across the suite — Blacksmith's `absentMeans` exists because of it, and
  Artificer's apparatus label is the third. Assume the quest reader has its own.
- **The `||GM hint||` and `((Treasure))` encodings** inside task text, which A1 deletes.
  Check what the reader does with malformed or nested markers before that behaviour
  becomes a schema field.
- **Status and category normalization**, both directions. Round-trip real production
  pages through write-then-read and diff.
- **Objective state**, encoded as `<s>` / `<code>` / `<em>` and *edited* by rewriting the
  HTML.

**Method matters here.** Reading the parser is not the audit. Round-trip production data
through it and diff. Every defect this suite has found in a year was readable in source the
whole time and surfaced only when something exercised it.

---

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

**Blocked, and the contract we documented here has been withdrawn.** Blacksmith
retracted the callback model in August 2026 — not adjusted, replaced. Do not build
against `api-importer.md`, and do not build against the `extendsKind` /
`onValidateEntry` / `onImportEntry` design that this section previously described.

**What replaced it.** A kind registers a **declaration** — its shape, as data — and
Blacksmith derives the JSON template, authoring guide, prompt, validation,
normalization, **document construction**, the result envelope and the export from it.
Their reasoning: five callbacks is five places for every module to differ, which
institutionalizes the divergence the importer was built to end.

**Blacksmith constructs our codex page.** This reverses the guarantee the earlier plan
rested on, and the reversal is correct on a point of fact we had wrong: Foundry
namespaces subtype **declaration**, not **creation**. We declare
`coffee-pub-librarian.codex` in our manifest; anyone calling
`create({ type: 'coffee-pub-librarian.codex', system: {…} })` gets a document our
registered `TypeDataModel` validates. "Cannot declare" had been silently upgraded to
"cannot construct" — by us as much as by them. Their item importer is the precedent:
Artificer's items are built by Blacksmith today.

**Verified 2026-08-23: creation works.** `testing/macro-subtype-creation-probe.js`
creates a `coffee-pub-librarian.codex` page and gets `CodexPageModel` bound with
`system` intact — the failure mode worth fearing was a page created as a generic type
with the schema silently dropped, and it did not happen.

**But the probe proves less than the question implied.** Foundry does not attribute
document creation to a calling module: there is no caller identity in `create()`, and
the only namespaced thing is the manifest `documentTypes` declaration. A macro cannot
simulate "Blacksmith calling it" any differently from us calling it — our own importer
has exercised that exact path since 13.0.0. So "can a non-declaring module construct
one" was never really a question Foundry can answer *no* to.

The real constraint is unchanged and unrelated to callers: **with Librarian disabled,
Foundry refuses these pages at load.** That is a load problem, not an API-design
problem, and it is the same hazard behind the export completeness guard — which is why
the export bullet below matters more than this probe did.

**What we still own:** the discriminator (declared as data), our friendly-field →
`system` path mapping, a narrow transform hook for genuinely computed values, a
post-create hook for cross-entry work (pins), and our own prompt wording — which
Blacksmith will no longer host for anyone.

**Their build is underway, and it is not a document any more.** Steps 0–3 of eleven
are verified in a running world: the declaration engine is real code, and Blacksmith's
own Loot profile imports through it via the same public `registerDeclaration` we will
use. The Item importer routes by **declaration presence** — a declared profile takes
the derived path, an undeclared one falls back to the old parser, with no list of
migrated profiles to keep in step. That is the mechanism that will pick up our codex
profile: declare it, and it routes.

**Blocked specifically on their Journal kind**, which is the one we extend and the
last of four to move. It is the hardest because it is the rendered form — fields feed
a Handlebars template rather than landing on document paths — and it needs the
passthrough seam their Item kind already has before it can construct a foreign subtype
at all. Our codex profile cannot be declared until Journal moves.

**Three model changes their build produced that bear directly on our mappings:**

- **Key aliases and value aliases are different mechanisms.** `aliases` renames a
  *value* (our quest `Complete` → `Succeeded`); `acceptsKeys` names other *keys* a
  field may arrive under. **Our `summary` ← `description` fallback is a key alias, not
  a value one** — and key aliases must resolve **after** discrimination, because
  applied early one would turn every legacy codex entry into a quest. That is the
  `description` trap in a new place; do not let it be re-introduced as an alias.
- **`default` and `example` are in *authored* shape, never in the shape a transform
  produces.** Blacksmith wrote a converted value as a default and it got converted
  twice. Our `links: []`, `related: []`, `tags: []` defaults are fine because they are
  already authored shape — but anything gaining a transform needs its default checked
  against this rule.
- **Validation now runs the conversion and discards it.** Transforms used to run only
  at construction, so an unparseable value passed Validate and failed at Import. **Our
  link resolution sits here**, which means an unresolvable link surfaces at Validate
  rather than after documents exist. Good for us, and it changes where the
  Auto-Link-retry story gets explained to the GM.

Also worth having: their structured error envelope was always empty — `issueFromError`
read `code`, `path` and `details` off thrown errors that no kind ever supplied, so
every failure surfaced as a blanket `VALIDATE_FAILED` with a blank path. Declared
profiles supply them, so **a codex entry that fails will name the field.**

**Prerequisite: H2.** `tags` becomes a shared Blacksmith fragment applied through
`TagsAPI.setTags()`, so `system.tags` goes away. That makes H2 a dependency of this
item rather than a parallel cleanup.

**Field mappings are written down** in
[`documentation/plans/plan-declaration-field-mappings.md`](plans/plan-declaration-field-mappings.md) —
codex and quest, friendly field → target path, plus the seven genuinely-computed cases.
That file is raw input for Blacksmith; delete it once their declarations exist.

**Timeline: longer than previously recorded, and there is nothing for us to do.**
No branch. Blacksmith is rebuilding its own four kinds on the public declaration path
first, enforced by a `tools/` check, and the change intentionally breaks every
consumer. Step 4 is in progress (Loot live, Weapon declared second on purpose — the
profile that tests the model rather than repeats it), then five more Item profiles,
Roll Table, Actor, and **Journal last**, which is the one we extend. **They will
contact us at Journal.** Do not schedule this against a near date and do not poll them.

**One thing to have ready for that conversation:** their closed rule vocabulary held
for five of six Weapon constraints, and the sixth needed a Blacksmith-owned *named
rule* (ranged-ness derived from subtype via lookup — a rule about a value the author
never wrote). Our quest constraints use the same vocabulary. **If one of ours needs a
named rule that is a normal outcome, not a failure** — we supply the sentence and they
add it. Three constructs their survey missed are also now in the model and may apply to
us: authored fields that land nowhere (two authored fields feeding one document path),
profile-level derivations that run after fields resolve, and genuinely nullable fields.

**Still true from the earlier design**, and carried forward because it survives the
rewrite: `description` is not a discriminator (it is the quest's body field *and* the
legacy codex name for `summary`); quest payloads are envelopes
(`{ quests, scenePins, exportVersion }`) rather than bare arrays; and the fixtures in
`testing/` — `fixture-import-orphan.json` and `fixture-import-quest-envelope.json` —
remain valid under declarations.

**`scripts/import-codex.js` is not wasted.** The wrapper shape is now wrong, but the
conversion logic inside it is the input to the declaration: every friendly-field →
`system`-path mapping it makes becomes a declared field. Expect to delete the
orchestration — the create calls, the batch loop, the result reporting, the progress
handling — and keep the knowledge.

Two notes for whoever picks this up:

- **The local docs are ahead of the API doc, and the API doc is behind the code.**
  `api-importer.md` describes the withdrawn callback surface. The design lives in
  `../coffee-pub-blacksmith/documentation/plans/plan-importer-api.md` and
  `.../architecture/architecture-importer.md` — read those, and note the plan already
  defines **Profile** as a schema specialization within a kind (`journal.area`), which
  is what our codex and quest profiles are. None of it is on the wiki; do not go
  looking online.
- **Export is now in scope, and the completeness guard becomes engine behaviour.**
  Raised with Blacksmith and **settled**: a declaration *can* express a completeness
  assertion but should not have to, because the guarantee belongs in the engine where
  it also covers modules that never thought to ask. Three layers, none opt-in:
  **(1) owner precondition** — export refuses when the profile's owning module is
  absent or disabled, naming it; **(2) type-registration precondition** — the declared
  type must have a registered data model; **(3) invalid-document refusal** — export
  refuses when the collection holds documents Foundry could not construct, names them,
  and reports counts on success.

  **Layer 1 is the one that matters, and we could not have built it.** Our guard counts
  what it gathered against the `CODEX_PAGE_TYPE` pages in the journal — but with
  Librarian disabled those pages are not unreadable, they are **absent**, so no count
  taken from the loaded collection can detect the case at all.
  `architecture/architecture-codex.md` already concedes this ("Librarian's own export
  cannot hit that case"). Only knowing the profile's owner is missing detects it.
  Adopting the declaration model therefore **closes a hazard we had written off as
  undetectable**, rather than merely preserving what we have.

  Layer 3 is ours: `testing/macro-invalid-page-probe.js` established that
  `journal.pages.invalidDocumentIds` is populated on **embedded** collections, which
  Blacksmith could not confirm from their side. They adopted the recommendation to use
  both sources — `invalidDocumentIds` names *which* pages are missing, the
  `_source.length` vs collection-size comparison needs no knowledge of *why* a document
  failed — because the two fail differently.

Once this lands, `showBlacksmithWait` in [`helpers.js`](../scripts/helpers.js) loses
its only two callers and should go with it, along with its stale header comment
about being "blocked on the public Blacksmith Importer API".

---

## Medium


### M14 — [EXT] We override Blacksmith's Light theme tokens

`styles/window-codex-browser.css` ends with a block that raises three
`--blacksmith-tool-*` values, scoped to the codex browser and to the Light theme only:

| Token | Blacksmith ships | We use |
|---|---|---|
| `text-muted` | `rgba(47, 36, 26, 0.55)` | `0.72` |
| `border` | `rgba(233, 198, 142, 0.85)` | `rgba(112, 85, 49, 0.38)` |
| `divider` | `rgba(112, 85, 49, 0.34)` | `0.28` |

**Why.** Their Light palette is tuned for **sparse** tool windows. Compendium Search is a
list of names; a codex card is a label, a summary, a plot hook, a links block, related
names, four location rows and a tag strip. 55% brown on parchment is fine for one
subtitle and illegible for six stacked labels, and a pale tan border on a pale ground
leaves card edges invisible with nothing for the eye to group by.

**Do not read this as a Blacksmith bug.** Their values are defensible for what their own
windows do; ours is a density they did not design for. That is exactly the kind of thing
worth telling them rather than silently diverging.

**The question for them:** does a dense-content consumer want a different Light contrast
ramp — a documented "content" tier alongside the existing tokens — or should these values
simply be stronger for everyone? We have no view on which; we have the use case.

Removing the block restores their palette exactly: the fallbacks in every consuming rule
are the values they ship. Dark and Glass are untouched and were never the problem.

**Related, and the more general point:** three passes over `panel-codex.css` colours
produced the rule now recorded at the top of that file — chrome versus meaning, and never
a brand colour at low alpha. The pastel appearance that prompted all this was translucent
brand colours over a light ground, which is a consumer mistake rather than a palette one.
Worth sending them alongside this, since it is the more useful half.

---

### M15 — The user guides are drafts until someone walks them

Eight guides were written during the documentation-standard adoption, from source rather
than from a running world. Under the suite standard that makes every one of them a draft:
*"a guide derived from reading source is a draft until somebody has walked it, and which
claims have not been walked is worth saying out loud."*

Labels were quoted from `scripts/settings.js` and from the `title=` attributes in the
templates rather than guessed, which is the best available without a world open. That fixes
the wording and fixes nothing else.

**What is specifically unverified:**

- **Ordering.** Source cannot say what order anything renders in. The quest status filters
  are described as Active, Available, then Complete and failed; the codex card is described
  as summary, plot hook, links, related, location, tags. Both are read off the template and
  neither has been looked at.
- **The objective click behaviour**, which is the highest-value claim in the quest guide and
  the least discoverable: left-click completes, middle-click hides, right-click fails for a
  GM, and a player's click sets their active objective. Taken from a `title` attribute in
  `templates/partials/quest-entry.hbs`. If it is wrong, it is wrong about the one thing a
  reader cannot work out for themselves.
- **Everything in the player guide.** Written entirely from ownership logic and template
  conditionals. Nobody has sat at a player client and confirmed what is absent.
- **The Squire migration paragraph** in the getting-started guide. It describes re-import as
  the conversion path for Squire-era codex pages, which is true of the code; whether it is
  true of a world that actually has such pages has not been tried since the migration
  tooling was deleted.
- **The claim that hovering a pin shows a name in the `Quest 3.02:` form.** Read from the
  pin construction in `manager-quest-pins.js`, not seen on a canvas.

**Three product captures now exist** and are placed: `librarian-product.webp` on the README,
`home.md` and the getting-started guide; `librarian-codex.webp` on the codex guide;
`librarian-quest.webp` on the quest guide. They are wide product shots -- a whole window, or
three windows at once -- not step captures, so they show a reader what the thing looks like
and settle nothing about any individual claim above.

**Five guides still carry no capture:** importing, canvas pins, player, GM, settings. The
player guide is the one that matters, because it is the only guide whose claims cannot be
checked from the GM's own screen.

The standard's point is that no screenshot beats a wrong one, and that screenshots are how
wrong claims surface: three other modules published guides written this way and every one
that later got captures found wrong labels. That has not happened here yet -- these three
were taken to show the product, not to walk the guides, so none of the unverified claims
listed above has been confirmed or falsified by them.

**How this closes:** walk each guide with a world open, fix what is wrong, add captures to
`documentation/assets/`, then delete this item. Walking the player guide needs a second
client logged in as a player, which is the part most likely to be skipped and the part
covering the readers least able to correct it themselves.

---

### M16 — Quest tags are never case-normalized

Found in a product screenshot, then confirmed in code. A live quest's page reads:

    Tags: melvaunt, bcod, investigation, Side, Exploration

Three lowercase, two capitalised, in one quest. That is not a rendering artefact -- it is
what is stored, and it stays that way through a round trip.

**The whole path preserves case.** The reader takes tags verbatim
([`utility-quest-parser.js:247`](../scripts/utility-quest-parser.js)) and its cleanup pass
only trims and de-duplicates
([`utility-quest-parser.js:370`](../scripts/utility-quest-parser.js)) -- `new Set` over
case-varying strings keeps both. The writer emits `quest.tags.join(', ')` back unchanged
([`panel-quest.js:3755`](../scripts/panel-quest.js) and
[`panel-quest.js:4020`](../scripts/panel-quest.js)), so a round trip does not heal it.

**Two visible consequences.** The tag cloud is built by adding raw tags to a `Set`
([`panel-quest.js:3428`](../scripts/panel-quest.js)), so `Side` and `side` appear as two
separate chips. Filtering is an exact string match --
`this.filters.tags.some(tag => entry.tags.includes(tag))`
([`panel-quest.js:2049`](../scripts/panel-quest.js)) -- so picking one chip hides every
quest that spelled the tag the other way. A GM filtering for `side` silently loses the
quests tagged `Side`, with nothing on screen to say a filter is dropping matches.

**The codex does not have this defect**, which is what makes it worth fixing rather than
accepting. Codex tags go through `normalizeTag` in
[`utility-tags.js:72`](../scripts/utility-tags.js) -- lowercased, whitespace hyphenated --
on the way into Blacksmith's store, and the H2 migration normalized all 347 production
entries. So the two panels in the same module disagree about what a tag is, and a reader
who learns the codex's behaviour will be wrong about quests.

**Fixed, not yet verified in a running world.** `normalizeTagList` was added to
[`utility-quest-parser.js`](../scripts/utility-quest-parser.js) and applied at three points:
the reader's cleanup pass, which every read of a quest page funnels through; and both journal
writers in [`panel-quest.js`](../scripts/panel-quest.js) -- one for quests already in memory
and one for imported quests, which arrive straight from JSON and never touch the reader, so
they had to be folded separately.

Because the reader normalizes, the tag cloud and the filter are consistent from the first
render: both are built from `entry.tags` after the fold, so no migration is needed to make
filtering correct. Stored pages heal on their next write.

**The consequence to watch is whitespace, not case.** `normalizeTag` is the codex's function
and it hyphenates as well as lowercasing, so a multi-word quest tag rewrites: `Main Story`
becomes `main-story` the next time that quest is saved. Half-matching the codex -- lowercase
only -- would have left the two panels still disagreeing, and quest tags have to reach the
hyphenated form anyway when they move to Blacksmith's store, so this is one conversion rather
than two. It is still a visible change to existing content and nobody has looked at how many
production quests carry a multi-word tag.

**To verify:** open the quest browser, expand the tag cloud, and confirm no pair of chips
differs only by case. Then pick a tag that was previously capitalised and check the filter
returns the quests that used the lowercase spelling as well. The quest whose page reads
`Side, Exploration` above is the specific one to look at.

**Fold the remainder into A1 if A1 happens first.** A conversion to a data model has to
decide the tag representation anyway.

### M13 — Players do not see an entry become visible until they reopen the codex

Observed live: a GM reveals a codex entry, and a player with the browser already open
sees nothing until they close and reopen it. The entry is readable — the permission is
there — the panel just never learns.

**Not the same mechanism as the tag-hook gap**, though the symptom class is identical.
Revealing an entry rewrites `ownership` on the page. On the GM's client that fires
`updateJournalEntryPage` and `manager-journal-routing.js` refreshes the panel. On the
player's client the page was previously invisible, so it was never in their rendered
list at all — and a document that has only just become visible is the case least likely
to arrive as an ordinary update hook.

Worth checking before assuming: whether Foundry delivers `updateJournalEntryPage` to a
client that gains permission, or whether permission changes surface differently there.
The answer decides whether this is a missing hook registration or a missing concept —
the panel currently has no notion of "a page appeared that you could not see before."

**This is the failure mode that does not get reported.** Players do not know an entry
was revealed, so they cannot notice they are not seeing it; the GM sees it fine on their
own screen. It was found because someone deliberately sat a player client next to a GM
one during the M12 sweep, which is the only reason it surfaced at all.

Related: the codex is read by players by design, and revealing entries is currently
silent — see the "no unlock notification" note in
`architecture/architecture-codex.md`. If that toast ever returns it would mask this bug
rather than fix it.

---

### M8 — Adopt `api.entityList` for participant selection

`window-quest.js` builds party-participant pickers by hand. `api.entityList`
provides exactly this — single/multi select, `providers.fromActors()`, keyboard and
screen-reader semantics from native inputs, and a documented read contract.

Note the documented trap when adopting it: use `readFrom(root)` at submit time, not
`getSelection()`. A list seeded with a current selection whose `attach` silently
failed hands that seed back and is indistinguishable from a user choice.

---

## Low

### L10 — [EXT] The orphan-tag check is deliberately not built

A check for tags in Blacksmith's registry that no longer belong to anything would be
useful — it is how the M12 curation sweep was verified — but a correct one cannot be
written against today's API, so **nothing was built rather than something that would rot.**

An orphan is a registry tag that is neither in use by another module's context nor a
declared taxonomy entry awaiting first use. Both exclusions are needed and neither is
reachable:

- `getRegistry()` is world-wide and undifferentiated, with no way to list context keys.
- `getChoices(contextKey)` needs a key you already know, so our own taxonomy can be
  excluded and nobody else's can.

Excluding other modules would mean hardcoding context keys we do not own, which passes
today and silently mis-flags the moment any module adds one.

The first attempt made exactly this mistake in a milder form: it filtered registry tags
against codex records only, and reported 46 orphans. Three were real. The rest were
other contexts doing their job (`components`, `essence`, `quest`, `npc`), one was a
declared pin-taxonomy entry with no uses yet (`sticky`), and three were real campaign
tags assigned in another context that got misread as debris.

Blacksmith has this recorded as **blocking on their side**, distinct from their
backlog — scoping a cloud to one context, counting usage per context, and telling an
unused tag from a foreign one are one missing capability seen three ways, and they
intend to answer all three from one shape. They will tell us when it lands.

**Do not build an interim version.** A hardcoded key list is the one that looks finished.

---

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

**Now coupled to Blacksmith, which this item did not previously record.** Their
importer declaration model (**H6**) has a profile declare its fields as data —
friendly name, type, required, allowed values, and **target path on the document**.
That is most of what a quest data model is, and Blacksmith's own advice is to wait:
building quests against declarations once beats building them twice, and a schema
designed now would be a third shape needing reconciliation against a declaration
shape that does not exist yet.

**Also gated on H12.** The quest reader must be audited and fixed before conversion,
not merely before declaration — a reader defect becomes permanent data the moment pages
are converted. That is new, and it sits between here and any migration.

**Recommendation: wait, and target the declaration.** The asymmetry decides it —
building now risks designing a schema then reconciling it; building later costs delay
only. Nothing has been built against a quest model yet, so there is no sunk cost.
Their Journal kind is the last of four to move and is explicitly the hardest (it is
the rendered form, where fields feed a Handlebars template rather than landing on
document paths), so this is not close and should not be scheduled against a near date.

**What is not blocked, and is A1's input either way:** the quest field inventory and
the codex/quest discriminator, both already written down in
[`plans/plan-declaration-field-mappings.md`](plans/plan-declaration-field-mappings.md). The
quest column there is a *proposal* — those target paths do not exist yet. When A1
lands it should implement that column rather than inventing its own.

Two details from the mapping work that A1 owes attention:

- **`visible` is a projection, not a stored field.** It maps onto
  `ownership.default` (`false` → NONE, `true` → OBSERVER), and the schema needs
  somewhere to express that rather than storing a boolean that then disagrees with
  ownership.
- **The `||GM hint||` and `((Treasure))` markup lives inside task text.** A1 deletes
  it. Do not let a schema declare `tasks[].text` as opaque and preserve that encoding
  forever.

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

**`panel-quest.js` still does the old thing**, and has 16 clone-and-rebind sites and
the same JSON round-trip ([`panel-quest.js:3545`](../scripts/panel-quest.js#L3545)).
(Counts verified 2026-08-25; an earlier draft said 17.) It is not filed as its own item because **A1** and the
master-detail layout rewrite that path anyway — but if quests get their two-pane
view before A1 lands, the delegation work has to come with it. A left-pane
selection that rebuilds and re-binds the whole list will feel worse than the
single-column list does now.

What is still owed on the codex side is the part that only makes sense with the
Tool shell: search and filters moving into `toolBarLeft`, and one filtering
implementation instead of the current two (render-time filtering for tags, live DOM
filtering for search). That is 2b, below.

#### Where this stands

**The codex half is complete and shipped in 13.0.2.** It is a Tool window on
`BlacksmithToolWindowBaseV2`, with search and tag filters in `toolBarLeft`, results
alone in the body, an entry count in the footer, Add Entry as a header action,
debounced search and a cached match haystack. That is the Compendium Search shape,
which was the original ask.

**Nothing is owed on the codex side.** An earlier draft said H5 was still outstanding;
H5 closed in 13.0.2 and is in [Closed](#closed). The panel draws from the
`--blacksmith-tool-*` family and all three themes work. Since then the window also
**defaults to Light** — matching the other Tool windows a GM keeps open beside the
canvas — and the codex options menu became a **submenu of the shell's controls menu**
rather than a second `…` opening a second context menu.

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
