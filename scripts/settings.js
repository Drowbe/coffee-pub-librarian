import { MODULE } from './const.js';

/**
 * Settings for the quest feature.
 *
 * Carried over from Squire under the same keys. The keys are deliberately
 * unchanged so a world that migrates keeps its journal selection and category
 * list — the values live under a different module namespace, so the migration
 * copies them across rather than the settings finding them on their own.
 */
export function registerSettings() {

    game.settings.register(MODULE.ID, 'headingH2Quests', {
        name: 'Quests',
        hint: 'Where quests are stored and how they are categorised.',
        scope: 'world',
        config: true,
        default: '',
        type: String
    });

    game.settings.register(MODULE.ID, 'questJournal', {
        name: 'Quest Journal',
        hint: 'The journal to use for quest entries. Each quest is a separate page in this journal.',
        scope: 'world',
        config: true,
        type: String,
        choices: () => {
            // Built as a function so the list reflects journals as they exist
            // when the settings window opens, not as they were at registration.
            const choices = { none: '- Select Journal -' };
            for (const journal of game.journal?.contents ?? []) {
                choices[journal.id] = journal.name;
            }
            return choices;
        },
        default: 'none'
    });

    game.settings.register(MODULE.ID, 'questCategories', {
        name: 'Quest Categories',
        hint: 'Available categories for quests.',
        scope: 'world',
        config: true,
        type: Array,
        default: ['Main Quest', 'Side Quest']
    });

    // Read by both quest content writers -- `_mergeJournalContent` and
    // `_generateJournalContentFromImport`. It was read at both sites and registered
    // nowhere, and `game.settings.get` THROWS on an unregistered key, so every quest
    // import died on its first quest and the outer handler reported `Invalid JSON.`
    // The JSON was always fine. See TODO C5; it came across from Squire without its
    // registration.
    game.settings.register(MODULE.ID, 'autoAddPartyMembers', {
        name: 'Auto-Add Party Members to Imported Quests',
        hint: 'When importing quests, add every party member as a participant. Applies to newly imported quests and to quests updated by a re-import.',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE.ID, 'headingH2Codex', {
        name: 'Codex',
        hint: 'Where codex entries are stored.',
        scope: 'world',
        config: true,
        default: '',
        type: String
    });

    game.settings.register(MODULE.ID, 'codexJournal', {
        name: 'Codex Journal',
        hint: 'The journal to use for codex entries. Each entry is a separate page in this journal.',
        scope: 'world',
        config: true,
        type: String,
        choices: () => {
            const choices = { none: '- Select Journal -' };
            for (const journal of game.journal?.contents ?? []) {
                choices[journal.id] = journal.name;
            }
            return choices;
        },
        default: 'none'
    });

    game.settings.register(MODULE.ID, 'pinSound', {
        scope: 'client',
        config: false,
        type: String,
        default: ''
    });

    game.settings.register(MODULE.ID, 'unpinSound', {
        scope: 'client',
        config: false,
        type: String,
        default: ''
    });
}
