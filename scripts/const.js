/**
 * Module-wide constants.
 *
 * Loaded first from the manifest so every other file can import from here
 * without an initialisation order problem.
 */

export const MODULE = {
    ID: 'coffee-pub-librarian',
    NAME: 'LIBRARIAN',
    TITLE: 'Coffee Pub Librarian',
    AUTHOR: 'COFFEE PUB'
};

/**
 * Fully-qualified journal page subtype for codex entries.
 *
 * Codex entries are a document *kind*, not a view over one — they carry their
 * own data model and sheet — which is what makes this module their owner
 * rather than Blacksmith. Quest pages are deliberately NOT a subtype: they are
 * plain `text` pages, so only this one type needs migrating out of Squire.
 *
 * Declaring the subtype in the manifest is what makes existing pages load. A
 * page whose `type` names a module that is disabled or absent fails validation
 * at world load, one error per page — so this string, the manifest entry, and
 * the migration that rewrites Squire's pages have to agree exactly.
 */
export const CODEX_PAGE_TYPE = `${MODULE.ID}.codex`;

/** The subtype Squire owned before the split, migrated from, never written. */
export const LEGACY_CODEX_PAGE_TYPE = 'coffee-pub-squire.codex';
