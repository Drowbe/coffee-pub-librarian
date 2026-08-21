# Migration runbook — Squire → Librarian, per world

Written for the production run. Dev proved the mechanism; this is about the things
dev couldn't tell us, because dev had 2 quest pins and a codex that had already
been re-imported.

**The order is the whole thing.** Squire keeps working throughout. It is only the
last step that removes anything.

---

## Before you start

- [ ] **Back up the world.** This rewrites every codex page's `type` and `system`. The
      macro keeps a per-page backup flag and `REVERT = true` restores it, but a world
      backup covers the cases a flag cannot — an interrupted run, a crash mid-write,
      a mistake noticed a week later.
- [ ] **Get the players out.** These are bulk document updates; a connected client
      re-rendering 342 page updates is at best noisy.
- [ ] **Leave Squire on 13.6.1.** Do NOT update Squire to 13.7.0 yet. Until the
      migration has run, Squire's manifest is the only thing declaring the
      `coffee-pub-squire.codex` subtype, and it is what keeps those pages loading.

## 1. Install Librarian

- [ ] Install from the manifest URL, or copy the module directory in.
- [ ] **Return to Setup and re-enter the world.** A browser refresh is not enough:
      Foundry reads `documentTypes` when the *server* loads module manifests, so a
      newly declared page subtype is invisible until the world is re-entered. On dev
      this presented as 342 identical validation errors naming nothing useful.
- [ ] Confirm in the console:
      ```js
      game.documentTypes.JournalEntryPage
      ```
      `coffee-pub-librarian.codex` must be in the list. Both modules declaring the
      subtype at once is expected and correct — that overlap is what makes the
      migration possible.

## 2. Quests

- [ ] Run `macros/migrate-quests-from-squire.js` with `DRY_RUN = true`. Read the report.
- [ ] **Check the pin count against reality.** Dev had 2. Production has many. The macro
      counts placed pins per scene *plus* unplaced ones, and passes
      `includeHiddenByFilter: true` — a pin for a hidden objective is created hidden by
      design, so a default listing would skip exactly the pins most likely to be
      forgotten. If the number looks low, stop and say so.
- [ ] `DRY_RUN = false`, re-run.

## 3. Codex

- [ ] Run `macros/migrate-codex-from-squire.js` with `DRY_RUN = true`.
- [ ] **Compare "Pages retyped" against the entry count in Squire's codex browser.**
      They should match exactly. Both select on `type === 'coffee-pub-squire.codex'` —
      verified against Squire 13.6.1's `panel-codex.js`, which filters on the same
      constant — so anything the browser lists, the macro migrates.
      - Squire's codex data model shipped with no migration (re-importing was the
        conversion path), so a world that predates it may still hold plain `text` pages
        with old codex content. Those are invisible to this macro — but they were
        already invisible to Squire's own browser, so nothing that currently works can
        be left behind. If you want that content, re-import it in Squire 13.6.1 first.
      - A mismatch between the two numbers means something else is wrong. Stop.
- [ ] `DRY_RUN = false`, re-run.
- [ ] **Read the report for a red FAILED block.** After each type change the macro
      re-reads the page and checks summary/category/links survived, because a
      `system` reset to model defaults does not throw. Any entry there → set
      `REVERT = true`, re-run, stop, and work out why before trying again.

## 4. Verify — with Squire still enabled

- [ ] Quests: browser opens, a quest edits and saves, a pin double-click reveals it.
- [ ] Codex: browser opens, entries expand, pin/unpin/locate work, an entry edits and
      saves, import/export dialog opens and is styled.

## 5. Verify — with Squire DISABLED

The pass that catches anything still leaning on Squire. Shared Handlebars helpers,
partials and CSS class names are world-global, so while both modules run, Librarian
can be silently borrowing Squire's. That is not hypothetical: it is how the missing
`registerHelpers` and the unstyled import/export dialog were found.

- [ ] Disable Squire. Reload.
- [ ] Quests and Codex both fully usable. No `Missing helper` errors, nothing unstyled.
- [ ] Re-enable Squire.

## 6. Only now: update Squire to 13.7.0

- [ ] Update. Squire 13.7.0 drops the `documentTypes` declaration and all quest/codex code.
- [ ] Confirm: one Quests and one Codex button on the menubar (Librarian's), Notes from
      Squire, no console errors.

---

## If it goes wrong

Set `REVERT = true` in the codex macro and re-run: it restores each page's original
`type` and `system` from the backup flag. Pages already retyped are skipped by the
forward migration (matched on `type`), so a backup is never overwritten with
post-migration state and re-running the forward pass after a partial failure is safe.

If Squire has already been updated to 13.7.0 and something is wrong, roll Squire back
to 13.6.1 first — that restores the subtype declaration and with it the pages.

## Never back up the codex with Librarian disabled

A standing rule that outlives this migration, so it lives in
[`architecture/architecture-codex.md`](architecture/architecture-codex.md) under
"Export completeness, and the subtype hazard" rather than here. Short version:
with Librarian disabled, codex pages do not load, and anything reading the journal
reports success over a short list.

## Housekeeping, later

Every migrated codex page carries a `squireMigrationBackup` flag holding its original
type and system data. Leave it until Squire 13.7.0 has been live long enough to trust.
Clearing it is the point of no return, and there is no hurry.
