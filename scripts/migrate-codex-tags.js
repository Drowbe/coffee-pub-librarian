// ==================================================================
// ===== MIGRATE-CODEX-TAGS – system.tags -> Blacksmith TagsAPI =====
// ==================================================================
// One-time migration of codex tags out of our own record data and into
// Blacksmith's central store, per `api-tags.md`: "Consuming modules do not
// store tags in their own record data."
//
// Run `dryRun` first and read the report. Nothing writes until `migrate`.
//
// FOUR CONSTRAINTS, none of them stylistic:
//
//  1. SEQUENTIAL, though no longer for safety. Blacksmith's August 2026 rebuild
//     serialises every tag write behind `_enqueue` (manager-tags.js:309), so
//     Promise.all would no longer lose writes -- it simply would not be faster,
//     since the queue serialises anyway. The loop stays sequential because it
//     lets each page be confirmed and flagged before the next begins, which is
//     what makes constraints 3 and 4 hold.
//  2. GM ONLY. A player routes every write to the GM as a delta, one socket
//     round trip each. 342 of those is not a migration, it is an outage.
//  3. IDEMPOTENT. 342 sequential full-setting writes is not atomic. An
//     interruption must leave a safe resting state that re-running completes,
//     so each page is marked done individually and already-done pages are
//     skipped.
//  4. CENTRAL WRITE CONFIRMED BEFORE LOCAL CLEAR. `system.tags` is only
//     emptied after the tags are read back out of the central store for that
//     page. Half-migrated is safe; half-cleared loses data.
//
// The per-page flag is the sentinel rather than a single world-level "done"
// setting, because a world-level flag cannot describe a partial run.
// ==================================================================

import { MODULE } from './const.js';
import { CODEX_PAGE_TYPE } from './data/codex-page-model.js';
import {
    CODEX_TAG_CONTEXT,
    getTagsApi,
    isTagsApiAvailable,
    normalizeTag
} from './utility-tags.js';

/** Page flag marking a page whose tags reached the central store. */
export const TAGS_MIGRATED_FLAG = 'codexTagsMigrated';

/**
 * Collect the codex pages this migration would touch.
 * @returns {{journal: JournalEntry|null, pages: JournalEntryPage[], reason?: string}}
 */
function gatherPages() {
    const journalId = game.settings.get(MODULE.ID, 'codexJournal');
    if (!journalId || journalId === 'none') {
        return { journal: null, pages: [], reason: 'No codex journal is configured.' };
    }
    const journal = game.journal.get(journalId);
    if (!journal) {
        return { journal: null, pages: [], reason: `Configured codex journal ${journalId} does not exist.` };
    }
    return { journal, pages: journal.pages.filter(p => p.type === CODEX_PAGE_TYPE) };
}

/**
 * Classify one page without writing anything.
 * @param {JournalEntryPage} page
 * @param {object} api - the Tags API
 */
function classify(page, api) {
    const raw = Array.isArray(page.system?.tags) ? page.system.tags.filter(Boolean) : [];
    // What the store will actually hold. Blacksmith lowercases and hyphenates, so the
    // raw value and the stored value differ for every multi-word tag.
    const local = [...new Set(raw.map(normalizeTag).filter(Boolean))];
    const central = api.getTags(CODEX_TAG_CONTEXT, page.uuid) ?? [];
    const done = page.getFlag(MODULE.ID, TAGS_MIGRATED_FLAG) === true;

    if (done) return { state: 'already-migrated', local, central };
    if (!local.length) return { state: 'no-tags', local, central };
    // Tags already centrally present but unflagged: a run that was interrupted
    // between the central write and the flag. Re-running is safe and completes it.
    if (central.length) return { state: 'resume', local, central };
    return { state: 'pending', local, central };
}

/**
 * Report what a migration would do. Writes nothing.
 * @returns {Promise<object>} summary, also logged to the console
 */
