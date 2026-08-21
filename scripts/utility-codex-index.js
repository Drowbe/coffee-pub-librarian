import { CODEX_PAGE_TYPE } from './data/codex-page-model.js';
import { escapeHtml } from './helpers.js';

/**
 * Name → codex page lookup, shared by every surface that renders a codex
 * cross-reference.
 *
 * `related` entries and the levels of a `location` path are plain NAMES, not uuids.
 * That is deliberate — see the `related` field on CodexPageModel: storing the name
 * means a relationship to an entry that does not exist yet is kept verbatim and
 * links itself the moment that entry is created, with no migration, no rescan and
 * no import ordering problem.
 *
 * The cost is that every surface showing one has to resolve it, and there are three:
 * the browser card, the journal page's view sheet, and anything else that grows one
 * later. This module exists so there is one resolver rather than one per surface —
 * they drifted once already between the panel and the pin manager over the category
 * icon map, which is why `CODEX_CATEGORY_ICONS` now lives in const.js.
 */

/**
 * Normalize a name for matching: lowercase, collapse interior whitespace, trim.
 * "Wayfinder  Casing" and "Wayfinder Casing" are the same name.
 *
 * BOTH sides of every comparison must go through this. Inlining the expression is
 * how the codex-entry side once drifted from the inventory side and stopped
 * matching any name containing a double space.
 */
export function normalizeName(name) {
    return String(name ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Index every codex entry in a journal by normalized name.
 *
 * Built fresh per render rather than cached: the index changes whenever ANY entry is
 * added or renamed, so a cached one would leave "Phlan" unlinked after "Moonsea" is
 * created. It is one O(n) pass over pages already in memory.
 *
 * Respects the viewer — entries a player cannot observe are omitted, so their names
 * render as plain text rather than as links to something they cannot open.
 *
 * @param {JournalEntry|null} journal
 * @returns {Map<string, {uuid: string, name: string}>}
 */
export function buildCodexPageIndex(journal) {
    const index = new Map();
    for (const page of (journal?.pages ?? [])) {
        if (page.type !== CODEX_PAGE_TYPE) continue;
        if (!game.user.isGM
            && (page.ownership?.default ?? 0) < CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) continue;
        const key = normalizeName(page.name);
        if (key && !index.has(key)) index.set(key, { uuid: page.uuid, name: page.name });
    }
    return index;
}

/**
 * Render a reference to another codex entry by name.
 *
 * Resolved → an anchor carrying the target uuid. Unresolved → the plain name, which
 * is NOT an error: a codex is authored incrementally, so a relationship may name an
 * entry that does not exist yet. It becomes a link on the next render after that
 * entry is created — no rescan, no stored uuid to migrate.
 *
 * What a click DOES is the caller's business, and it differs by surface: in the
 * browser it reveals the entry in place, on a journal page it opens the page. The
 * anchor carries `data-uuid` and a class; nothing here binds a handler.
 *
 * @param {string} name
 * @param {Map<string, {uuid: string, name: string}>} index
 * @returns {string} HTML
 */
export function renderCodexRef(name, index) {
    const raw = String(name ?? '').trim();
    if (!raw) return '';
    const hit = index?.get(normalizeName(raw));
    if (!hit) return `<span class="codex-ref-unresolved">${escapeHtml(raw)}</span>`;
    return `<a class="codex-ref" data-uuid="${escapeHtml(hit.uuid)}">${escapeHtml(raw)}</a>`;
}
