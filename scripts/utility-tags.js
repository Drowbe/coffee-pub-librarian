// ==================================================================
// ===== UTILITY-TAGS – Blacksmith TagsAPI access for the codex =====
// ==================================================================
// `api-tags.md` is explicit: "All tag assignments (record -> tags) are
// stored in a Blacksmith world setting. Consuming modules do not store
// tags in their own record data." This module is the single place
// Librarian talks to that store, so the contract below is stated once.
//
// THE RECORD ID IS THE PAGE UUID, and that is load-bearing.
//
// `recordId` is an opaque string to Blacksmith. Two reasons it must be
// the uuid here rather than the page id, both confirmed against their
// source rather than assumed:
//
//   1. `getRecordsByTag()` returns bare recordIds. A uuid is the only
//      generic route back to a Foundry document; a page id would force
//      every reader to scan journals to resolve it.
//   2. It was ALSO true, briefly, that pin assignments shared this context
//      bucket -- Blacksmith's pin mirror wrote a row keyed by pin id, and
//      after migrating 342 entries the bucket held 344. That is fixed
//      upstream: the mirror now only adds pin tags to the shared registry
//      and writes no assignment row, and `PinManager.purgeLegacyTagRows()`
//      removes the ones already written. Reason 1 is what the uuid choice
//      rests on now.
//
//      Recorded because two wrong explanations were written here first, and
//      the durable fact is narrower than either. Blacksmith does not define
//      a pin id format at all -- the pin schema defaults `id: ''`
//      (manager-pins-schema.js:333) and nothing in the pins code generates
//      one; the id is whatever the calling module supplies. OUR pin ids are
//      v4 UUIDs because WE generate them with `crypto.randomUUID()`
//      (manager-codex-pins.js:270). Any code that told entity rows from pin
//      rows by string shape was reading a fact about Librarian, not a
//      contract with Blacksmith, and that is why no such code survives here.
//
// CONCURRENCY: safe as of Blacksmith's August 2026 tag-write rebuild, but
// await anyway. `setTags` used to be an unserialised read-modify-write of
// the whole assignments object, so N concurrent calls each cloned the same
// snapshot and N-1 writes vanished silently. That is fixed at the
// primitive: `_mutate` is now the single entry point and `_enqueue` chains
// every cycle behind the last (manager-tags.js:309-330). Players send a
// delta rather than a whole computed object, which closed the worse bug --
// a stale player snapshot used to overwrite every context key for every
// module.
//
// So Promise.all no longer loses data. It also gains nothing, because the
// queue serialises regardless. Every call here is awaited: it reads more
// honestly against a queue, and it keeps callers correct if they ever run
// against an older Blacksmith.
// ==================================================================

import { MODULE } from './const.js';

/** The tag context for codex entries. Registered in Blacksmith's tag-taxonomy.json. */
export const CODEX_TAG_CONTEXT = `${MODULE.ID}.codex`;

/**
 * Normalize a tag the way Blacksmith does, so callers can compare like with like.
 *
 * **The store rewrites what you give it.** `normalizeTag` -> `normalizePinGroup`
 * (manager-pins-schema.js:122) lowercases and collapses whitespace to hyphens, so
 * `"Aquatic Crypt"` is stored as `aquatic-crypt`. Anything that writes tags and then
 * reads them back to confirm MUST normalize first, or it compares a raw value against
 * a canonical one and concludes the write failed.
 *
 * Mirrored here rather than imported because it is not on the public API surface.
 * If Blacksmith ever exports it, delete this and use theirs.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeTag(value) {
    if (value == null) return '';
    const raw = String(value).trim();
    if (!raw) return '';
    return raw.toLowerCase().replace(/\s+/g, '-');
}

/** Reach the Tags API, or null when Blacksmith is absent or too old. */
export function getTagsApi() {
    return game.modules.get('coffee-pub-blacksmith')?.api?.tags ?? null;
}

