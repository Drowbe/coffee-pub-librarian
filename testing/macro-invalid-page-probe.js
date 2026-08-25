// Invalid embedded-document probe. Paste the CODE ONLY into a Script macro or the browser console.
// Rationale and recorded results are in the block comment at the BOTTOM of
// this file, deliberately: a pasted header comment lost its "//" prefixes
// once and Foundry parsed the prose as code.

const REAL_TYPE = 'coffee-pub-librarian.codex';
const FAKE_TYPE = 'coffee-pub-doesnotexist.thing';

const [journal] = await JournalEntry.create([{ name: 'ZZZ Invalid Page Probe' }]);
try {
    await JournalEntryPage.create([
        { name: 'Valid Codex Page', type: REAL_TYPE, system: { summary: 'stays valid' } },
        { name: 'Will Be Broken',   type: REAL_TYPE, system: { summary: 'about to be orphaned' } }
    ], { parent: journal });

    const victim = journal.pages.find(p => p.name === 'Will Be Broken');
    console.log('BEFORE  | pages:', journal.pages.size, '| invalid:', journal.pages.invalidDocumentIds.size);

    // Drop the CONSTRUCTED document but keep its _source row. Without this,
    // _initializeDocument short-circuits on `this.get(data._id)` and merely
    // re-initializes the existing doc, so createDocument -- the only thing that
    // can throw into _handleInvalidDocument -- never runs. Version 1 of this
    // probe missed that and reported a meaningless EMPTY.
    journal.pages.delete(victim.id, { modifySource: false });

    // Point the surviving source row at a subtype no installed module declares.
    const source = journal.pages._source.find(p => p._id === victim.id);
    source.type = FAKE_TYPE;

    // Default strictness on purpose. Passing { strict: false } sets the fallback
    // path in DocumentTypeField._validateType, which explicitly ALLOWS an
    // unrecognized type -- the second reason version 1 proved nothing.
    journal.pages.initialize();

    const invalid = journal.pages.invalidDocumentIds;
    console.log('AFTER   | pages:', journal.pages.size, '| invalid:', invalid.size);
    console.log('IDS     |', [...invalid]);
    console.log('VERDICT | embedded tracking is', invalid.size > 0 ? 'POPULATED' : 'EMPTY');

    // The count the export guard would actually use.
    console.log('TOTAL   | source rows =', journal.pages._source.length,
                '| loaded =', journal.pages.size,
                '| missing =', journal.pages._source.length - journal.pages.size);
} catch (error) {
    console.error('PROBE FAILED:', error);
} finally {
    await journal.delete();
    console.log('Scratch journal deleted. Reload the world to clear in-memory state.');
}

/* ------------------------------------------------------------------
 ==================================================================
 Invalid embedded-document probe -- paste into a Foundry Script macro.
 ==================================================================
 Answers Blacksmith's question for the export completeness design: when
 a journal PAGE fails to construct, is it tracked on the journal's own
 pages collection, or only on world-level collections?

 This matters because our export guarantee needs an independent count of
 what *should* have loaded. If `journal.pages.invalidDocumentIds` is
 populated, the export can compare against it directly. If it is empty,
 layer 3 of the guarantee needs a different source.

 WHY THIS DOESN'T REQUIRE DISABLING LIBRARIAN
 Foundry builds embedded documents from the collection's `_source` array
 (EmbeddedCollection#initialize -> #_initializeDocument -> createDocument;
 common/abstract/embedded-collection.mjs). A construction failure is
 caught and routed to `_handleInvalidDocument`, which adds the id to
 `invalidDocumentIds` (:197). So we can mutate `_source` in memory to an
 undeclared subtype and re-initialize -- the same code path a
 disabled-module page takes at world load, without touching the module.

 SAFE: `_source` is mutated IN MEMORY ONLY and nothing is saved. The
 scratch journal is deleted at the end. Reload the world afterwards to
 clear any in-memory residue.

 RESULT, 2026-08-24, Foundry 13.351 + dnd5e 5.3.3: POPULATED.
   BEFORE  | pages: 2 | invalid: 0
   AFTER   | pages: 1 | invalid: 1
   IDS     | ['6zFvxJ52P2msNyYF']
   VERDICT | POPULATED
   COUNTS  | source: 2 loaded: 1 missing: 1

 Both independent sources work, which is the answer the export guarantee
 needed. Foundry logged the construction failure through exactly the path
 read out of the source beforehand:
   EmbeddedCollection.initialize -> _initializeDocument -> createDocument
   throws -> _handleInvalidDocument -> invalidDocumentIds.add(id)
 with `type: "coffee-pub-doesnotexist.thing" is not a valid type for the
 JournalEntryPage Document class`.

 So a codex page refused at load is BOTH counted in
 journal.pages.invalidDocumentIds AND visible as _source.length exceeding
 pages.size. Prefer invalidDocumentIds: it names the ids, so the export
 can report WHICH pages are missing rather than only how many.

 RESULT of probe v1, 2026-08-23: EMPTY -- and INVALID, discarded. It hit
 the re-initialize branch and also passed { strict: false }, so no
 construction was ever attempted. The tell was the broken page keeping a
 fully intact CodexPageModel `system` while carrying an undeclared type,
 which a failed construction cannot produce. Both flaws are fixed above;
 do not quote the v1 number.
 ==================================================================
------------------------------------------------------------------ */
