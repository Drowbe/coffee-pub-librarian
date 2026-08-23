// ==================================================================
// ===== IMPORT-CODEX – per-entry codex import, free of any dialog ==
// ==================================================================
// Shaped deliberately to Blacksmith's JsonImportKind callback contract
// (`onValidateEntry` / `onImportEntry` — see api-importer.md): data in,
// document out, no UI, no progress, no notifications. Adopting
// `api.importer` should then be a wiring change in panel-codex.js rather
// than a rewrite, whichever way Blacksmith resolves the open question
// about contributing a profile to an existing kind.
//
// Everything here used to live inline in the import dialog's button
// callback, interleaved with progress bookkeeping and toasts. The
// reasoning in the comments below came across with it and is
// load-bearing — read it before changing a branch.
// ==================================================================

import { MODULE } from './const.js';
import { CODEX_PAGE_TYPE } from './data/codex-page-model.js';
import { resolveCodexLinks, mergeCodexLinks } from './utility-resolver.js';

/**
 * Build the `system` payload for a codex page from an import entry.
 * Link resolution is the caller's, so the resolved links are passed in
 * rather than fetched here — the update branch needs them separately to
 * merge against what is already on the page.
 *
 * @param {object} entry
 * @param {object[]} resolvedLinks
 * @returns {object}
 */
export function buildCodexSystemData(entry, resolvedLinks) {
    // Canonical field is `summary`; accept legacy `description` imports.
    const summary = entry.summary ?? entry.description ?? '';
    const systemData = {
        summary,
        category: entry.category || '',
        plotHook: entry.plotHook || '',
        location: entry.location || '',
        links: resolvedLinks,
        tags: Array.isArray(entry.tags) ? entry.tags : [],
        img: entry.img || ''
    };
    // Related codex entries: plain names, resolved at render against the
    // journal's pages, so a name whose entry doesn't exist yet links itself
    // once it does. Present in the import replaces; absent preserves (same
    // rule as expandedDetails) — importing an older JSON must not silently
    // wipe the relationships.
    if (Array.isArray(entry.related)) {
        systemData.related = entry.related
            .map(r => String(r ?? '').trim())
            .filter(Boolean);
    }
    return systemData;
}

/**
 * Find the page an import entry should upsert onto: by `codexUuid` flag
 * first, then by name. A name match may land on a legacy text page, which
 * is why callers have to check `type` rather than assuming.
 *
 * @param {JournalEntry} journal
 * @param {object} entry
 * @returns {JournalEntryPage|null}
 */
export function findCodexPage(journal, entry) {
    if (!journal) return null;
    let page = null;
    if (entry.uuid) page = journal.pages.find(p => p.getFlag(MODULE.ID, 'codexUuid') === entry.uuid);
    if (!page) page = journal.pages.find(p => p.name === entry.name);
    return page ?? null;
}

/**
 * Validate one import entry. Blacksmith's `onValidateEntry` contract:
 * throw to reject, or return `{ validationWarnings }`. Creates nothing.
 *
 * Deliberately permissive beyond `name` — the codex schema tolerates
 * missing fields by design, and rejecting an entry here loses it entirely
 * rather than importing it thin.
 *
 * @param {object} entry
 * @returns {{ validationWarnings: string[] }}
 */
export function validateCodexEntry(entry) {
    if (!entry || typeof entry !== 'object') throw new Error('Codex entry must be an object.');
    const name = String(entry.name ?? '').trim();
    if (!name) throw new Error('Codex entry is missing a name.');

    const validationWarnings = [];
    if (entry.related !== undefined && !Array.isArray(entry.related)) {
        validationWarnings.push(`"${name}": related must be an array of entry names; it was ignored.`);
    }
    if (entry.tags !== undefined && !Array.isArray(entry.tags)) {
        validationWarnings.push(`"${name}": tags must be an array; it was ignored.`);
    }
    return { validationWarnings };
}

/**
 * Import one codex entry into the journal, creating or updating a typed
 * page. Blacksmith's `onImportEntry` contract: return `{ document }`, with
 * optional `importWarnings`. The extra `outcome`, `duplicateMerged` and
 * `resolveReports` fields are ours — Blacksmith reads `.document` and
 * `.importWarnings` and ignores the rest, so one return value serves both
 * callers.
 *
 * @param {object} entry
 * @param {JournalEntry} journal
 * @returns {Promise<{document: JournalEntryPage, outcome: 'added'|'updated'|'replaced', duplicateMerged: boolean, resolveReports: object[], importWarnings: string[]}>}
 */
