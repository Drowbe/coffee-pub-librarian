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

    // Codex tag migration (H2), GM-run from the console rather than automatically:
    // it rewrites tag data on every codex page and the GM should see the dry run
    // first. Deliberately not wired to a hook or a menu item — this runs once.
    //   game.modules.get('coffee-pub-librarian').api.migrateCodexTags.dryRun()
    //   game.modules.get('coffee-pub-librarian').api.migrateCodexTags.migrate()
    try {
        const { dryRun, migrate, reportVocabulary } = await import('./migrate-codex-tags.js');
        module.api.migrateCodexTags = { dryRun, migrate, reportVocabulary };
    } catch (error) {
        console.error(`${MODULE.TITLE} | Failed to load the codex tag migration:`, error);
    }

    // Quest reader audit (H12), console-run. Round-trips production quest pages and
    // synthetic import payloads through the writer and the parser, and reports any
    // field that does not survive. Writes nothing. Delete with the parser at A1.
    //   game.modules.get('coffee-pub-librarian').api.auditQuestReader.run()
    try {
        const audit = await import('./audit-quest-reader.js');
        module.api.auditQuestReader = audit;
    } catch (error) {
        console.error(`${MODULE.TITLE} | Failed to load the quest reader audit:`, error);
    }

    // ONE "Librarian" button, opening a secondary bar that carries Codex and Quests.
    //
    // These were two flat tools in the `campaign` group, which spent two slots of
    // menubar width on one module and left no room for anything Librarian grows
    // later. Blacksmith's secondary bars are the supported shape for exactly this:
    // a toggle tool opens a bar below the menubar, tab-like, and opening another
    // module's bar closes ours automatically.
    //
    // Neither the parent tool nor the bar items declare `supersedes`, and that is a
    // decision rather than an oversight.
    //
    // `registerMenubarTool` accepts `supersedes: [toolId]` to drop or refuse a
    // duplicate registration in either load order, and Blacksmith kept the mechanism
    // specifically because "the Librarian extraction meets the same problem" — a user
    // with one module updated and the other not would see two Quests icons.
    //
    // But Blacksmith also removed its own three `supersedes` entries once it was
    // clear they "were written to protect users who do not exist", and left the rule:
    // ask who the affected user is before building the affordance. Squire has already
    // shipped 13.8.1 with its quest and codex code deleted, so there is no release
    // pairing in which both modules register these tools. The answer is nobody.
    //
    // Revisit only if Librarian ships to a world that updates the two independently.
    // Squire's ids were `squire-quests` / `squire-codex`.
    if (typeof blacksmith.registerMenubarTool === 'function') {
        try {
            // Opens the browser and closes the bar behind it: the bar is a launcher,
            // not a mode, so leaving it open after a choice would be a second thing
            // for the user to dismiss.
            const openBrowser = async (kind, notReadyMessage) => {
                const open = game.modules.get(MODULE.ID)?.api?.openCampaignBrowser;
                if (typeof open !== 'function') {
                    ui.notifications.warn(notReadyMessage);
                    return;
                }
                await open(kind);
                blacksmith.closeSecondaryBar?.();
            };

            // Registered before the tool that toggles it — `toggleSecondaryBar` on an
            // unregistered type is a no-op, and the parent button is clickable from
            // the moment it renders.
            const barRegistered = typeof blacksmith.registerSecondaryBarType === 'function'
                ? await blacksmith.registerSecondaryBarType('librarian', {
                    size: 'default',
                    // Manual, not `auto`: the bar is a menu the user opens on purpose,
                    // and a timed close would pull it out from under a slow reader.
                    persistence: 'manual'
                })
                : false;

            if (barRegistered) {
                blacksmith.registerSecondaryBarItem('librarian', 'librarian-bar-codex', {
                    icon: 'fa-solid fa-book',
                    label: 'Codex',
                    tooltip: 'Open the codex',
                    zone: 'left',
                    group: 'browsers',
                    order: 10,
                    onClick: () => openBrowser('codex', 'The codex is not ready yet.')
                });
                blacksmith.registerSecondaryBarItem('librarian', 'librarian-bar-quests', {
                    icon: 'fa-solid fa-flag',
                    label: 'Quests',
                    tooltip: 'Open the quest log',
                    zone: 'left',
                    group: 'browsers',
                    order: 20,
                    onClick: () => openBrowser('quest', 'The quest log is not ready yet.')
                });
            }

            blacksmith.registerMenubarTool('librarian', {
                icon: 'fa-solid fa-books',
                name: 'librarian',
                title: 'Librarian',
                tooltip: 'Codex and quests',
                onClick: async () => {
                    // Without a registered bar there is nothing to toggle, so fall
                    // back to the codex rather than presenting a dead button. This is
                    // the old single-tool behaviour and is what an older Blacksmith
                    // gets.
                    if (!barRegistered) {
                        await openBrowser('codex', 'The codex is not ready yet.');
                        return;
                    }
                    blacksmith.toggleSecondaryBar('librarian');
                },
                zone: 'middle',
                group: 'campaign',
                groupOrder: 20,
                order: 204,
                moduleId: MODULE.ID,
                gmOnly: false,
                leaderOnly: false,
                visible: true,
                // Toggleable so the button carries an active state; the mapping below
                // is what keeps that state in sync when the bar closes by other means
                // (Escape, or another module's bar opening over ours).
                toggleable: barRegistered,
                active: false
            });

            if (barRegistered) blacksmith.registerSecondaryBarTool?.('librarian', 'librarian');

            blacksmith.renderMenubar?.(true);
        } catch (error) {
            console.error(`${MODULE.TITLE} | Failed to register the menubar tools:`, error);
        }
    }
    console.log(`${MODULE.TITLE} | Ready`);
});
