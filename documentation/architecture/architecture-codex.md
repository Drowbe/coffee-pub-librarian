# Coffee Pub Librarian – Codex System Architecture

**Audience:** Someone changing the codex, and the rest of the suite.

How the codex is built and why: the declared `JournalEntryPage` subtype behind it, where
entry data lives, and the failure modes that shaped the current design.

## Overview

The Codex system is a journal-based world-building and reference system. It organizes characters, locations, items, events, and other entities with rich metadata, search, and filtering. Each entry is a journal page in a designated codex journal; the panel displays entries by category with tag-based filtering and supports import/export and auto-discovery from party inventories.

## Where it renders

The codex browser is a **Blacksmith Tool window** (`scripts/window-codex-browser.js`,
window id `coffee-pub-librarian-codex-browser`), not a tray tab. It hosts the
`CodexPanel` by supplying a container the panel renders into:

```html
<div class="librarian-panel-host" data-position="left">
    <div class="panel-container" data-panel="panel-codex"></div>
</div>
```

`librarian-panel-host` + `data-position="left"` is what `panel-codex.css` keys off.
Deliberately not `librarian-tray`, which carried the tray's fixed positioning and
slide-in transform and would fight a window frame.

**Why a Tool window rather than the standard editor base.** The codex is a
lookaside — something you keep open beside the canvas and search mid-session, which
is a palette. Blacksmith's own Compendium Search is the reference implementation.
Quests went the other way, staying on the standard base because they are heading for
a list-plus-detail layout that wants width and fills the screen. The two stopped being
the same shape once quests headed for a detail pane, which is why they no longer share
a base class.

The window owns its chrome: the title bar carries Add Entry and the codex options
menu as Tool header actions, and the footer carries an entry count and a status slot
the panel writes progress into. The panel renders no title row of its own.

**Theming.** The Tool shell supports Light / Dark / Glass, offered in its controls
menu and remembered per tool. Dark is the initial choice because it is what the codex
has always looked like. `panel-codex.css` draws its surfaces, text tones and dividers
from the `--blacksmith-tool-*` family so the panel follows whichever the user picks;
the brand accent and the state colours stay literal, because a theme may repaint a
surface but must not repaint meaning.

## Project Files

| File | Class/Purpose |
|------|---------------|
| `scripts/panel-codex.js` | `CodexPanel` – list rendering, filtering, and entry actions |
| `scripts/window-codex-browser.js` | `CodexBrowserWindow` – the Tool window that hosts the panel |
| `scripts/window-codex.js` | `CodexWindow` – the single-entry create/edit window |
| `scripts/data/codex-page-model.js` | `CodexPageModel` – the `TypeDataModel` behind the page subtype |
| `scripts/sheets/codex-page-sheet.js` | `CodexPageSheet` – the journal page's own view/edit sheet |
| `scripts/utility-codex-index.js` | Shared name→entry lookup: `normalizeName`, `buildCodexPageIndex`, `renderCodexRef` |
| `scripts/utility-resolver.js` | Name→UUID resolution through Blacksmith's compendium mapping |
| `scripts/manager-codex-pins.js` | Codex pins, via the Blacksmith Pins API |
| `scripts/utility-codex-parser.js` | `CodexParser` – **legacy**, see below |
| `scripts/utility-base-parser.js` | `BaseParser` – shared HTML field extraction, used only by the legacy parser |
| `templates/panel-codex.hbs` | Panel template |
| `templates/window-codex.hbs` | Create/edit window template |
| `templates/page-codex-fields-view.hbs` | Codex fields on the journal page, read view |
| `templates/page-codex-fields-edit.hbs` | Codex fields on the journal page, edit form |
| `styles/panel-codex.css` | Panel styles |
| `styles/window-codex-browser.css` | Tool-window shell overrides |
| `styles/window-codex.css` | Create/edit window styles |
| `prompts/prompt-codex.txt` | AI-assisted import prompt text |

## Core Design

### 1. Journal as system of record

Each codex entry is a page in a GM-designated journal. Native Foundry storage means
entries are ordinary documents: standard ownership and visibility, standard search,
no parallel database to keep in sync, and no bespoke thing for a GM to learn.

### 2. A declared page subtype, not parsed HTML

**This is the load-bearing decision and the one that makes Librarian a module rather
than a panel.** Codex entries are `coffee-pub-librarian.codex` — a
`JournalEntryPage` subtype declared in `module.json`, with `CodexPageModel` behind
it. Structured fields live in `page.system` with schema validation. Free-form lore
lives in the page's native `text.content` and is edited with ProseMirror through the
standard journal machinery.

