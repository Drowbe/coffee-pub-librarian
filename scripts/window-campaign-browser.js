import { MODULE, TEMPLATES, WINDOWS } from './const.js';
import { registerCampaignPanel, unregisterCampaignPanel } from './campaign-panels.js';
import { getQuestPanel } from './quest-panel-instance.js';
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
import { BlacksmithWindowBaseV2 } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';

function getBlacksmith() {
    return globalThis.game?.modules?.get?.('coffee-pub-blacksmith')?.api ?? null;
}


/**
 * Standalone browser windows for quests, codex, and notes.
 *
 * These host the existing panel classes rather than reimplementing them. The
 * panels were always `render(hostElement)` classes that look for their own
 * `[data-panel="panel-x"]` container inside whatever they're given — the tray
 * was one such host, and there was never anything tray-specific about the
 * contract. So a window that supplies the same container is a second host, and
 * the panel neither knows nor cares.
 *
 * That is the whole reason this file is short. The alternative — rewriting
 * three browsers as native ApplicationV2 views — would reimplement roughly
 * 7,800 lines of working list rendering, filtering, pin placement, and
 * import/export to gain nothing that a container div doesn't already give.
 *
 * The panels' stylesheets key off `.librarian-panel-host[data-position="left"]`,
 * which the tray and this window's body both carry.
 */

/**
 * Quests only. The codex moved to its own Tool window — see window-codex-browser.js
 * for why the two stopped sharing a shell.
 *
 * Still a `KINDS` map rather than a flattened single case: quests are heading for a
 * list-plus-detail layout, and whatever that becomes will still want its
 * configuration in one readable block.
 */
const KINDS = {
    quest: {
        id: WINDOWS.QUEST_BROWSER,
        title: 'Quests',
        panelKey: 'panel-quest',
        headerIcon: 'fa-solid fa-flag',
        rootClass: 'quest-browser-window',
        position: { width: 520, height: 860 },
        constraints: { minWidth: 420, minHeight: 480 }
    }
};

export class CampaignBrowserWindow extends BlacksmithWindowBaseV2 {

    /**
     * Live window per kind, assigned in the constructor.
     *
     * Not `foundry.applications.instances`: that map isn't written until the
     * first render completes, several awaits into `_doRender`, so two rapid
     * opens both miss it and both construct. Assigning here — synchronously,
     * before anything is awaited — is the guard that actually holds.
     */
    static openByKind = new Map();

    static PARTS = {
        body: {
            template: TEMPLATES.WINDOW_CAMPAIGN_BROWSER
        }
    };

    static ACTION_HANDLERS = null;

    constructor(kind, options = {}) {
        const config = KINDS[kind];
        if (!config) throw new Error(`Coffee Pub Librarian | Unknown campaign browser kind: ${kind}`);

        const opts = foundry.utils.mergeObject({}, options);
        opts.id = config.id;
        opts.classes = ['librarian-window', 'quest-browser-window', config.rootClass];
        opts.position = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, config.position),
            opts.position || {}
        );
        opts.window = foundry.utils.mergeObject(
            { title: config.title, resizable: true, minimizable: true },
            opts.window || {}
        );
        opts.windowSizeConstraints = config.constraints;
        opts.rememberPosition = true;
        opts.windowPositionKey = `${config.id}-position`;

        super(opts);
        this.kind = kind;
        this.config = config;
        CampaignBrowserWindow.openByKind.set(kind, this);
    }

    _viewContext() {
        return {
            appId: this.id,
            panelKey: this.config.panelKey,
            headerIcon: this.config.headerIcon,
            headerTitle: this.config.title
        };
    }

    async getData() {
        return this._viewContext();
    }

    async _prepareContext(options) {
        const base = await super._prepareContext?.(options) ?? {};
        return foundry.utils.mergeObject(base, this._viewContext());
    }

    /**
     * Claim the panel for this window and render it here.
     *
     * Registration happens on every render, not only on first open: the tray
     * registers the same panels, and whichever host rendered most recently is
     * the one a pin click or a notification should reach.
     */
    async _onRender(context, options) {
        await super._onRender?.(context, options);

        const panel = this._getPanel();
        if (!panel) return;

        registerCampaignPanel(this.kind, {
            panel,
            getElement: () => this.element ?? null,
            reveal: () => {
                // v13 renamed bringToTop -> bringToFront; the old name still
                // resolves through a shim that logs a deprecation on every call.
                (this.bringToFront ?? this.bringToTop)?.call(this);
                if (this.minimized) this.maximize?.();
            }
        });

        await panel.render(this.element);
    }

    /** The panel instance this window hosts. One lazily-created panel per kind. */
    _getPanel() {
        if (this.kind === 'codex') return getCodexPanel();
        return getQuestPanel();
    }

    _onClose(options) {
        // Identity-checked: a rebuild may already have replaced this entry, and
        // deleting blindly would drop the live window's registration.
        if (CampaignBrowserWindow.openByKind.get(this.kind) === this) {
            CampaignBrowserWindow.openByKind.delete(this.kind);
        }
        // Leave the registry pointing at nothing rather than at a dead element.
        // A caller that finds no panel skips quietly, which is the correct
        // behaviour for "the browser isn't open".
        unregisterCampaignPanel(this.kind);
        super._onClose?.(options);
    }
}

/**
 * Open (or focus) the browser for a kind.
 *
 * Reuses the live instance when there is one, so a second launch focuses
 * rather than duplicating.
 */
export async function openCampaignBrowser(kind) {
    // The codex has its own window now. Routing here rather than at every call site
    // keeps `openCampaignBrowser('codex')` working — the menubar tool, the module
    // API, and `revealCampaignPanel` in campaign-panels.js all go through it.
    if (kind === 'codex') {
        const { openCodexBrowser } = await import('./window-codex-browser.js');
        return openCodexBrowser();
    }

    const config = KINDS[kind];
    if (!config) return null;

    const existing = CampaignBrowserWindow.openByKind.get(kind);
    if (existing) {
        (existing.bringToFront ?? existing.bringToTop)?.call(existing);
        if (existing.minimized) existing.maximize?.();
        await existing.render(false);
        return existing;
    }

    const win = new CampaignBrowserWindow(kind);
    await win.render(true);
    return win;
}

/**
 * Register both browsers with Blacksmith's window registry, so a toolbar, macro or
 * another module can open either by id without importing the class.
 *
 * The codex is registered here too even though its class lives elsewhere: the
 * registry is about ids and openers, and both openers route through
 * `openCampaignBrowser`.
 */
export function registerCampaignBrowserWindows() {
    const blacksmith = getBlacksmith();
    if (!blacksmith?.registerWindow) return false;

    const registrations = [
        ...Object.entries(KINDS).map(([kind, config]) => [config.id, config.title, kind]),
        [WINDOWS.CODEX_BROWSER, 'Codex', 'codex']
    ];

    let allOk = true;
    for (const [id, title, kind] of registrations) {
        const ok = blacksmith.registerWindow(id, {
            moduleId: MODULE.ID,
            title,
            open: async () => openCampaignBrowser(kind)
        });
        if (!ok) allOk = false;
    }
    return allOk;
}
