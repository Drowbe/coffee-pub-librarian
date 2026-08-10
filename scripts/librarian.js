import { MODULE } from './const.js';

/**
 * Entry point.
 *
 * Nothing is registered here yet. Codex and Quests arrive from Squire in the
 * first content commits; this establishes the module, its dependency on
 * Blacksmith, and the readiness contract every other Coffee Pub module follows.
 */

function getBlacksmith() {
    return game.modules.get('coffee-pub-blacksmith')?.api ?? null;
}

/**
 * Blacksmith publishes its API during its own ready hook, which may run after
 * ours. Every async ready path needs its own wait rather than assuming a
 * previous one has already finished — and an ES module that throws during
 * evaluation is dead for the rest of the session, so failures are logged and
 * absorbed rather than thrown.
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
    console.log(`${MODULE.TITLE} | Initialising`);
});

Hooks.once('ready', async () => {
    const blacksmith = await waitForBlacksmith();

    if (!blacksmith) {
        console.error(
            `${MODULE.TITLE} | Coffee Pub Blacksmith is required and its API was not available.`
        );
        return;
    }

    if (typeof blacksmith.registerModule === 'function') {
        blacksmith.registerModule(MODULE.ID, {
            name: MODULE.NAME,
            version: game.modules.get(MODULE.ID)?.version
        });
    }

    console.log(`${MODULE.TITLE} | Ready`);
});
