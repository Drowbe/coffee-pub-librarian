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

    // Point one page at a subtype no installed module declares, then rebuild.
    const source = journal.pages._source.find(p => p._id === victim.id);
    source.type = FAKE_TYPE;
    journal.pages.initialize({ strict: false });

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
 ==================================================================
------------------------------------------------------------------ */