Entries used to be HTML parsed back out of `<strong>` labels:

```html
<p><strong>Category:</strong> Characters</p>
<p><strong>Location:</strong> Phlan &gt; Thorne Island</p>
```

That is gone. `CodexParser` survives for exactly two jobs — pulling the first
illustration out of lore for a preview image, and reading a *legacy* untyped page so
the editor can show something. Nothing writes that format any more, and the panel
skips pages that are not the subtype, surfacing a one-time notice to the GM instead.

Two consequences worth carrying:

- **The subtype string has one definition**, `CODEX_PAGE_TYPE` in `const.js`. It must
  agree exactly with `module.json`'s `documentTypes` entry, or every page fails
  validation at world load — one console error per page.
- **Owning a subtype makes export a data-safety question.** With Librarian disabled,
  Foundry refuses these pages at load, so anything reading the journal reports
  success over a short list. See "Export completeness, and the subtype hazard".

### 3. Names, not uuids, for entry-to-entry links

`related` and each level of a `location` path reference other codex entries **by
name**. That is deliberate: a name for an entry that does not exist yet is kept
verbatim and links itself the moment that entry is created — no migration, no
rescan, no import ordering problem.

The cost is that every surface showing one has to resolve it, and there are three
(browser card, journal page view, editor preview). `utility-codex-index.js` exists so
there is one resolver and one piece of markup rather than three that drift.

Document links are the other thing entirely: `system.links` holds real UUIDs
resolved through Blacksmith's compendium mapping, and unresolved names are retained
so Auto-Link can retry them later.

---

## Architecture Components

### 1. CodexParser (`scripts/utility-codex-parser.js`)

Extends **`BaseParser`** (`utility-base-parser.js`). Converts HTML journal content into structured entry objects using `BaseParser.extractFieldFromHTML`, `BaseParser.extractImage`, `BaseParser.extractTags`, `BaseParser.extractLink`.

#### Key Methods

**`parseSinglePage(page, enrichedHtml)`**
- Parses a single journal page into a codex entry object
- Extracts: category, description, plotHook, location, tags, link (UUID or `data-uuid`), image (first `<img>`)
- Normalizes category (capitalize first letter)
- Returns a structured entry object (always; no mandatory fields beyond page name)

**`parseContent(html)`** (legacy)
- Parses multi-entry HTML (e.g. by `<h1>` sections) into an array of entries; used for alternate formats.

**Key Features:**
- Case-insensitive label matching; supports `<p><strong>Label:</strong> value</p>` and `<li>` formats
- Link extraction: `@UUID[type.id]{label}` or `<a data-uuid="...">`
- Graceful handling of missing fields

### 2. CodexWindow (`scripts/window-codex.js`)

`CodexWindow` is a Blacksmith-registered Application V2 window for **creating and editing** codex entries.

#### Key Features

**Drag & Drop**
- Accepts tokens, items, and journal entries; extracts name, image, description and pre-fills form (e.g. token drag sets category “Characters” and tags).

**Fields**
- Category and location dropdowns built from existing entries (`_getExistingCategories`, `_getExistingLocations`); tag input comma-separated; image preview and remove.

**Journal Integration**
- Uses `codexJournal` setting; creates or updates journal pages via Foundry document APIs; content from `_generateJournalContent(entry)` (img, category, description, plotHook, link, location, tags).

**After Save**
- Closes form; refreshes `CodexPanel` (`_refreshData()` then `render(element)`).

### 3. CodexPanel (`scripts/panel-codex.js`)

Main UI component that displays and manages codex entries.

#### Data Structure

```javascript
{
    categories: Set,           // Unique category names
    data: {},                 // Entries grouped by category, e.g. data["Characters"] = [entry1, ...]
    filters: { search: "", tags: [], category: "all" },
    allTags: Set,
    selectedJournal: JournalEntry | null,
    isImporting: false        // Suppresses refresh during import
}
```

#### Key Methods

**`_refreshData()`**
- Clears categories, data, allTags; loads `codexJournal` into `selectedJournal`
- For each page: resolves content (sync/async), enriches with TextEditor, parses with `CodexParser.parseSinglePage()`, groups by category (default “No Category”), collects tags

