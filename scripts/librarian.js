import { MODULE, TEMPLATES, WINDOWS, CODEX_PAGE_TYPE } from './const.js';
import { registerSettings } from './settings.js';
import { registerHelpers } from './helpers.js';
import { CodexPageModel } from './data/codex-page-model.js';
import { CodexPageSheet } from './sheets/codex-page-sheet.js';

/**
 * Entry point.
 *
 * Quests are the first feature to arrive from Squire. Codex follows, and brings
 * the codex page subtype and its migration with it.
 */

function getBlacksmith() {
    return game.modules.get('coffee-pub-blacksmith')?.api ?? null;
}

/**
 * Blacksmith publishes its API during its own ready hook, which may run after
 * ours. Every async ready path needs its own wait rather than assuming an
 * earlier one has finished — and an ES module that throws during evaluation is
 * dead for the rest of the session, so failures are logged, not thrown.
 */
async function waitForBlacksmith() {
    if (globalThis.BlacksmithAPI?.waitForReady) {
        try {
            await globalThis.BlacksmithAPI.waitForReady();
        } catch (error) {
            console.error(`${MODULE.TITLE} | Error waiting for Blacksmith:`, error);
        }
    }
    return getBlacksmith();
}

Hooks.once('init', () => {
    registerSettings();
    // Handlebars helpers are a global namespace. Squire registers its own set,
    // so while both modules were enabled Librarian's templates were quietly
    // borrowing them — and every one of them broke the moment Squire was
    // disabled. Librarian registers its own.
    registerHelpers();

    // The codex page subtype: data model + sheet.
    //
    // This MUST be `init`, not `ready`. Foundry validates documents as the world
    // loads, before ready — a page whose `type` names a subtype nobody has
    // registered fails validation, one console error per page, and the page will
    // not render. Registering late is indistinguishable from not registering.
    Object.assign(CONFIG.JournalEntryPage.dataModels, {
        [CODEX_PAGE_TYPE]: CodexPageModel
    });
    foundry.applications.apps.DocumentSheetConfig.registerSheet(JournalEntryPage, MODULE.ID, CodexPageSheet, {
        types: [CODEX_PAGE_TYPE],
        makeDefault: true,
        label: 'Librarian Codex Entry'
    });
});

Hooks.once('ready', async () => {
    const blacksmith = await waitForBlacksmith();

    if (!blacksmith) {
        console.error(
            `${MODULE.TITLE} | Coffee Pub Blacksmith is required and its API was not available.`
        );
        return;
    }

    // Established before anything that can throw: registration blocks below
    // each write to it, and a failure in one used to leave the next assigning
    // to undefined — turning one broken registration into several.
    const module = game.modules.get(MODULE.ID);
    module.api = module.api ?? {};

    if (typeof blacksmith.registerModule === 'function') {
        blacksmith.registerModule(MODULE.ID, {
            name: MODULE.NAME,
            version: game.modules.get(MODULE.ID)?.version
        });
    }

    // Quest/objective pin types, taxonomy and canvas events.
    try {
        const { initQuestPins } = await import('./manager-quest-pins.js');
        await initQuestPins();
    } catch (error) {
        console.error(`${MODULE.TITLE} | Failed to initialise quest pins:`, error);
    }

    // Codex pin type, taxonomy and lifecycle. Separate from the quest pins on
    // purpose — see the header of manager-codex-pins.js.
    try {
        const { initCodexPins } = await import('./manager-codex-pins.js');
        await initCodexPins();
    } catch (error) {
        console.error(`${MODULE.TITLE} | Failed to initialise codex pins:`, error);
    }

    // The quest list renders one partial per entry.
    try {
        const questEntry = await fetch(TEMPLATES.PARTIAL_QUEST_ENTRY).then(r => r.text());
        Handlebars.registerPartial('quest-entry', questEntry);
    } catch (error) {
        console.error(`${MODULE.TITLE} | Failed to register the quest-entry partial:`, error);
    }

    // Browser windows (quests + codex) and their menubar launchers.
    try {
        const { registerCampaignBrowserWindows, openCampaignBrowser } = await import('./window-campaign-browser.js');
        registerCampaignBrowserWindows();
        module.api.openCampaignBrowser = openCampaignBrowser;
        // Kept as an alias: campaign-panels.js reveals a panel by asking the
        // module to open its browser, and other modules may already call this.
        module.api.openQuestBrowser = openCampaignBrowser;
    } catch (error) {
        console.error(`${MODULE.TITLE} | Failed to register the campaign browsers:`, error);
    }

    // Single-quest editor.
    try {
        const { registerQuestWindow, openQuestWindow } = await import('./window-quest.js');
        registerQuestWindow();
        module.api.openQuestWindow = openQuestWindow;
    } catch (error) {
        console.error(`${MODULE.TITLE} | Failed to register the quest window:`, error);
    }

    // Journal page changes -> whichever browser is open.
    try {
        const { initJournalRouting } = await import('./manager-journal-routing.js');
        initJournalRouting();
    } catch (error) {
        console.error(`${MODULE.TITLE} | Failed to register journal routing:`, error);
    }

    // Single-entry codex editor.
    try {
        const { registerCodexWindow, openCodexWindow } = await import('./window-codex.js');
        registerCodexWindow();
        module.api.openCodexWindow = openCodexWindow;
    } catch (error) {
        console.error(`${MODULE.TITLE} | Failed to register the codex window:`, error);
    }

    if (typeof blacksmith.registerMenubarTool === 'function') {
        try {
            blacksmith.registerMenubarTool('librarian-quests', {
                icon: 'fa-solid fa-flag',
                name: 'librarian-quests',
                title: 'Quests',
                tooltip: 'Open the quest log',
                onClick: async () => {
                    const open = game.modules.get(MODULE.ID)?.api?.openCampaignBrowser;
                    if (typeof open !== 'function') {
                        ui.notifications.warn('The quest log is not ready yet.');
                        return;
                    }
                    await open('quest');
                },
                zone: 'middle',
                group: 'campaign',
                groupOrder: 20,
                order: 204,
                moduleId: MODULE.ID,
                gmOnly: false,
                leaderOnly: false,
                visible: true,
                toggleable: false,
                active: false
            });
            blacksmith.registerMenubarTool('librarian-codex', {
                icon: 'fa-solid fa-book',
                name: 'librarian-codex',
                title: 'Codex',
                tooltip: 'Open the codex',
                onClick: async () => {
                    const open = game.modules.get(MODULE.ID)?.api?.openCampaignBrowser;
                    if (typeof open !== 'function') {
                        ui.notifications.warn('The codex is not ready yet.');
                        return;
                    }
                    await open('codex');
                },
                zone: 'middle',
                group: 'campaign',
                groupOrder: 20,
                order: 205,
                moduleId: MODULE.ID,
                gmOnly: false,
                leaderOnly: false,
                visible: true,
                toggleable: false,
                active: false
            });
            blacksmith.renderMenubar?.(true);
        } catch (error) {
            console.error(`${MODULE.TITLE} | Failed to register the menubar tools:`, error);
        }
    }

    console.log(`${MODULE.TITLE} | Ready`);
});
