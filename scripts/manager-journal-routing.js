import { MODULE } from './const.js';
import { getCampaignPanel, refreshCampaignPanel } from './campaign-panels.js';
import { CODEX_TAG_CONTEXT } from './utility-tags.js';

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
    // full re-render, so the panel keeps its scroll position and expanded entries.
    //
    // This is a private contract between panel-codex.js and this router — an update
    // option Foundry passes through untouched. Both halves have to change in one
    // commit or the toggle silently starts triggering full re-renders again.
    if (kind === 'codex' && options?.librarianSkipCodexRender) return;

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
        ['deleteJournalEntryPage', Hooks.on('deleteJournalEntryPage', (page, options) => _route(page, {}, options))],
        // Tags are no longer part of the document, so changing one writes to
        // Blacksmith's store and fires NO journal hook -- the browser would sit
        // there stale until something else touched the page. This is the
        // replacement signal.
        //
        // Safe to re-render on unconditionally: Blacksmith fires this only on a
        // real change (adding a tag a record already has, or removing one it does
        // not, is silent), so there is no no-op churn to guard against.
        ['blacksmith.tags.changed', Hooks.on('blacksmith.tags.changed', ({ contextKey } = {}) => {
            if (contextKey !== CODEX_TAG_CONTEXT) return;
            refreshCampaignPanel('codex');
        })],
        // ...and the same again from the other direction, because the hook above only
        // ever fires on the client that made the change.
        //
        // Blacksmith's three tag hooks are `Hooks.callAll` with no fan-out; their socket
        // is a GM write-proxy, not a broadcast. The DATA reaches every client, because
        // Foundry pushes the world setting, but nobody else is told a tag changed. So a
        // player with the codex open keeps rendering the old vocabulary indefinitely --
        // most visibly after a bulk rename sweep, where every connected player would show
        // tags that no longer exist. Ours is a player-read codex, so this is not an edge.
        //
        // `updateSetting` DOES reach every client. This is a workaround for a gap
        // Blacksmith has recorded as theirs to fix; when the hooks fan out, delete it and
        // keep the handler above.
        ['updateSetting', Hooks.on('updateSetting', (setting) => {
            const key = setting?.key ?? '';
            if (key !== 'coffee-pub-blacksmith.tagAssignments'
                && key !== 'coffee-pub-blacksmith.tagRegistry') return;
            refreshCampaignPanel('codex');
        })]
    ];
}

export function teardownJournalRouting() {
    for (const [name, id] of _hookIds) {
        try { Hooks.off(name, id); } catch (_) {}
    }
    _hookIds = [];
}
