# Codex and Quest field mappings, for Blacksmith's importer declarations

**Status: raw input for Blacksmith, not a Librarian plan.** Sent in response to their
August 2026 note replacing the `extendsKind` / `onImportEntry` callback contract with a
declaration model. Delete when the declarations exist upstream and the import work
lands; this exists so the mapping is written down once rather than re-derived.

Format is friendly field → target path, since that is what a declared field holds.
"Required" is what our importer actually enforces today, not what we wish it enforced.

---

## Kind identity

| | Codex | Quest |
|---|---|---|
| Host kind | `journal` | `journal` |
| Profile | `codex` | `quest` |
| documentName | `JournalEntryPage` | `JournalEntryPage` |
| Document type | `coffee-pub-librarian.codex` (declared subtype, `CodexPageModel`) | `text` (**no data model — see A1**) |
| Destination | pages of the journal in world setting `codexJournal` | pages of the journal in world setting `questJournal` |
| Schema version | 1 | 0 — not yet a schema |

**The asymmetry is the important part.** Codex is a real declared subtype with a
`TypeDataModel`; quests are still plain `text` pages whose fields are regex'd out of
generated HTML (TODO **A1**). The quest column below is therefore *the mapping we want*,
not a mapping that exists — its target paths are proposals. If declarations land before
A1, the quest declaration is what A1 should build against rather than inventing a third
shape.

---

## Discriminator (declared, not coded)

| Profile | Claims an entry when |
|---|---|
| `quest` | `tasks` is an array, **or** `status` present, **or** `reward` present |
| `codex` | `tasks` is **not** an array, **and** any of `summary`, `related`, `expandedDetails` present |

**`description` is not a discriminator.** It is the quest's body field *and* the legacy
codex name for `summary`; keying on it gets the two backwards. Anything matching neither
rule is an orphan by design — see `testing/fixture-import-orphan.json`.

---

## Codex — `coffee-pub-librarian.codex`

Model: [`scripts/data/codex-page-model.js`](../../scripts/data/codex-page-model.js).

| Friendly field | Target path | Type | Req | Allowed / notes |
|---|---|---|---|---|
| `name` | `name` (document) | string | **yes** | The only field our importer rejects an entry for lacking. |
| `summary` | `system.summary` | string | no | Card text. **`acceptsKeys: ['description']`** — a *key* alias, resolved after discrimination. See note 4. |
| `category` | `system.category` | string | no | Free text, no fixed vocabulary. Empty groups under "No Category". |
| — | `system.categoryIcon` | string | no | FA class. **Never in the payload**; set in the editor, derived otherwise. Declare as non-authorable. |
| `plotHook` | `system.plotHook` | string | no | GM-only at render. |
| `location` | `system.location` | string | no | `"A > B > C"` convention. Segments resolve to other codex entries at render. |
| `links[]` | `system.links[]` | array of `{name, type, uuid?, label?}` | no | `type` ∈ `actor`, `item`, `journal`. See Computed. |
| `related[]` | `system.related[]` | array of string | no | **Names, not UUIDs**, deliberately — an unknown name links itself once that entry exists. |
| `tags[]` | `system.tags[]` | array of string | no | **Moves to the shared `tags` fragment.** See Tags below. |
| `img` | `system.img` | string | no | Path or URL. Lenient `StringField`, not `FilePathField`, so external URLs can't fail validation. |
| `expandedDetails` | `text.content` | HTML string | no | Native page text, ProseMirror-edited. Absent/null preserves, present (even `""`) replaces. |
| — | `system.discoveredBy[]` | array of string | no | Written by auto-discovery. **Never in the payload**; must survive re-import untouched. |
| `uuid` | flag `coffee-pub-librarian.codexUuid` | string | no | Dedup key on re-import. Ours, not Foundry's. |

**Ownership on create:** `{ default: NONE }`. Codex entries start hidden and are revealed
deliberately. A declaration that defaults to world-visible would spoil a campaign.

## Quest — proposed

Vocabulary from [`scripts/utility-quest-parser.js`](../../scripts/utility-quest-parser.js).

| Friendly field | Proposed target | Type | Req | Allowed / notes |
|---|---|---|---|---|
| `name` | `name` (document) | string | **yes** | Empty name is skipped outright (`if (!quest.name) continue;`). |
| `category` | `system.category` | string | no | **`Main Quest` \| `Side Quest`** — anything else normalizes to `Side Quest`. |
| `description` | `system.description` | string | no | Body text. Here it is the real field, not a `summary` alias. |
| `plotHook` | `system.plotHook` | string | no | |
| `location` | `system.location` | string | no | Same `A > B > C` convention as codex. |
| `status` | `system.status` | string | no | **`Available` \| `Active` \| `Succeeded` \| `Failed`**. `Not Started`, `In Progress`, `Complete`, `completed`, `succeeded` are **value** aliases (`aliases`, not `acceptsKeys`). **`Complete` is still live in production data** — do not drop it. |
| `tasks[].text` | `system.tasks[].text` | string | **yes** per task | **Not opaque** — currently carries `\|\|GM hint\|\|` and `((Treasure))` markup inline. A1 deletes that encoding; a declaration must not preserve it. |
| `tasks[].state` | `system.tasks[].state` | string | no | **`active` \| `completed` \| `failed` \| `hidden`**. Default `active`. |
| `reward.xp` | `system.reward.xp` | number | no | |
| `reward.treasure[]` | `system.reward.treasure[]` | array of `{name, uuid?}` | no | Resolves by name like codex links; unresolved falls back to plain text. |
| `timeframe.duration` | `system.timeframe.duration` | string | no | Free text — `"3 days"` or `"Before Bob dies"`. |
| `tags[]` | shared `tags` fragment | array of string | no | See Tags. |
| `visible` | `ownership.default` | boolean | no | `false` → `NONE`, `true` → `OBSERVER`. A **projection, not a stored field**. |
| `img` | `system.img` | string | no | |

