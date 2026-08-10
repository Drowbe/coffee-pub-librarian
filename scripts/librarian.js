import { MODULE, TEMPLATES, WINDOWS } from './const.js';
import { registerSettings } from './settings.js';

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

    // The quest list renders one partial per entry.
    try {
        const questEntry = await fetch(TEMPLATES.PARTIAL_QUEST_ENTRY).then(r => r.text());
        Handlebars.registerPartial('quest-entry', questEntry);
    } catch (error) {
        console.error(`${MODULE.TITLE} | Failed to register the quest-entry partial:`, error);
    }

    // Browser window + its menubar launcher.
    try {
        const { registerQuestBrowserWindow, openQuestBrowser } = await import('./window-quest-browser.js');
        registerQuestBrowserWindow();
        module.api.openQuestBrowser = openQuestBrowser;
    } catch (error) {
        console.error(`${MODULE.TITLE} | Failed to register the quest browser:`, error);
    }

    // Single-quest editor.
    try {
        const { registerQuestWindow, openQuestWindow } = await import('./window-quest.js');
        registerQuestWindow();
        module.api.openQuestWindow = openQuestWindow;
    } catch (error) {
        console.error(`${MODULE.TITLE} | Failed to register the quest window:`, error);
    }

    if (typeof blacksmith.registerMenubarTool === 'function') {
        try {
            blacksmith.registerMenubarTool('librarian-quests', {
                icon: 'fa-solid fa-flag',
                name: 'librarian-quests',
                title: 'Quests',
                tooltip: 'Open the quest log',
                onClick: async () => {
                    const open = game.modules.get(MODULE.ID)?.api?.openQuestBrowser;
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
            blacksmith.renderMenubar?.(true);
        } catch (error) {
            console.error(`${MODULE.TITLE} | Failed to register the Quests menubar tool:`, error);
        }
    }

    console.log(`${MODULE.TITLE} | Ready`);
});
