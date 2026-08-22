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

/**
 * Codex category → FontAwesome icon.
 *
 * One copy, imported by both the panel and the pin manager. Squire kept a second
 * copy inside its pin manager which drifted from this one, so Establishments and
 * Landmarks silently fell through to the fa-book fallback on the canvas while
 * rendering correctly in the list.
 */
export const CODEX_CATEGORY_ICONS = Object.freeze({
    'No Category':    'fa-question-circle',
    'Artifacts':      'fa-gem',
    'Books':          'fa-book',
    'Characters':     'fa-user',
    'Establishments': 'fa-shop',
    'Events':         'fa-calendar-star',
    'Factions':       'fa-shield-cross',
    'Items':          'fa-box',
    'Landmarks':      'fa-monument',
    'Locations':      'fa-location-pin',
    'Lore':           'fa-scroll',
    'Maps':           'fa-map'
});

export const CODEX_CATEGORY_ICON_FALLBACK = 'fa-book';

/** Category → icon, falling back for user-created categories. */
export function getCodexCategoryIcon(category) {
    return CODEX_CATEGORY_ICONS[String(category ?? '').trim()] || CODEX_CATEGORY_ICON_FALLBACK;
}

/** Template paths, mirrored from the manifest layout. */
export const TEMPLATES = {
    PANEL_QUEST: `modules/${MODULE.ID}/templates/panel-quest.hbs`,
    WINDOW_QUEST: `modules/${MODULE.ID}/templates/window-quest.hbs`,
    TOOLTIP_PIN_QUEST_OBJECTIVE: `modules/${MODULE.ID}/templates/tooltip-pin-quests-objective.hbs`,
    PARTIAL_QUEST_ENTRY: `modules/${MODULE.ID}/templates/partials/quest-entry.hbs`,
    PANEL_CODEX: `modules/${MODULE.ID}/templates/panel-codex.hbs`,
    PANEL_CODEX_FILTERS: `modules/${MODULE.ID}/templates/panel-codex-filters.hbs`,
    WINDOW_CODEX: `modules/${MODULE.ID}/templates/window-codex.hbs`,
    WINDOW_CAMPAIGN_BROWSER: `modules/${MODULE.ID}/templates/window-campaign-browser.hbs`,
    WINDOW_DATA_EXPORT: `modules/${MODULE.ID}/templates/window-data-export.hbs`,
    PAGE_CODEX_FIELDS_EDIT: `modules/${MODULE.ID}/templates/page-codex-fields-edit.hbs`,
    PAGE_CODEX_FIELDS_VIEW: `modules/${MODULE.ID}/templates/page-codex-fields-view.hbs`
};

/** Window ids, registered with Blacksmith's window registry. */
export const WINDOWS = {
    QUEST_BROWSER: `${MODULE.ID}-quest-browser`,
    QUEST_EDITOR: `${MODULE.ID}-quest-editor`,
    CODEX_BROWSER: `${MODULE.ID}-codex-browser`,
    CODEX_EDITOR: `${MODULE.ID}-codex-editor`
};