**`render(element)`**
- Finds `[data-panel="panel-codex"]`; loads `_refreshData()` then renders `TEMPLATES.PANEL_CODEX` with categories, entries, filters, collapsed state (`codexCollapsedCategories`), tag cloud collapsed (`codexTagCloudCollapsed`)
- Injects HTML and calls `_activateListeners(codexContainer)`

**`_activateListeners(html)`**
- Search input → DOM filter on `.codex-entry`; tag cloud `.codex-tag` → toggle selected, filter entries and sections; `.codex-section` collapse/expand (persist to `codexCollapsedCategories`); set journal, open journal, add entry, edit (feather), delete, visibility toggle; refresh button; import/export dialogs; auto-discover from party inventories

**Helpers**
- **`_isPageInSelectedJournal(page)`** – `page.parent.id === this.selectedJournal.id`
- **`_isCodexEntry(page)`** – Heuristic: has Category field or ≥2 of Description/Tags/Plot Hook/Location
- **`getCategoryIcon(category)`** – Returns FontAwesome class (e.g. Characters → fa-user, Locations → fa-location-pin); default `fa-book`

#### Filtering

Client-side DOM filtering: search (text across entry content), tag multi-select; section visibility updated from visible entries. No full re-render.

### 4. Settings and User Flags

| Setting | Key | Scope | Description |
|---------|-----|-------|-------------|
| Codex Journal | `codexJournal` | world | Which journal holds codex pages. Set from the codex options menu or the settings pane. |

Librarian registers no `showTabCodex`; that was Squire's, gating a tray tab that no
longer exists. The browser is opened from the menubar or by window id.

**User flags (not in the settings UI):**
- `codexCollapsedCategories` – category name → collapsed boolean. Read by exact key at
  render; `_pruneCategoryFlags` strips junk keys left by an older version that derived
  them from rendered element text.
- `codexExpandedEntries` – uuids of expanded cards. Entries default to collapsed, so
  this tracks the exceptions, and is pruned of uuids whose page no longer exists.
- `codexTagCloudCollapsed` – boolean for the tag cloud.

