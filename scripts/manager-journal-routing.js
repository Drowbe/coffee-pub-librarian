import { MODULE } from './const.js';
import { getCampaignPanel, refreshCampaignPanel } from './campaign-panels.js';

/**
 * Route journal page changes to whichever campaign panel cares about them.
 *
 * Squire did this from its `updateJournalEntryPage` hook via `_routeToQuestPanel`
 * and `_routeToCodexPanel`. Neither came across with the ported code, so until
 * this existed a page edited anywhere other than Librarian's own editor — the
 * journal sheet, another user's client, an import, a macro — left the open
 * browser showing stale content.
 *
 * The quest port hid this: the quest window refreshes its panel directly after
 * saving, so the round-trip everyone tested worked while the general case did
 * not.
 *
 * Registered natively rather than through Blacksmith's HookManager. These are
 * plain post-event hooks so either would work, but the module keeps its own
 * cleanup and does not need the extra indirection.
 */

let _hookIds = [];

/**
 * A page counts as belonging to a panel when it lives in that feature's
 * configured journal. Asking the panel keeps the definition in one place — the
 * panel already needs it to build its own list.
 */
function _routeTo(kind, page, options) {
    // The codex visibility toggle patches its icon in place and opts out of the
    // full re-render, so the panel keeps scroll position and expanded entries.
    // The option name is Squire's, kept because that is what the ported
    // panel-codex.js still sends; renaming it means changing both halves at once.
    if (kind === 'codex' && options?.squireSkipCodexRender) return;

    const panel = getCampaignPanel(kind);
    if (!panel) return;

    // An import writes many pages in a burst; the panel re-renders once when it
    // finishes rather than once per page.
    if (panel.isImporting) return;

    try {
        if (typeof panel._isPageInSelectedJournal === 'function'
            && !panel._isPageInSelectedJournal(page)) return;
    } catch (error) {
        console.error(`${MODULE.TITLE} | Error testing page ownership for '${kind}':`, error);
        return;
    }

    refreshCampaignPanel(kind);
}

function _route(page, changes, options) {
    _routeTo('quest', page, options);
    _routeTo('codex', page, options);
}

export function initJournalRouting() {
    if (_hookIds.length) return;
    _hookIds = [
        ['updateJournalEntryPage', Hooks.on('updateJournalEntryPage', (page, changes, options) => _route(page, changes, options))],
        ['createJournalEntryPage', Hooks.on('createJournalEntryPage', (page, options) => _route(page, {}, options))],
        ['deleteJournalEntryPage', Hooks.on('deleteJournalEntryPage', (page, options) => _route(page, {}, options))]
    ];
}

export function teardownJournalRouting() {
    for (const [name, id] of _hookIds) {
        try { Hooks.off(name, id); } catch (_) {}
    }
    _hookIds = [];
}