export async function importCodexEntry(entry, journal) {
    if (!journal) throw new Error('No Codex journal selected.');

    const page = findCodexPage(journal, entry);
    // Links: uuid-bearing links pass through, bare names resolve via
    // Blacksmith (entry's own name typed by category, cross-references by
    // their own `type`). Legacy single `link` is folded in by the helper.
    const { links: resolvedLinks, reports } = await resolveCodexLinks(entry);
    const systemData = buildCodexSystemData(entry, resolvedLinks);

    if (page && page.type !== CODEX_PAGE_TYPE) {
        // Legacy text page matched — re-import IS the conversion path:
        // replace it with a typed page (preserving ownership and sort)
        const ownership = foundry.utils.deepClone(page.ownership);
        const sort = page.sort;
        await page.delete();
        const [newPage] = await journal.createEmbeddedDocuments('JournalEntryPage', [{
            name: entry.name,
            type: CODEX_PAGE_TYPE,
            system: systemData,
            text: { content: entry.expandedDetails || '' },
            ownership,
            sort
        }]);
        if (entry.uuid) await newPage.setFlag(MODULE.ID, 'codexUuid', entry.uuid);
        return { document: newPage, outcome: 'replaced', duplicateMerged: false, resolveReports: reports, importWarnings: [] };
    }

    if (page) {
        // Links already on the page that this import doesn't produce were
        // put there by hand (dragging was the only way to add one before
        // 13.3.12) and aren't recoverable from the JSON, so keep them.
        // Foundry replaces arrays wholesale, so this has to be explicit.
        const patch = {
            system: {
                ...systemData,
                links: mergeCodexLinks(page.system?.links, resolvedLinks)
            }
        };
        // expandedDetails present in the import (even '') replaces; absent/null preserves
        if (entry.expandedDetails !== undefined && entry.expandedDetails !== null) {
            patch['text.content'] = entry.expandedDetails;
        }
        // Read the flag before the update, or the comparison is against the
        // value this same import just wrote.
        const duplicateMerged = Boolean(entry.uuid && page.getFlag(MODULE.ID, 'codexUuid') !== entry.uuid);
        await page.update(patch);
        return { document: page, outcome: 'updated', duplicateMerged, resolveReports: reports, importWarnings: [] };
    }

    const [newPage] = await journal.createEmbeddedDocuments('JournalEntryPage', [{
        name: entry.name,
        type: CODEX_PAGE_TYPE,
        system: systemData,
        text: { content: entry.expandedDetails || '' },
        ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }
    }]);
    if (entry.uuid) await newPage.setFlag(MODULE.ID, 'codexUuid', entry.uuid);
    return { document: newPage, outcome: 'added', duplicateMerged: false, resolveReports: reports, importWarnings: [] };
}

/**
 * Names appearing more than once in an import payload. Reported before the
 * run so the GM knows they will be merged rather than each creating a page.
 *
 * @param {object[]} entries
 * @returns {string[]}
 */
export function findDuplicateNames(entries) {
    const counts = {};
    const duplicates = [];
    for (const entry of entries) {
        if (!entry?.name) continue;
        counts[entry.name] = (counts[entry.name] || 0) + 1;
        if (counts[entry.name] > 1 && !duplicates.includes(entry.name)) duplicates.push(entry.name);
    }
    return duplicates;
}

/**
 * Re-sort every page in the journal alphabetically. Whole-journal rather
 * than per-entry, so it belongs to the batch and not to `importCodexEntry`.
 *
 * @param {JournalEntry} journal
 */
export async function sortCodexPages(journal) {
    if (!journal) return;
    const sorted = journal.pages.contents.slice().sort((a, b) => a.name.localeCompare(b.name));
    for (let i = 0; i < sorted.length; i++) await sorted[i].update({ sort: (i + 1) * 10 });
}

/**
 * Count links kept as plain text across the codex — a name with no uuid.
 * Drives the post-import prompt pointing at Auto-Link.
 *
 * @param {JournalEntry} journal
 * @returns {number}
 */
export function countUnresolvedLinks(journal) {
    return (journal?.pages?.contents ?? [])
        .filter(p => p.type === CODEX_PAGE_TYPE)
        .reduce((sum, p) => sum + (p.system?.links ?? [])
            .filter(l => !String(l?.uuid ?? '').trim() && String(l?.name ?? '').trim()).length, 0);
}
