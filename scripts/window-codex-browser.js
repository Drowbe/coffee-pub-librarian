import { MODULE, WINDOWS } from './const.js';
import { registerCampaignPanel, unregisterCampaignPanel } from './campaign-panels.js';
import { getCodexPanel } from './codex-panel-instance.js';
// Imported from Blacksmith's bridge, which is a real ES module and so resolves at
// evaluation time — which is when `extends` needs it. This file used to resolve the
// base class from `module.api` at top level and throw if it was missing. That was
// what Blacksmith's own documentation advised, and it was wrong: `game` does not
// exist when a module script is evaluated, and a module that throws during
// evaluation stays dead for the rest of the session rather than being retried.
// (Merchant took down a live world that way on 2026-08-19.) Librarian survived it
// only by using optional chaining and by importing these files late.
//
// `scripts/` paths are still not the stable contract; `api/blacksmith-api.js` is.
import { BlacksmithToolWindowBaseV2 } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';

/**
 * The codex browser, on Blacksmith's Tool window shell.
 *
 * Split out from CampaignBrowserWindow, which now hosts quests only. The two were
 * one class parameterised by `kind` while both were single-column lists; they stop
 * sharing a shape the moment quests grow a detail pane, and they want different
 * shells regardless:
 *
 *   - The codex is a **lookaside**. You keep it open beside the canvas and search it
 *     mid-session. That is a palette, and Blacksmith's own Compendium Search
 *     (`scripts/window-compendium-search.js`) is the reference for what one looks
 *     like: Tool base, real dimensions, resizable, search-first.
 *   - Quests are an **app**. List plus detail, wanting width, filling the screen.
 *     Standard base, five zones.
 *
 * What the Tool base buys us: Light / Dark / Glass themes the user picks per tool,
 * an optional micro title bar, a compact frame, and a palette of
 * `--blacksmith-tool-*` surfaces so the content follows the theme instead of
 * hard-coding colours. What it costs: the illustrated header. The Tool base
 * deliberately omits the full editor header, and that was an accepted trade.
 */

function getBlacksmith() {
    return globalThis.game?.modules?.get?.('coffee-pub-blacksmith')?.api ?? null;
}

export class CodexBrowserWindow extends BlacksmithToolWindowBaseV2 {