export async function dryRun() {
    const api = getTagsApi();
    if (!isTagsApiAvailable(api)) {
        const msg = 'Tags API unavailable — Blacksmith is absent or too old.';
        console.error(`${MODULE.TITLE} | ${msg}`);
        return { ok: false, reason: msg };
    }

    const { journal, pages, reason } = gatherPages();
    if (!journal) {
        console.error(`${MODULE.TITLE} | ${reason}`);
        return { ok: false, reason };
    }

    const buckets = { pending: [], resume: [], 'already-migrated': [], 'no-tags': [] };
    const vocabulary = new Set();
    for (const page of pages) {
        const { state, local } = classify(page, api);
        buckets[state].push({ name: page.name, uuid: page.uuid, tags: local });
        for (const tag of local) vocabulary.add(tag);
    }

    const summary = {
        ok: true,
        journal: journal.name,
        codexPages: pages.length,
        toMigrate: buckets.pending.length,
        toResume: buckets.resume.length,
        alreadyMigrated: buckets['already-migrated'].length,
        untagged: buckets['no-tags'].length,
        distinctTags: vocabulary.size,
        writesRequired: buckets.pending.length + buckets.resume.length
    };

    console.log(`${MODULE.TITLE} | Codex tag migration — DRY RUN, nothing written`);
    console.table(summary);
    console.log('Tag vocabulary:', [...vocabulary].sort());
    if (buckets.pending.length) console.log('Would migrate:', buckets.pending);
    if (buckets.resume.length) console.log('Would resume (central write already present, flag missing):', buckets.resume);

    ui.notifications.info(
        `Dry run: ${summary.writesRequired} of ${summary.codexPages} codex pages need migrating `
        + `(${summary.distinctTags} distinct tags). Nothing was written — see the console.`
    );
    return summary;
}

/**
 * Report the whole codex tag vocabulary, with entry counts and likely-duplicate
 * groupings. Writes nothing.
 *
 * Exists because the first dry run found 455 distinct tags across 342 entries -- more
 * tags than entries, so most are near-singletons -- and the console truncates a list
 * that long. Cleaning up BEFORE migrating matters more than it looks: Blacksmith's tag
 * registry is world-wide, not per-context, so every tag here joins a vocabulary shared
 * with every other Coffee Pub module and feeds their suggestion UI. Fixable afterwards
 * via Blacksmith's GM rename/delete, but far cheaper while the data is still only in
 * `system.tags` and nothing else reads it.
 *
 * @returns {Array<{tag: string, count: number, entries: string[]}>} sorted by count
 */