**Page flags:** `codexUuid` (deduplication on re-import), `pinId` (the entry's canvas
pin — position and design are Blacksmith's and are never cached here), and
`squireMigrationBackup` on pages that came through the Squire migration.

---

## Data Flow

### Entry Creation Flow

```
1. User clicks "Add Codex Entry"
   ↓
2. CodexWindow opens with empty/default entry
   ↓
3. User fills form (optionally drags token/item/journal)
   ↓
4. Form generates HTML content via _generateJournalContent()
   ↓
5. Form creates new JournalEntryPage via createEmbeddedDocuments()
   ↓
6. Form closes and triggers panel refresh
   ↓
7. CodexPanel._refreshData() loads new page
   ↓
8. CodexParser.parseSinglePage() extracts structured data
   ↓
9. Panel renders updated entry
```

### Entry Display Flow

```
1. Panel.render() called
   ↓
2. Panel._refreshData() loads all journal pages
   ↓
3. For each page:
   a. Enrich HTML content (TextEditor.enrichHTML)
   b. Parse with CodexParser.parseSinglePage()
   c. Group by category
   d. Extract tags
   ↓
4. Render template with organized data
   ↓
5. Apply filters (search, tags)
   ↓
6. Display entries grouped by category
```

---

## Key Design Patterns

### 1. Schema, not parsing

Structured fields live in `page.system` behind `CodexPageModel`, validated by
Foundry. The system used to store HTML and parse it back on demand — see "A declared
page subtype, not parsed HTML" above for what replaced it and why `CodexParser` is
still present.

The flexibility the old approach bought (add a field without migration) is now the
schema's job, and the human-editability is better served by the page's own sheet
than by asking a GM to hand-write `<strong>` labels.

### 2. **Category-Based Organization**

Entries are automatically grouped by category:
- Categories are extracted from entries (no predefined list)
- "No Category" is used as default for entries without category
- Categories can be collapsed/expanded per user preference
- Category icons are mapped via `getCategoryIcon()`

### 3. **Tag-Based Filtering**

Tags provide flexible, multi-dimensional filtering:
- Tags are extracted from entries and aggregated
- Tag cloud UI allows multi-select filtering
- Tags can be clicked from entries to filter
- Search and tags work together (AND logic)

### 4. **Ownership and Visibility**

Leverages FoundryVTT's native ownership system:
- Entries respect journal page ownership levels
- GMs see all entries with visibility toggle
- Players only see entries they have permission to view
- Visibility icon shows current permission level
- **No unlock notification.** This section used to describe a transient menubar
  toast fired on every client when an entry's ownership rose to Observer, collapsing
  a burst (from Auto-Discover) into one "*N* codex entries unlocked" message. That
  lived in Squire's `manager-notifications.js`, which **did not come across** —
  neither the file nor the behaviour exists here. `focusCodexInPanel` survives, in
  `manager-codex-pins.js`, but only as the pin double-click target.

  Worth deciding rather than leaving implied: revealing codex entries is currently
  silent, so players learn about it by noticing. If that toast is wanted back it is a
  new feature, not a restoration.

### 5. Event delegation, bound once per container

`CodexPanel` binds **two delegated handlers** — one `click`, one `input` — to the
container it is handed, and nothing else. The container survives
`innerHTML = html`, so a re-render costs no rebinding at all. Binding is guarded by
an `AbortController` held on the panel and released in `destroy()`.

```javascript
_bindDelegatedListeners(container) {
    if (this._boundContainer === container) return;   // idempotent per container
    this._listenersAbort?.abort();
    this._listenersAbort = new AbortController();
    this._boundContainer = container;
    const { signal } = this._listenersAbort;
    container.addEventListener('click', e => this._onPanelClick(e, container), { signal });
    container.addEventListener('input', e => this._onPanelInput(e, container), { signal });
}
```

`_onPanelClick` dispatches on `closest()`, **ordered most-specific-first**, because
these selectors nest: an entry's menu button sits inside its title row, which sits
inside the card. Get the order wrong and the card swallows the button.

This replaced a clone-and-rebind idiom — `cloneNode(true)` + `replaceChild` before
every `addEventListener`, at fourteen sites plus around twenty per-node binding
loops. The idiom exists to strip listeners a node already carries, but it ran
immediately after `container.innerHTML = html`, so every node it touched was
microseconds old and carried none: roughly 2,200 deep subtree clones per render on a
314-entry codex, achieving nothing. `panel-quest.js` still does it the old way, at
seventeen sites, because it is still an HTML-parsed panel and the rewrite that removes
the idiom there is the same one that removes the parsing.

Two related consequences of the same rewrite:

- **Enriched `@UUID` output is cached** for the session, keyed on `uuid|label`. It
  was being awaited once per link per render, sequentially within a category.
- **Search filters the DOM rather than re-rendering.** Re-rendering on a keystroke
  would rebuild the search input and drop focus and caret — the same reason
  Blacksmith's Compendium Search paints into its results container instead.

---

## Template Structure

### Panel Template (`templates/panel-codex.hbs`)

The panel template uses Handlebars with a hierarchical structure:

```
Codex Panel
├── Toolbar (refresh, add, import, export, settings)
├── Filters
│   ├── Search input
│   └── Tag cloud (collapsible)
└── Content
    └── Categories (collapsible sections)
        └── Entries (collapsible items)
            ├── Header (name, actions)
            └── Content (description, plotHook, location, tags, etc.)
```

**Key Template Features:**
- Conditional rendering based on user role (`{{#if isGM}}`)
- Dynamic category icons
- Collapsible sections with state persistence
- Rich content rendering (HTML from enriched journal content)

### Window Template (`templates/window-codex.hbs`)

The form template provides:
- Drag & drop zone for auto-population
- Image preview section
- Category/location dropdowns with "New" option
- Tag input with suggestions
- Form validation

---

## Hooks Integration

**Blacksmith HookManager (squire.js):**
- **Journal:** `manager-journal-routing.js` registers `createJournalEntryPage`,
  `updateJournalEntryPage` and `deleteJournalEntryPage`, and re-renders whichever
  campaign panel owns the page's journal. It skips while a panel reports
  `isImporting`, so a bulk import re-renders once at the end rather than per page,
  and honours the `librarianSkipCodexRender` update option — a private contract used
  by the visibility toggle, which patches its own icon in place to avoid losing
  scroll position and expanded cards.

## Import/Export and Auto-Discover

### Import
- **JSON import**: Dialog with paste area; expects array of codex entry objects. Creates journal pages via `createEmbeddedDocuments`; sets `codexUuid` flag for deduplication. Progress is reported into the host's status slot — the codex browser puts one in its
Tool footer. Optional AI-assisted import using the `prompts/prompt-codex.txt` template,
with campaign placeholders filled from Blacksmith.
- **Deduplication**: On import, existing pages are matched by `page.getFlag(MODULE.ID, 'codexUuid') === entry.uuid`; matching entries are updated, others created.

### Export
- **JSON export**: Refreshes, converts all entries to a JSON array, and hands them to `DataExportWindow` for clipboard or download (`COFFEEPUB-LIBRARIAN-codex-export-{timestamp}.json`).
- **It refuses to write a partial.** See below — this is the load-bearing part.

### Export completeness, and the subtype hazard

**Owning a document subtype makes every export path a data-safety question.** This is
the one non-obvious cost of `coffee-pub-librarian.codex` being a declared subtype
rather than a view over plain text pages, and it is permanent — it is not a
migration artefact.

Foundry refuses a page whose `type` names a module that is disabled or absent. So
with Librarian disabled, codex pages do not load, and **anything reading the journal
sees a short list and reports success**: a world export, Foundry's own journal
export, a compendium export. The file looks complete. Nobody finds out until a
restore.

Librarian's own export cannot hit that case — the codex panel cannot open while the
module is disabled — but three *other* silent-partial paths existed and are now
closed:

| Path | Was |
|---|---|
| Export ran off the last-rendered `this.data` | A page added since was absent from the file |
| A page whose content would not read was caught and ignored | Exported as though it simply had no Expanded Details |
| `_refreshData` skips a codex page that throws while parsing | Dropped from the file, console line only |

`_openExportCodexDialog` now refreshes first, counts what it gathered against the
`CODEX_PAGE_TYPE` pages actually in the journal, records unreadable pages by name,
and **refuses on any mismatch**. The export summary reports `N of N` rather than
`N`, so the check is visible on success rather than only firing on failure.

### Leftover from the Squire migration

Codex pages migrated out of Squire carry a `squireMigrationBackup` flag holding
their original `type` and `system` data — the thing that made the retype
reversible. The migration is long finished and its tooling has been deleted, but
the flags remain on migrated pages in both worlds.

Clearing them is optional, is the point of no return, and there is no hurry. If
you do clear them, note that nothing else reads the flag: it is inert storage, not
a dependency.

### The rules

Two rules follow, and neither is optional:

- **Never back up the codex with Librarian disabled.** Enable it, confirm the
  browser lists your entries, then back up.
- **Any future export path must carry the same guard.** If the import half ever
  moves to Blacksmith's `api.importer`, the completeness check stays here —
  Blacksmith has no answer for this failure mode and has the open question filed
  under *"Import/export and module-owned document subtypes"*.

### Auto-Discover from Party Inventories
- Button in panel: scans all player-owned character tokens on the canvas, collects inventory item UUIDs and names, then for each codex entry checks if any party member has that item; updates entry “discoverers” and progress. Uses global progress bar; notifies when no party tokens or no inventory items found.

---

## Best Practices

### 1. **Error Handling**

Always wrap parsing and data operations in try-catch:
```javascript
try {
    const entry = await CodexParser.parseSinglePage(page, enriched);
    if (entry) {
        // Process entry
    }
} catch (error) {
    console.error('Error parsing codex entry:', error);
    // Continue processing other entries
}
```

### 2. **Async Content Handling**

Journal page content can be async in FoundryVTT v13+:
```javascript
let content = '';
if (typeof page.text?.content === 'string') {
    content = page.text.content;
} else if (page.text?.content) {
    content = await page.text.content;
}
```

### 3. **Performance Considerations**

- Use client-side filtering (DOM manipulation) instead of re-rendering
- Cache parsed entries when possible
- Batch journal page operations
- Use `Set` for efficient tag/category lookups

### 4. **User Experience**

- Provide visual feedback during operations (progress bars)
- Show loading states during data refresh
- Persist user preferences (collapsed states, filters)
- Support keyboard navigation where possible

### 5. **Extensibility**

- Use configuration objects for category icons
- Allow custom field parsers
- Support plugin-style extensions
- Document extension points

---

## Extension Points

- **Custom fields:** Add extraction in `CodexParser.parseSinglePage()`, window field in `window-codex.hbs`, display in panel template, and output in `CodexWindow._generateJournalContent()`.
- **Category icons:** Extend `CodexPanel.getCategoryIcon(category)` map (e.g. `'Custom Category': 'fa-custom-icon'`; default `'fa-book'`).

## Technical Requirements

- FoundryVTT v13+
- D&D 5e system 5.5+
- Required: `coffee-pub-blacksmith`