    /**
     * The open instance, assigned in the constructor.
     *
     * Not `foundry.applications.instances`: that map is only written once the first
     * render COMPLETES, several awaits into `_doRender`, so two rapid opens both miss
     * it and both construct. Assigning synchronously before anything is awaited is
     * the guard that actually holds. (Same reasoning as
     * `CampaignBrowserWindow.openByKind` and Compendium Search's `activeWindow`.)
     */
    static openWindow = null;

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: WINDOWS.CODEX_BROWSER,
            // Listed in full: mergeObject REPLACES arrays rather than merging them, so
            // omitting the base class here silently strips the Tool shell styling.
            classes: ['blacksmith-window-tool', 'librarian-window', 'librarian-codex-browser-window'],
            position: { width: 480, height: 820 },
            window: { title: 'Codex', resizable: true, minimizable: true, icon: 'fa-solid fa-book' },
            windowSizeConstraints: { minWidth: 360, minHeight: 320 },
            // Light is the initial theme, matching the rest of the Tool windows a
            // GM keeps open beside the canvas (Compendium Search, Shop) — the codex
            // sat alone in dark because that is what Squire's tray looked like, not
            // because anything about the codex wanted it. `panel-codex.css` draws
            // its surfaces, text tones and dividers from the `--blacksmith-tool-*`
            // family, so the panel follows whichever the user picks; brand accent
            // and state colours stay literal on purpose — a theme may repaint a
            // surface, but not meaning.
            //
            // Anyone who has already picked a theme keeps it: `_loadToolThemePreference`
            // reads localStorage and only falls back to this when nothing is stored.
            toolTheme: 'light',
            rememberPosition: true,
            // Unchanged from the CampaignBrowserWindow era on purpose: position,
            // title-bar mode and theme all hang off this key, so renaming it silently
            // resets all three for anyone who had moved the window.
            windowPositionKey: `${WINDOWS.CODEX_BROWSER}-position`
        }
    );

    constructor(options = {}) {
        super(options);
        CodexBrowserWindow.openWindow = this;
    }

    /**
     * Add Entry, in the title bar rather than inside the panel.
     *
     * The panel's template used to render this and a `…` as icons under a "Codex"
     * heading of its own, directly beneath the window's title bar — a duplicate
     * title row, styled by a class that only existed in Squire's tray stylesheet.
     * The window owns its chrome now, which is the whole point of the Tool shell.
     *
     * **There is deliberately no `…` action here.** The Tool shell already puts one
     * in the title bar for its own controls menu, and a header action is mirrored
     * into that same menu (`window-tool-base.js:354`) — so a `codex-menu` action
     * produced two adjacent `…` buttons, the second of which opened a *second*
     * context menu on top of the first. The codex actions are nested as a submenu
     * of the shell's menu instead; see `_getToolContextMenuItems`.
     *
     * The panel's delegated click handler still recognises `.codex-titlebar-menu`
     * and `.add-codex-button`, so a different host is free to render its own.
     */
    getToolHeaderActions() {
        const actions = [];
        if (game.user.isGM) {
            actions.push({
                id: 'codex-add',
                icon: 'fa-solid fa-bookmark',
                label: 'Add Codex Entry',
                onClick: () => getCodexPanel()._onAddEntry()
            });
        }
        return actions;
    }

    /**
     * Nest the codex actions as a submenu of the shell's controls menu.
     *
     * The base builds its list from `getToolHeaderActions()` plus the inherited
     * header controls, then a separator, then the shell's own entries (title-bar
     * mode, Theme, Minimize, Reset Position, Close). It maps each header action to
     * `{name, icon, disabled, callback}` and **drops any `submenu`** — so a submenu
     * cannot be declared through a header action and has to be inserted here.
     *
     * Placed immediately before the first separator, which puts "Codex options"
     * with Add Codex Entry in the module's own group rather than among the shell's
     * window controls. Theme is the base's own precedent for the shape.
     */
    _getToolContextMenuItems() {
        const items = super._getToolContextMenuItems?.() ?? [];
        const submenu = getCodexPanel().getCodexMenuItems();
        if (!submenu.length) return items;

        const entry = {
            name: 'Codex options',
            icon: 'fa-solid fa-ellipsis-h',
            submenu
        };
        // Append rather than splice when the base emitted no separator — that only
        // happens when it had no items of its own to separate, so the end is the
        // module's group.
        const separatorIndex = items.findIndex(item => item?.separator);
        if (separatorIndex === -1) items.push(entry);
        else items.splice(separatorIndex, 0, entry);
        return items;
    }

    async getData() {
        // `librarian-panel-host` + `data-position="left"` is what panel-codex.css keys
        // off. Deliberately NOT `librarian-tray`, which carries the tray's own fixed
        // positioning and slide-in transform and would fight the window frame.
        return {
            appId: this.id,
            // Search and tag filters go in the TOOLBAR, not on top of the list —
            // the shape Blacksmith's Compendium Search uses, where the toolbar is
            // chrome and the body is nothing but results. The slot is filled by
            // `CodexPanel._renderFilters` during the panel's own render, because the
            // panel is what knows the current filter state and the tag vocabulary.
            showToolBar: true,
            // Carries `librarian-panel-host` + `data-position="left"` for the same
            // reason the body wrapper does: every rule in panel-codex.css is scoped
            // to it. Without it the filters render as unstyled wrapping text — the
            // tag cloud in particular becomes a wall of words that overflows the bar.
            toolBarLeft: '<div class="librarian-panel-host" data-position="left" data-codex-filters></div>',
            bodyContent: '<div class="librarian-panel-host librarian-codex-browser-body" data-position="left">'
                + '<div class="panel-container" data-panel="panel-codex"></div>'
                + '</div>',
            showToolFooter: true,
            toolFooterLeft: '<span class="librarian-codex-status" data-codex-status></span>',
            toolFooterRight: '<span class="librarian-codex-hint">Double-click a pin to reveal</span>'
        };
    }

    /**
     * Claim the panel for this window and render it here.
     *
     * On every render, not only the first: whichever host rendered most recently is
     * the one a pin click or a notification should reach.
     */
    async _onRender(context, options) {
        await super._onRender?.(context, options);

        const panel = getCodexPanel();
        registerCampaignPanel('codex', {
            panel,
            getElement: () => this.element ?? null,
            reveal: () => {
                // v13 renamed bringToTop -> bringToFront; the old name still resolves
                // through a shim that logs a deprecation on every call.
                (this.bringToFront ?? this.bringToTop)?.call(this);
                if (this.minimized) this.maximize?.();
            }
        });

        await panel.render(this.element);
        this._bindStatusRefresh();
        this.updateStatus();
    }

    /**
     * Keep the footer count honest as the user filters.
     *
     * Listens on the window root, which is an ancestor of the panel container the
     * panel binds to — so bubbling reaches the panel's handler first and this sees
     * the post-filter DOM. Bound once and released on close; the Tool shell re-renders
     * its body, but this.element persists, so rebinding per render would stack.
     * @private
     */
    _bindStatusRefresh() {
        if (this._statusAbort || !this.element) return;
        this._statusAbort = new AbortController();
        const { signal } = this._statusAbort;
        const refresh = () => this.updateStatus();
        // The panel fires this after it has finished changing visibility. Listening
        // for `input` instead would read the DOM before the debounced search has run
        // and report a count one keystroke stale.
        this.element.addEventListener('librarian.codexFiltered', refresh, { signal });
        this.element.addEventListener('click', refresh, { signal });
    }

    /**
     * Footer count, in the shape Compendium Search uses ("17 in 9 sources").
     *
     * Read from the rendered DOM rather than from `panel.data`, so it reports what is
     * actually on screen — including entries a tag filter or search has hidden, which
     * is the number a reader wants when they are wondering where something went.
     */
    updateStatus() {
        const status = this.element?.querySelector('[data-codex-status]');
        if (!status) return;
        // The panel writes import / Auto-Link / auto-discovery progress into this same
        // slot. Those runs are long and their messages matter more than a count, so
        // leave them alone rather than overwriting on every stray click.
        if (getCodexPanel().isImporting) return;
        const entries = Array.from(this.element.querySelectorAll('.codex-entry'));
        if (!entries.length) {
            status.textContent = '';
            return;
        }
        const shown = entries.filter(el => el.style.display !== 'none').length;
        status.textContent = shown === entries.length
            ? `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`
            : `${shown} of ${entries.length} entries`;
    }

    _onClose(options) {
        this._statusAbort?.abort();
        this._statusAbort = null;
        // Identity-checked: a rebuild may already have replaced this entry, and
        // deleting blindly would drop the live window's registration.
        if (CodexBrowserWindow.openWindow === this) CodexBrowserWindow.openWindow = null;
        // Leave the registry pointing at nothing rather than at a dead element. A
        // caller that finds no panel skips quietly, which is correct for "not open".
        unregisterCampaignPanel('codex');
        return super._onClose?.(options);
    }
}

/** Open, or focus the one already open. */
export async function openCodexBrowser() {
    const existing = CodexBrowserWindow.openWindow;
    if (existing) {
        (existing.bringToFront ?? existing.bringToTop)?.call(existing);
        if (existing.minimized) existing.maximize?.();
        await existing.render(false);
        return existing;
    }
    const win = new CodexBrowserWindow();
    await win.render({ force: true });
    return win;
}