export function reportVocabulary() {
    const { journal, pages, reason } = gatherPages();
    if (!journal) {
        console.error(`${MODULE.TITLE} | ${reason}`);
        return [];
    }

    const byTag = new Map();
    for (const page of pages) {
        const raw = Array.isArray(page.system?.tags) ? page.system.tags.filter(Boolean) : [];
        for (const tag of new Set(raw.map(normalizeTag).filter(Boolean))) {
            if (!byTag.has(tag)) byTag.set(tag, []);
            byTag.get(tag).push(page.name);
        }
    }

    const rows = [...byTag.entries()]
        .map(([tag, entries]) => ({ tag, count: entries.length, entries }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

    // Singletons are where the noise lives -- a tag on one entry out of 342 is usually
    // a typo, a synonym of a tag that already exists, or test debris.
    const singletons = rows.filter(r => r.count === 1);

    // Cheap near-duplicate detection, deliberately dumb: collapse to letters only and
    // strip a trailing 's', so book/books and black-market/blackmarket group together.
    // It will not catch bcod vs black-cult-of-the-dragon -- abbreviations need eyes.
    const byShape = new Map();
    for (const row of rows) {
        const shape = row.tag.replace(/[^a-z]/g, '').replace(/s$/, '');
        if (!byShape.has(shape)) byShape.set(shape, []);
        byShape.get(shape).push(row.tag);
    }
    const nearDuplicates = [...byShape.values()].filter(group => group.length > 1);

    console.log(`${MODULE.TITLE} | Codex tag vocabulary — ${rows.length} distinct across ${pages.length} entries`);
    console.log(`Used once only: ${singletons.length}`);
    if (nearDuplicates.length) console.log('Likely duplicates (same letters, ignoring punctuation and plural):', nearDuplicates);
    console.table(rows.map(({ tag, count }) => ({ tag, count })));
    console.log('Singletons, with their entry:', singletons.map(r => `${r.tag} — ${r.entries[0]}`));
    console.log('Full detail:', rows);

    ui.notifications.info(
        `${rows.length} distinct tags, ${singletons.length} used only once, `
        + `${nearDuplicates.length} likely duplicate groups. See the console.`
    );
    return rows;
}

/**
 * Perform the migration. Safe to re-run; safe to interrupt.
 *
 * @param {object} [options]
 * @param {boolean} [options.clearLocal=true] Empty `system.tags` once the central
 *   write is confirmed. Pass false to leave the local copy in place for a
 *   verification pass, then re-run with it true.
 * @returns {Promise<object>} summary
 */
export async function migrate({ clearLocal = true } = {}) {
    if (!game.user.isGM) {
        const msg = 'Codex tag migration must be run by a GM — a player sends every write to the GM as a socket delta, one round trip per page.';
        ui.notifications.error(msg);
        return { ok: false, reason: msg };
    }

    const api = getTagsApi();
    if (!isTagsApiAvailable(api)) {
        const msg = 'Tags API unavailable — Blacksmith is absent or too old.';
        ui.notifications.error(msg);
        return { ok: false, reason: msg };
    }

    const { journal, pages, reason } = gatherPages();
    if (!journal) {
        ui.notifications.error(reason);
        return { ok: false, reason };
    }

    let migrated = 0, resumed = 0, skipped = 0;
    const failures = [];

    // Sequential so each page is confirmed and flagged before the next — see
    // constraints 1, 3 and 4 in the file header.
    for (const page of pages) {
        const { state, local } = classify(page, api);
        if (state === 'already-migrated' || state === 'no-tags') { skipped++; continue; }

        try {
            await api.setTags(CODEX_TAG_CONTEXT, page.uuid, local);

            // Read back before clearing. The central store is the destination; if
            // it did not take the write, the local copy is the only remaining copy.
            //
            // Compare NORMALIZED forms. `local` is already normalized above; comparing
            // the raw `system.tags` here would fail for every multi-word tag, since
            // "aquatic crypt" is stored as "aquatic-crypt" -- the page would never be
            // flagged and every re-run would redo it.
            const confirmed = (api.getTags(CODEX_TAG_CONTEXT, page.uuid) ?? []).map(normalizeTag);
            const ok = local.every(tag => confirmed.includes(tag));
            if (!ok) {
                failures.push(`${page.name}: central store did not confirm the write`);
                continue;
            }

            const update = { [`flags.${MODULE.ID}.${TAGS_MIGRATED_FLAG}`]: true };
            if (clearLocal) update['system.tags'] = [];
            await page.update(update);

            if (state === 'resume') resumed++; else migrated++;
        } catch (error) {
            failures.push(`${page.name}: ${error?.message ?? error}`);
            console.error(`${MODULE.TITLE} | Tag migration failed for "${page.name}":`, error);
        }
    }

    const summary = {
        ok: failures.length === 0,
        journal: journal.name,
        codexPages: pages.length,
        migrated, resumed, skipped,
        failed: failures.length,
        localCleared: clearLocal
    };
    console.log(`${MODULE.TITLE} | Codex tag migration complete`);
    console.table(summary);
    if (failures.length) console.error(`${MODULE.TITLE} | Failures:`, failures);

    const total = migrated + resumed;
    if (failures.length) {
        ui.notifications.error(
            `Codex tag migration: ${total} migrated, ${failures.length} failed. Re-run to retry — it is safe. See the console.`
        );
    } else {
        ui.notifications.info(`Codex tag migration complete: ${total} pages migrated, ${skipped} skipped.`);
    }
    return summary;
}
