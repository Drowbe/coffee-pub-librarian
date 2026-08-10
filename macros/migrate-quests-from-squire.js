/**
 * One-time migration: hand quest data over from Squire to Librarian.
 *
 * Paste into a Script Macro and run as GM, with BOTH modules enabled.
 *
 * What it does, in order:
 *   1. Copies the quest settings (journal + categories) into Librarian.
 *   2. Copies `coffee-pub-squire.*` flags to `coffee-pub-librarian.*` on every
 *      page of the quest journal.
 *   3. Copies the per-user quest flags (pinned quest, active objective, and the
 *      collapse states).
 *   4. Re-stamps every quest and objective pin on every scene from
 *      `moduleId: coffee-pub-squire` to `coffee-pub-librarian`.
 *
 * Copies rather than moves: Squire's flags and settings are left in place, so
 * running this changes nothing about Squire and can be repeated safely. Deleting
 * Squire's copy happens when Squire's quest code is removed, not here.
 *
 * DRY_RUN is on by default. Read the report, then set it to false and re-run.
 */

const DRY_RUN = true;

const SQUIRE = 'coffee-pub-squire';
const LIBRARIAN = 'coffee-pub-librarian';

if (!game.user.isGM) {
    ui.notifications.error('This migration must be run by a GM.');
} else {
    const report = { settings: [], pages: 0, pageFlags: 0, userFlags: [], pins: 0, skipped: [] };

    // --- 1. Settings ---------------------------------------------------------
    for (const key of ['questJournal', 'questCategories']) {
        let value;
        try {
            value = game.settings.get(SQUIRE, key);
        } catch (error) {
            report.skipped.push(`setting ${key}: not registered by Squire`);
            continue;
        }
        if (value === undefined || value === null || value === 'none') {
            report.skipped.push(`setting ${key}: unset in Squire`);
            continue;
        }
        report.settings.push(`${key} = ${JSON.stringify(value)}`);
        if (!DRY_RUN) await game.settings.set(LIBRARIAN, key, value);
    }

    // --- 2. Page flags -------------------------------------------------------
    // Scoped to the quest journal rather than every journal in the world, so a
    // codex or notes page that happens to carry Squire flags is left alone.
    let questJournalId = null;
    try {
        questJournalId = game.settings.get(SQUIRE, 'questJournal');
    } catch (error) { /* handled below */ }

    const questJournal = questJournalId && questJournalId !== 'none'
        ? game.journal.get(questJournalId)
        : null;

    if (!questJournal) {
        report.skipped.push('page flags: no quest journal set in Squire');
    } else {
        for (const page of questJournal.pages) {
            const flags = page.flags?.[SQUIRE];
            if (!flags || !Object.keys(flags).length) continue;
            report.pages++;
            report.pageFlags += Object.keys(flags).length;
            if (!DRY_RUN) {
                await page.update({ [`flags.${LIBRARIAN}`]: foundry.utils.deepClone(flags) });
            }
        }
    }

    // --- 3. Per-user flags ---------------------------------------------------
    // Client-side quest state: which quest is pinned to the handle, which
    // objective is active, and what the user had collapsed.
    const USER_FLAGS = [
        'pinnedQuests',
        'activeObjectives',
        'questCardCollapsed',
        'questCollapsedCategories',
        'questTagCloudCollapsed'
    ];
    for (const key of USER_FLAGS) {
        const value = game.user.getFlag(SQUIRE, key);
        if (value === undefined) continue;
        report.userFlags.push(key);
        if (!DRY_RUN) await game.user.setFlag(LIBRARIAN, key, foundry.utils.deepClone(value));
    }

    // --- 4. Pins -------------------------------------------------------------
    // A pin's moduleId is what every list query filters on, so this is the step
    // that makes existing pins visible to Librarian. Matched on questUuid rather
    // than on type: the type strings are shared between the two modules, and
    // questUuid is what actually identifies a pin as quest content.
    const pins = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
    if (!pins?.list) {
        report.skipped.push('pins: Blacksmith pins API unavailable');
    } else {
        // `includeHiddenByFilter: true` is essential, not defensive. Without it
        // pins.list() omits anything hidden by a layer filter — and a pin for a
        // hidden objective is created hidden by design, so the pins most likely
        // to exist unnoticed are exactly the ones a default listing skips.
        const collect = (options) => {
            try {
                return pins.list({ ...options, moduleId: SQUIRE, includeHiddenByFilter: true }) || [];
            } catch (error) {
                report.skipped.push(`pins ${JSON.stringify(options)}: ${error.message}`);
                return [];
            }
        };

        const candidates = [];
        for (const scene of game.scenes) {
            for (const pin of collect({ sceneId: scene.id })) candidates.push([pin, scene.name]);
        }
        // Unplaced pins live in a world setting rather than on a scene, so a
        // per-scene sweep never sees them. They still carry a moduleId and would
        // be orphaned just the same.
        for (const pin of collect({ unplacedOnly: true })) candidates.push([pin, '(unplaced)']);

        const seen = new Set();
        for (const [pin, where] of candidates) {
            if (!pin?.config?.questUuid || seen.has(pin.id)) continue;
            seen.add(pin.id);
            report.pins++;
            if (!DRY_RUN) {
                try {
                    // update() resolves the pin's own location, so this is
                    // correct for placed and unplaced alike.
                    await pins.update(pin.id, { moduleId: LIBRARIAN });
                } catch (error) {
                    report.skipped.push(`pin ${pin.id} on ${where}: ${error.message}`);
                }
            }
        }
    }

    // --- Report --------------------------------------------------------------
    const lines = [
        `<h3>${DRY_RUN ? 'Quest migration — DRY RUN' : 'Quest migration — applied'}</h3>`,
        `<p><strong>Settings:</strong> ${report.settings.length ? report.settings.join('<br>') : 'none'}</p>`,
        `<p><strong>Pages:</strong> ${report.pages} page(s), ${report.pageFlags} flag group(s)</p>`,
        `<p><strong>User flags:</strong> ${report.userFlags.length ? report.userFlags.join(', ') : 'none'}</p>`,
        `<p><strong>Pins re-stamped:</strong> ${report.pins}</p>`
    ];
    if (report.skipped.length) {
        lines.push(`<p><strong>Skipped:</strong><br>${report.skipped.join('<br>')}</p>`);
    }
    if (DRY_RUN) {
        lines.push('<p><em>Nothing was changed. Set DRY_RUN to false and re-run to apply.</em></p>');
    }

    ChatMessage.create({
        content: lines.join(''),
        whisper: [game.user.id],
        speaker: { alias: 'Librarian Migration' }
    });
    console.log('Librarian | Quest migration report', report);
}
