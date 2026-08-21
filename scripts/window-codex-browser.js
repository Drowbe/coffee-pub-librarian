import { MODULE, WINDOWS } from './const.js';
import { registerCampaignPanel, unregisterCampaignPanel } from './campaign-panels.js';
import { getCodexPanel } from './codex-panel-instance.js';

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

const BlacksmithToolWindowBaseV2 = getBlacksmith()?.BlacksmithToolWindowBaseV2
    || getBlacksmith()?.getToolWindowBaseV2?.();

if (!BlacksmithToolWindowBaseV2) {
    throw new Error('Coffee Pub Librarian | BlacksmithToolWindowBaseV2 is unavailable for CodexBrowserWindow');
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
            // Dark is closest to the codex panel's existing skin, so the shell does not
            // fight the content while `panel-codex.css` is still colour-literal. The
            // user can switch, and the choice is remembered per tool.
            toolTheme: 'dark',
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
     * Add Entry and the `…` menu, in the title bar rather than inside the panel.
     *
     * The panel's template used to render both as icons under a "Codex" heading of
     * its own, directly beneath the window's title bar — a duplicate title row,
     * styled by a class that only existed in Squire's tray stylesheet. The window
     * owns its chrome now, which is the whole point of the Tool shell.
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
        actions.push({
            id: 'codex-menu',
            icon: 'fa-solid fa-ellipsis-h',
            label: 'Codex options',
            // `event` is null when this action is invoked from the controls context
            // menu rather than clicked as a title-bar button, so pass an anchor.
            onClick: event => getCodexPanel()._openTitlebarMenu(event, this.element)
        });
        return actions;
    }

    async getData() {
        // `librarian-panel-host` + `data-position="left"` is what panel-codex.css keys
        // off. Deliberately NOT `librarian-tray`, which carries the tray's own fixed
        // positioning and slide-in transform and would fight the window frame.
        return {
            appId: this.id,
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
        this.element.addEventListener('input', refresh, { signal });
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