---

## Genuinely computed, not mapped

These are the transform-hook cases. Everything not listed here is a plain mapping.

1. **Codex link resolution.** `links[]` arrives as `{name, type}` and needs
   `api.compendiums` resolution to gain `uuid`. Async, per entry, and the dominant cost
   at scale — 342 entries is our live world. **Unresolved must be retained, not dropped**:
   `{name, type}` with no uuid renders as plain text and is retried later by Auto-Link.
   This is the case for a batch-level cache seeded before the run.
2. **Codex link merge.** Links already on a page that the payload does not produce were
   added by hand and are unrecoverable from JSON, so re-import must union rather than
   replace. Identity is **name-first, uuid as fallback** — keying on uuid gives one link
   two identities either side of resolution and emits it twice. Foundry replaces arrays
   wholesale, so this cannot be left to a merge-update.
3. **Legacy page replacement.** A name match landing on an untyped `text` page cannot
   receive `system` data. We delete and recreate as the subtype, **preserving ownership
   and sort**. Re-import is our only conversion path. Whether a declaration can express
   "replace, preserving these paths" is an open question for Blacksmith.
4. **`summary` ← `description` is a KEY alias, not a value alias, and not a transform.**
   Blacksmith's model separates the two: `aliases` renames a value, `acceptsKeys` names
   other keys a field may arrive under. This is the second. **It must resolve after
   discrimination** — applied before, it would rewrite every legacy codex entry's
   `description` and hand it to the quest profile, which is the `description` trap
   wearing a different hat.
5. **Quest task encoding.** GM hints are `||text||` and treasure unlocks are
   `((Treasure Name))`, inline inside task text. This is markup-in-a-string that A1
   should delete; noted so nobody declares `tasks[].text` as opaque and preserves it
   forever.
6. **Alphabetical page re-sort after import.** Whole-journal, not per-entry — batch
   post-processing.
7. **Scene pins.** Cross-entry, post-create, keyed by scene, referencing quests that must
   all exist first. See **C4** — our export of these is currently broken, so treat the
   fixture's shape as reconstructed.

## Tags

Blacksmith is right that this is already a live inconsistency rather than a future one.
`system.tags` is a real `ArrayField` on `CodexPageModel` and the export emits tags inline
per entry, which is exactly what `api-tags.md` forbids. Contexts are already registered
upstream: `coffee-pub-librarian.codex`, `.quest`, `.objective`.

Under declarations `tags` becomes a named fragment applied via `TagsAPI.setTags()` after
construction, and `system.tags` goes away. That makes TODO **H2** a prerequisite of the
import work rather than a parallel cleanup.

## Corrections to what we sent earlier

- `exportVersion` is **`"1.1"` (string)**, per
  [`panel-quest.js:1075`](../../scripts/panel-quest.js#L1075). Earlier prose said `2`;
  the fixture was right and the prose was wrong.
- The fixture pins' `questIndex` and `questCategory` were **inferred from the Pins API
  `config` object, not observed** in the legacy flag. Nothing has written that flag since
  the Pins API migration (**C4**), so its true historical shape is unknowable. Stable
  core remains `questUuid`, `x`, `y`, `objectiveIndex`.

---

## Notes against Blacksmith's declaration model (as of steps 0–3)

- **Defaults are in authored shape.** `links: []`, `related: []`, `tags: []` and
  `discoveredBy: []` are all already authored shape, so they are safe under the
  rule that a `default` must match its field's declared type rather than the
  post-transform shape. Nothing here currently declares a default that a transform
  would touch — if one is added, check it against that rule.
- **Link resolution belongs at validate, not construct.** Since validation now runs
  the conversion and discards the result, an unresolvable link surfaces before any
  document exists. That is the behaviour we want, and it moves where the GM is told
  that Auto-Link exists: the post-import prompt reporting the unresolved count should
  become a validate-time report.
- **Structured errors are worth declaring properly.** Blacksmith's envelope carries
  `code`, `path` and `details`, which no kind has ever supplied — so every failure has
  surfaced as a blanket `VALIDATE_FAILED` with a blank path. A declared codex profile
  should name the failing field, which is most of the value for a GM importing 342
  entries.
- **Export is in scope under this model, and the completeness guard must survive.**
  See the H6 note in `../TODO.md`. The guard counts what it gathered against the
  `CODEX_PAGE_TYPE` pages actually in the journal and refuses a partial; a derived
  export that drops it is a regression. `testing/macro-invalid-page-probe.js` measures
  whether `journal.pages.invalidDocumentIds` can serve as the independent source, or
  whether `_source.length` vs `pages.size` has to.
