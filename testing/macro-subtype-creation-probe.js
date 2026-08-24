// Subtype creation probe. Paste the CODE ONLY into a Script macro or the browser console.
// Rationale and recorded results are in the block comment at the BOTTOM of
// this file, deliberately: a pasted header comment lost its "//" prefixes
// once and Foundry parsed the prose as code.

const TYPE = 'coffee-pub-librarian.codex';

const [journal] = await JournalEntry.create([{ name: 'ZZZ Subtype Test' }]);
try {
    const page = await JournalEntryPage.create({
        name: 'Subtype Probe',
        type: TYPE,
        system: { summary: 'probe', category: 'Locations', tags: ['probe'] }
    }, { parent: journal });

    console.log('CREATED:', page?.type === TYPE, '| type =', page?.type);
    console.log('MODEL  :', page?.system?.constructor?.name);
    console.log('SYSTEM :', page?.system?.summary, '|', page?.system?.category, '|', JSON.stringify(page?.system?.tags));
    ui.notifications.info(`Subtype test: created as ${page?.type}`);
} catch (error) {
    console.error('REFUSED:', error);
    ui.notifications.error(`Subtype test failed: ${error.message}`);
} finally {
    await journal.delete();
}

/* ------------------------------------------------------------------
 ==================================================================
 Subtype creation probe -- paste into a Foundry Script macro and run.
 ==================================================================
 Answers: can a codex page be created by a caller that did not declare
 the subtype? Asked by Blacksmith in August 2026, because their
 importer declaration model has Blacksmith constructing our documents.

 RESULT, 2026-08-23, Foundry v13 + Librarian enabled: PASS.
   CREATED: true | type = coffee-pub-librarian.codex
   MODEL  : CodexPageModel
   SYSTEM : probe | Locations | ["probe"]

 Read that result carefully, because it proves less than it appears to.
 **Foundry does not attribute document creation to a calling module.**
 There is no caller identity in `create()`; the only namespaced thing is
 the manifest `documentTypes` declaration. So this macro cannot simulate
 "Blacksmith calling it" any differently from Librarian calling it -- it
 is the same code path, and our own importer has been exercising it
 since 13.0.0 via `createEmbeddedDocuments`.

 What it does establish: creation with a module-declared subtype binds
 the registered TypeDataModel and preserves `system` intact. The failure
 mode worth watching for was a page created as a generic type with the
 schema silently dropped -- that would have looked like success from the
 caller's side while discarding every codex field. It did not happen.

 The genuinely open constraint is unrelated to callers: with Librarian
 DISABLED, Foundry refuses these pages at load. That is a load problem,
 not an API-design problem, and it is the same hazard behind the export
 completeness guard (architecture-codex.md, "the subtype hazard").
 ==================================================================
------------------------------------------------------------------ */