/** True when the Tags API is loaded and usable. */
export function isTagsApiAvailable(tags) {
    const api = tags ?? getTagsApi();
    return typeof api?.isAvailable === 'function' && api.isAvailable();
}

/**
 * Read a codex page's tags from the central store.
 * Returns [] when the API is unavailable, so callers render an untagged
 * entry rather than throwing.
 *
 * @param {string} pageUuid
 * @returns {string[]}
 */
export function getCodexTags(pageUuid) {
    const api = getTagsApi();
    if (!isTagsApiAvailable(api) || !pageUuid) return [];
    return api.getTags(CODEX_TAG_CONTEXT, pageUuid) ?? [];
}

/**
 * Write a codex page's tags to the central store.
 *
 * @param {string} pageUuid
 * @param {string[]} tags
 * @returns {Promise<boolean>} whether the write was attempted
 */
export async function setCodexTags(pageUuid, tags) {
    const api = getTagsApi();
    if (!isTagsApiAvailable(api) || !pageUuid) return false;
    await api.setTags(CODEX_TAG_CONTEXT, pageUuid, Array.isArray(tags) ? tags : []);
    return true;
}

/**
 * Move a record's tags from one id to another, then drop the old row.
 *
 * The codex conversion path deletes a legacy `text` page and creates a typed
 * one, so the uuid changes and the assignment would orphan silently. Blacksmith
 * has no `moveRecord` yet and offered to add one if a consumer needed it -- we
 * are that consumer. Keep this as the single call site so it can collapse into
 * theirs later.
 *
 *
 * @param {string} oldUuid
 * @param {string} newUuid
 * @returns {Promise<string[]>} the tags carried across
 */
export async function moveCodexTags(oldUuid, newUuid) {
    const api = getTagsApi();
    if (!isTagsApiAvailable(api) || !oldUuid || !newUuid || oldUuid === newUuid) return [];
    const tags = api.getTags(CODEX_TAG_CONTEXT, oldUuid) ?? [];
    if (!tags.length) return [];
    await api.setTags(CODEX_TAG_CONTEXT, newUuid, tags);
    await api.deleteRecordTags(CODEX_TAG_CONTEXT, oldUuid);
    return tags;
}

/** Drop a codex page's tags entirely, e.g. when the page is deleted. */
export async function clearCodexTags(pageUuid) {
    const api = getTagsApi();
    if (!isTagsApiAvailable(api) || !pageUuid) return;
    await api.deleteRecordTags(CODEX_TAG_CONTEXT, pageUuid);
}

/**
 * Every tag currently assigned to a codex entry, with a count of entries
 * carrying it. This is the codex tag cloud's vocabulary.
 *
 * **This is O(registry) API calls, and that is Blacksmith's gap, not ours.**
 * `getRegistry()` is world-wide rather than per-context and there is no
 * `getTagCounts(contextKey)`, so scoping to the codex means asking
 * `getRecordsByTag` once per registry tag. Blacksmith asked to be told when a
 * consumer hit this; we have. Replace this body if they add the scoped call.
 *
 * Every row in this context is a codex entry. Pin rows used to share the bucket
 * and were filtered out here by string shape; Blacksmith removed the pin mirror's
 * assignment writes, so there is nothing to filter and nothing to sniff. Do not
 * reintroduce a shape test -- see the header for why it was never safe.
 *
 * @returns {Array<{tag: string, count: number}>} sorted by tag
 */
export function getCodexTagCounts() {
    const api = getTagsApi();
    if (!isTagsApiAvailable(api)) return [];
    const out = [];
    for (const tag of api.getRegistry() ?? []) {
        const records = api.getRecordsByTag(CODEX_TAG_CONTEXT, tag) ?? [];
        if (records.length) out.push({ tag, count: records.length });
    }
    return out.sort((a, b) => a.tag.localeCompare(b.tag));
}
