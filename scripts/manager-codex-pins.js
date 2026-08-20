/**
 * manager-codex-pins.js — codex pins, via the Blacksmith Pins API.
 *
 * The single point of contact between Librarian's codex feature and the Pins
 * API. Panels import from here; they never reach for
 * game.modules.get('coffee-pub-blacksmith')?.api?.pins directly.
 *
 * Sits beside manager-quest-pins.js rather than merging with it, and the two
 * duplicate ~150 lines of scaffolding on purpose. Blacksmith's annotation model
 * is expected to dissolve most of this wrapper, and two feature-scoped files can
 * shrink or disappear independently; one merged file could not.
 *
 * Derived from Squire's manager-pins.js by deleting the note slice, not by
 * extracting the codex one — extraction is what silently dropped module-level
 * constants during the quest port.
 *
 * Flag contract: Librarian stores ONLY `pinId` on journal pages. Position
 * (x, y, sceneId) and design are owned by Blacksmith, never cached in flags.
 */

import { getCampaignPanel, refreshCampaignPanel, revealCampaignPanel } from './campaign-panels.js';
import { MODULE, getCodexCategoryIcon } from './const.js';
import { trackModuleTimeout } from './timer-utils.js';

// Initial design defaults per pin type. GM customises further via Configure Pin.
const PIN_DEFAULTS = {
    codex: {
        size: { w: 50, h: 50 }, shape: 'circle',
        style: { fill: '#06387a', stroke: '#ffffff', strokeWidth: 5, iconColor: '#ffffff' },
        dropShadow: true, textLayout: 'right', textDisplay: 'hover',
        textColor: '#ffffff', textSize: 18, textMaxLength: 100, textMaxWidth: 30,
        textScaleWithPin: true, lockProportions: false, allowDuplicatePins: false,
        eventAnimations: {
            hover:       { animation: 'ripple',      sound: 'interface-button-01' },
            click:       { animation: null,          sound: null                  },
            doubleClick: { animation: 'scale-large', sound: 'book-open-02'        },
            add:         { animation: 'rotate',      sound: 'interface-pop-02'    },
            delete:      { animation: 'fade',        sound: 'interface-error-07'  }
        },
        config: { blacksmithAccess: 'gm', blacksmithVisibility: 'visible' }
    }
};

// ============================================================================
// TAXONOMY
// ============================================================================

const PIN_TAXONOMY_KIND = Object.freeze({
    codex: 'codex'
});

const LEGACY_PIN_TYPE = Object.freeze({
    codex: 'codex-pin'
});

// Legacy type strings → canonical keys (for migration reads only).
const LEGACY_PIN_TYPE_FIX_MAP = Object.freeze({
    ...Object.fromEntries(
        Object.entries(LEGACY_PIN_TYPE).map(([k, wrong]) => [wrong, PIN_TAXONOMY_KIND[k]])
    ),
    'Codex Pin':    'codex'
});

/** Normalize a codex category display name to a tag slug. Works for built-in and user-created categories. */
function _codexCategoryToTag(category) {
    if (!category || category === 'No Category') return null;
    return category.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || null;
}

/** Codex category → FontAwesome icon class. */
// Category → icon lives in const.js (CODEX_CATEGORY_ICONS). This file used to
// keep its own copy, which drifted from the tray's and silently gave
// Establishments/Landmarks the fa-book fallback on the canvas.


// Codex placement state (module-level so cleanup can run from anywhere).
let _codexPinPlacement = null;
const CODEX_PIN_CURSOR_CLASS        = 'librarian-codex-pin-placement';
const CODEX_PIN_CANVAS_CURSOR_CLASS = 'librarian-codex-pin-placement-canvas';

// ============================================================================
// API HELPERS (exported — used by panels that call pins API indirectly)
// ============================================================================

/** Return the Blacksmith Pins API, or undefined if unavailable. */
export function getPinsApi() {
    return game.modules.get('coffee-pub-blacksmith')?.api?.pins;
}

/**
 * Return true if the Pins API is loaded and available.
 * @param {object} [pins] - Optional cached reference; falls back to getPinsApi().
 */
export function isPinsApiAvailable(pins) {
    const api = pins ?? getPinsApi();
    return typeof api?.isAvailable === 'function' && api.isAvailable();
}

/**
 * Return the canonical `pin.type` key for a Squire pin kind.
 * @param {'codex'} kind
 */
export function getPinType(kind) {
    return PIN_TAXONOMY_KIND[kind] ?? kind;
}

/**
 * True if `pinType` matches the canonical or legacy type for `kind`.
 * @param {string|null|undefined} pinType
 * @param {'codex'} kind
 */
export function isPinCategory(pinType, kind) {
    if (!pinType || typeof pinType !== 'string') return false;
    return pinType === getPinType(kind) || pinType === LEGACY_PIN_TYPE[kind];
}

// ============================================================================
// LIST HELPERS
// ============================================================================

/**
 * List Squire pins matching a kind (canonical + legacy type), deduped by id.
 * @param {object} pins - Pins API instance
 * @param {'codex'} kind
 * @param {{ unplacedOnly?: boolean, sceneId?: string }} [opts]
 */
export function listPinsByKind(pins, kind, opts = {}) {
    if (!pins?.list) return [];
    const base     = { moduleId: MODULE.ID, ...opts };
    const canonical = getPinType(kind);
    const legacy    = LEGACY_PIN_TYPE[kind];
    const primary   = pins.list({ ...base, type: canonical }) || [];
    const secondary = legacy && legacy !== canonical
        ? (pins.list({ ...base, type: legacy }) || [])
        : [];
    const byId = new Map();
    for (const p of [...primary, ...secondary]) {
        if (p?.id) byId.set(p.id, p);
    }
    return [...byId.values()];
}

function _calculateCodexPinOwnership(page) {
    const isVisible = (page?.ownership?.default ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    const gmUsers = {};
    game.users.forEach(user => {
        if (user.isGM) gmUsers[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    });
    return {
        default: isVisible ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER : CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
        users: gmUsers
    };
}

// ============================================================================
// PRIVATE DESIGN HELPERS
// ============================================================================

/**
 * Get the GM's saved design for a type via Configure Pin "Default for [type]".
 * Returns {} if unavailable (strips id/type/moduleId to avoid polluting PinData).
 */
function _getPinTypeDefaultDesign(pins, kind) {
    if (!isPinsApiAvailable(pins) || typeof pins.getDefaultPinDesign !== 'function') return {};
    try {
        const raw = pins.getDefaultPinDesign(MODULE.ID, getPinType(kind)) || {};
        if (!raw || typeof raw !== 'object') return {};
        const { type: _t, id: _i, moduleId: _m, ...rest } = raw;
        return rest;
    } catch (_) { return {}; }
}

/** Apply extra PinData keys from type defaults (animations, allowDuplicates, etc.). */
function _applyPinTypeDefaultExtras(pinData, pinTypeDefault) {
    if (!pinTypeDefault || typeof pinTypeDefault !== 'object') return;
    for (const key of ['eventAnimations', 'allowDuplicatePins', 'lockProportions', 'iconText']) {
        if (pinTypeDefault[key] !== undefined) {
            pinData[key] = foundry.utils.deepClone(pinTypeDefault[key]);
        }
    }
}

/**
 * Merge the Squire initial defaults (PIN_DEFAULTS) with the GM's saved
 * Configure Pin defaults for a given kind. Never mutates the JSON defaults.
 * @param {object} pins
 * @param {'codex'} kind
 */
function _buildMergedDesign(pins, kind) {
    const typeDefault = _getPinTypeDefaultDesign(pins, kind);
    return foundry.utils.mergeObject(
        foundry.utils.deepClone(PIN_DEFAULTS[kind] ?? {}),
        typeDefault,
        { inplace: false }
    );
}

/** Validate and clamp a PinData size object. */
function _safeSize(size, fallback) {
    if (size && typeof size.w === 'number' && typeof size.h === 'number') return size;
    return fallback;
}

/** Resolve live taxonomy tags for a pin kind; returns null if unavailable. */
function _getModuleTaxonomyTags(kind) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins) || typeof pins.getModuleTaxonomy !== 'function') return null;
    return pins.getModuleTaxonomy(MODULE.ID)?.[getPinType(kind)]?.tags ?? null;
}

/** Derive codex pin tags from the category name. Works for any category including user-created ones. */
function _codexCategoryToPinTags(category) {
    const tag = _codexCategoryToTag(category);
    return tag ? [tag] : [];
}

/**
 * Codex category → Font Awesome icon HTML for the canvas pin.
 *
 * `customIcon` is the entry's own `system.categoryIcon` when the GM set one. The
 * tray has always honoured it; the pin did not, so a custom category icon showed
 * on the card and not on the map.
 *
 * @param {string} category
 * @param {string} [customIcon] full class string, e.g. 'fa-solid fa-dragon'
 */
function _codexCategoryToImage(category, customIcon = '') {
    const custom = String(customIcon || '').trim();
    if (custom) return custom.startsWith('<i') ? custom : `<i class="${custom}"></i>`;
    return `<i class="fa-solid ${getCodexCategoryIcon(category)}"></i>`;
}

// ============================================================================
// SHARED HELPERS
// ============================================================================

function _isPermissionDeniedError(error) {
    const msg = String(error?.message || error || '').toLowerCase();
    return msg.includes('permission denied') || msg.includes('lacks permission') || msg.includes('permission to update setting');
}

// ============================================================================
// CODEX PINS
// ============================================================================

/**
 * Create a codex pin (unplaced or placed immediately).
 * @param {object} opts
 * @param {string}  opts.entryUuid
 * @param {string}  opts.entryName
 * @param {string}  [opts.entryCategory='']
 * @param {number}  [opts.x]
 * @param {number}  [opts.y]
 * @param {string}  [opts.sceneId]
 * @returns {Promise<object|null>}
 */
export async function createCodexPin(opts) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return null;
    const { entryUuid, entryName, entryCategory = '', x, y, sceneId } = opts;
    const page = await fromUuid(entryUuid);
    if (!page) return null;

    const design     = _buildMergedDesign(pins, 'codex');
    const ownership  = _calculateCodexPinOwnership(page);
    const tags       = _codexCategoryToPinTags(entryCategory);
    const image      = _codexCategoryToImage(entryCategory, page.system?.categoryIcon);

    const pinData = {
        id:              crypto.randomUUID(),
        moduleId:        MODULE.ID,
        type:            getPinType('codex'),
        tags,
        text:            entryName,
        image,
        size:            _safeSize(design.size, PIN_DEFAULTS.codex.size),
        shape:           design.shape ?? 'circle',
        style:           design.style ?? PIN_DEFAULTS.codex.style,
        dropShadow:      design.dropShadow ?? false,
        textLayout:      design.textLayout ?? 'right',
        textDisplay:     design.textDisplay ?? 'hover',
        textColor:       design.textColor ?? '#ffffff',
        textSize:        design.textSize ?? 12,
        textMaxLength:   design.textMaxLength ?? 0,
        textMaxWidth:    design.textMaxWidth ?? 30,
        textScaleWithPin:design.textScaleWithPin ?? true,
        lockProportions: design.lockProportions ?? false,
        allowDuplicatePins: design.allowDuplicatePins ?? false,
        eventAnimations: design.eventAnimations ?? foundry.utils.deepClone(PIN_DEFAULTS.codex.eventAnimations),
        ownership,
        config: {
            blacksmithAccess:     PIN_DEFAULTS.codex.config.blacksmithAccess,
            blacksmithVisibility: (page.ownership?.default ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER ? 'visible' : 'hidden',
            codexUuid:     entryUuid,
            codexCategory: entryCategory
        }
    };
    _applyPinTypeDefaultExtras(pinData, _getPinTypeDefaultDesign(pins, 'codex'));

    const hasPlacement = typeof sceneId === 'string' && Number.isFinite(x) && Number.isFinite(y);
    if (hasPlacement) { pinData.x = x; pinData.y = y; }

    try {
        if (typeof pins.whenReady === 'function') await pins.whenReady();
        const created = await pins.create(pinData, hasPlacement ? { sceneId } : undefined);
        if (created?.id) {
            await page.setFlag(MODULE.ID, 'pinId', created.id);
        }
        if (hasPlacement && typeof pins.reload === 'function') await pins.reload({ sceneId });
        return created ?? null;
    } catch (err) {
        console.error('Coffee Pub Librarian | createCodexPin:', err);
        return null;
    }
}

/**
 * Delete a codex pin and clear the page pinId flag.
 * @param {string} entryUuid
 */
export async function deleteCodexPin(entryUuid) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;
    const page  = await fromUuid(entryUuid);
    const pinId = page?.getFlag(MODULE.ID, 'pinId');

    if (pinId) {
        try { await pins.delete(pinId); } catch (e) { console.warn('Coffee Pub Librarian | deleteCodexPin:', e); }
    } else if (pins.list) {
        // Fallback: find by config.codexUuid in case page flag is missing.
        const found = [
            ...listPinsByKind(pins, 'codex', {}),
            ...listPinsByKind(pins, 'codex', { unplacedOnly: true })
        ].find(p => p?.config?.codexUuid === entryUuid);
        if (found?.id) { try { await pins.delete(found.id); } catch (e) { console.warn('Coffee Pub Librarian | deleteCodexPin:', e); } }
    }

    if (page) await page.setFlag(MODULE.ID, 'pinId', null);
    const sceneId = canvas?.scene?.id;
    if (sceneId && typeof pins.reload === 'function') {
        try { await pins.reload({ sceneId }); } catch (_) {}
    }
}

/**
 * Unplace a codex pin from the canvas without deleting it.
 * @param {string} entryUuid
 */
export async function unplaceCodexPin(entryUuid) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;
    const page  = await fromUuid(entryUuid);
    if (!page) return;
    let pinId = page.getFlag(MODULE.ID, 'pinId');

    if (!pinId) {
        const found = listPinsByKind(pins, 'codex', {}).find(p => p?.config?.codexUuid === entryUuid);
        if (found?.id) {
            pinId = found.id;
            await page.setFlag(MODULE.ID, 'pinId', pinId);
        }
    }
    if (!pinId) return;

    const live = pins.get?.(pinId) ?? null;
    if (!live?.sceneId) return;

    try {
        if (typeof pins.unplace === 'function') await pins.unplace(pinId);
        else if (typeof pins.update === 'function') await pins.update(pinId, { unplace: true }, { sceneId: live.sceneId });
    } catch (e) {
        console.warn('Coffee Pub Librarian | unplaceCodexPin:', e);
        ui.notifications.warn('Could not unplace the codex pin. Try again on the scene where it appears.');
        return;
    }
    if (live.sceneId && typeof pins.reload === 'function') {
        try { await pins.reload({ sceneId: live.sceneId }); } catch (_) {}
    }
}

/**
 * Update codex pin ownership to match current entry visibility.
 * @param {string} entryUuid
 */
export async function updateCodexPinVisibility(entryUuid) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;
    const page  = await fromUuid(entryUuid);
    const pinId = page?.getFlag(MODULE.ID, 'pinId');
    if (!pinId) return;
    const isVisible  = (page.ownership?.default ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    const ownership  = _calculateCodexPinOwnership(page);
    const live       = pins.get?.(pinId);
    try {
        await pins.update(pinId, {
            ownership,
            config: { ...(live?.config || {}), blacksmithVisibility: isVisible ? 'visible' : 'hidden' }
        });
    } catch (e) {
        console.warn('Coffee Pub Librarian | updateCodexPinVisibility:', e);
    }
}

/**
 * Warn the GM when a codex pin's visibility is edited directly in Configure Pin.
 *
 * Codex pin visibility is DERIVED from the entry's ownership, not configured:
 *  - the pin's `ownership` (not `blacksmithVisibility`) is what actually gates
 *    players, so flipping this to 'visible' on a hidden entry shows them nothing;
 *  - `updateCodexPinVisibility()` re-derives it whenever the entry is revealed or
 *    hidden, so the edit is silently reverted later.
 *
 * The edit is therefore a no-op that looks like it worked. Say so, rather than
 * let the GM believe they revealed something. Reveal the entry in the tray and
 * the pin follows.
 *
 * Self-limiting: our own sync writes always patch visibility to the derived
 * value, so they never trip the warning.
 */
async function _warnIfCodexPinVisibilityEdited(evt) {
    try {
        if (!game.user?.isGM) return;
        // Only react when this update actually carried a visibility value.
        const next = evt?.patch?.config?.blacksmithVisibility;
        if (next !== 'visible' && next !== 'hidden') return;

        const entryUuid = evt.pin?.config?.codexUuid;
        if (!entryUuid) return;
        const page = await fromUuid(entryUuid);
        if (!page) return;

        const derived = (page.ownership?.default ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER
            ? 'visible'
            : 'hidden';
        if (next === derived) return;

        ui.notifications.warn(
            `Codex pin visibility follows the codex entry, not the pin — this change won't reach players and will be overwritten. `
            + `Use the visibility toggle on "${page.name}" in the codex browser instead.`
        );
    } catch (e) {
        console.warn('Coffee Pub Librarian | _warnIfCodexPinVisibilityEdited:', e);
    }
}

/**
 * Update codex pin text, image, tags, and config after entry changes.
 * @param {string} entryUuid
 * @param {{ entryName?: string, entryCategory?: string }} [opts]
 */
export async function updateCodexPin(entryUuid, opts = {}) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;
    const page  = await fromUuid(entryUuid);
    const pinId = page?.getFlag(MODULE.ID, 'pinId');
    if (!pinId) return;

    const taxonomyTags  = _getModuleTaxonomyTags('codex');
    const entryName     = String(opts.entryName || page?.name || '').trim();
    const entryCategory = String(opts.entryCategory || '').trim();

    const patch = {
        text:  entryName || page?.name || '',
        image: _codexCategoryToImage(entryCategory, page.system?.categoryIcon),
        tags:  _codexCategoryToPinTags(entryCategory),
        config: { codexUuid: entryUuid, codexCategory: entryCategory }
    };
    try {
        await pins.update(pinId, patch);
    } catch (e) {
        console.warn('Coffee Pub Librarian | updateCodexPin:', e);
    }
}

/**
 * Pan the canvas to a pin and ping it.
 *
 * Panels must not reach for
 * `pins.panTo` themselves; this file is the only place that touches the pins API.
 *
 * Verifies the pin is on the scene being viewed rather than trusting the caller.
 * Callers gate their button on `pinOnActiveScene`, but that is computed when the
 * panel last refreshed — change scene without a refresh and the button goes stale.
 * Acting on it would pan the CURRENT canvas to another scene's coordinates: a
 * viewport jump to nothing, with a ping on empty ground.
 *
 * @param {string} pinId
 * @returns {Promise<boolean>} false when the pin is unavailable or elsewhere
 */
export async function panToPin(pinId) {
    if (!pinId) return false;
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins) || typeof pins.panTo !== 'function') {
        ui.notifications.warn('Canvas pins are not available.');
        return false;
    }

    const pin = pins.get?.(pinId) ?? null;
    if (!pin) {
        ui.notifications.warn('That pin no longer exists.');
        return false;
    }
    if (!pin.sceneId) {
        ui.notifications.info('That pin is not placed on any scene.');
        return false;
    }
    if (pin.sceneId !== canvas?.scene?.id) {
        const sceneName = game.scenes?.get(pin.sceneId)?.name || 'another scene';
        ui.notifications.info(`Pinned on ${sceneName} — open that scene to see it.`);
        return false;
    }

    try {
        await pins.panTo(pinId, { ping: { animation: 'ping', sound: 'interface-ping-01' } });
        return true;
    } catch (error) {
        console.warn('Coffee Pub Librarian | panToPin:', error);
        return false;
    }
}

/**
 * Reconcile codex page pinId flags against live Blacksmith data. GM only.
 * Clears pinId when the referenced pin no longer exists.
 */
export async function reconcileCodexPins() {
    if (!game.user.isGM) return;
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;
    const journalId = game.settings.get(MODULE.ID, 'codexJournal');
    const journal   = journalId && journalId !== 'none' ? game.journal.get(journalId) : null;
    if (!journal) return;
    for (const page of journal.pages.contents) {
        const storedPinId = page.getFlag(MODULE.ID, 'pinId');
        if (!storedPinId) continue;
        const exists = typeof pins.exists === 'function' ? pins.exists(storedPinId) : !!pins.get?.(storedPinId);
        if (!exists) await page.setFlag(MODULE.ID, 'pinId', null);
    }
}

/**
 * Begin interactive placement of a codex pin on the current canvas scene.
 * @param {string} entryUuid
 * @param {string} entryName
 * @param {string} entryCategory
 */
export async function beginCodexPinPlacement(entryUuid, entryName, entryCategory) {
    if (!canvas?.scene || !canvas?.app?.view) {
        ui.notifications.warn('Canvas is not ready. Open a scene to place a codex pin.');
        return;
    }
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) {
        ui.notifications.warn('Codex pins require the Blacksmith module.');
        return;
    }

    const page = await fromUuid(entryUuid);
    if (!page) return;

    // Guard: check if already placed via API (live source of truth).
    const placed = listPinsByKind(pins, 'codex', {}).find(p => p?.config?.codexUuid === entryUuid && p.sceneId);
    if (placed?.id) {
        if (placed.sceneId === canvas.scene.id) {
            ui.notifications.warn('This codex entry is already pinned on this scene. Unplace it first to move it.');
        } else {
            ui.notifications.warn('This codex entry is pinned on another scene. Unplace it first to pin here.');
        }
        return;
    }

    // Clear stale page flag if the referenced pin no longer exists.
    const storedPinId = page.getFlag(MODULE.ID, 'pinId');
    if (storedPinId && !(typeof pins.exists === 'function' ? pins.exists(storedPinId) : !!pins.get?.(storedPinId))) {
        await page.setFlag(MODULE.ID, 'pinId', null);
    }

    if (_codexPinPlacement) _clearCodexPinPlacement();

    ui.notifications.info('Click on the map to place the codex pin. Press Esc to cancel.');
    document.body.classList.add(CODEX_PIN_CURSOR_CLASS);
    document.body.style.cursor = 'crosshair';
    const view = canvas.app.view;
    view.classList.add(CODEX_PIN_CANVAS_CURSOR_CLASS);

    const sizePx    = PIN_DEFAULTS.codex.size.w;
    const previewEl = document.createElement('div');
    previewEl.className      = 'codex-pin-preview';
    previewEl.dataset.shape  = 'circle';
    previewEl.style.setProperty('--codex-pin-width',        `${sizePx}px`);
    previewEl.style.setProperty('--codex-pin-height',       `${sizePx}px`);
    previewEl.style.setProperty('--codex-pin-fill',         PIN_DEFAULTS.codex.style.fill);
    previewEl.style.setProperty('--codex-pin-stroke',       PIN_DEFAULTS.codex.style.stroke);
    previewEl.style.setProperty('--codex-pin-stroke-width', `${PIN_DEFAULTS.codex.style.strokeWidth}px`);
    previewEl.innerHTML = `<div class="codex-pin-preview-inner">${_codexCategoryToImage(entryCategory)}</div>`;
    document.body.appendChild(previewEl);

    const onPointerMove = (event) => {
        previewEl.style.left = `${event.clientX}px`;
        previewEl.style.top  = `${event.clientY}px`;
    };

    const onPointerDown = async (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();

        const rect    = view.getBoundingClientRect();
        const localPos = canvas.stage?.toLocal({ x: event.clientX - rect.left, y: event.clientY - rect.top });
        if (!localPos) {
            ui.notifications.warn('Unable to place pin: canvas position unavailable.');
            _clearCodexPinPlacement();
            return;
        }

        const freshPage = await fromUuid(entryUuid);
        if (!freshPage) { _clearCodexPinPlacement(); return; }

        // Delete any existing codex pin for this entry before re-placing to avoid duplicates.
        // Check both the active scene and the unplaced store.
        const existingPin =
            listPinsByKind(pins, 'codex', {}).find(p => p?.config?.codexUuid === entryUuid) ||
            listPinsByKind(pins, 'codex', { unplacedOnly: true }).find(p => p?.config?.codexUuid === entryUuid);
        if (existingPin?.id) {
            try {
                await pins.delete(existingPin.id, existingPin.sceneId ? { sceneId: existingPin.sceneId } : undefined);
            } catch (e) {
                console.warn('Coffee Pub Librarian | Auto-delete codex pin before re-place:', e);
            }
        }

        const created = await createCodexPin({
            entryUuid,
            entryName,
            entryCategory,
            sceneId: canvas.scene.id,
            x: localPos.x,
            y: localPos.y
        });
        if (!created?.id) {
            ui.notifications.error('Failed to create codex pin.');
            _clearCodexPinPlacement();
            return;
        }
        await freshPage.setFlag(MODULE.ID, 'pinId', created.id);
        _clearCodexPinPlacement();
        ui.notifications.info('Codex pin placed.');
    };

    const onContextMenu = (event) => {
        event.preventDefault();
        event.stopPropagation();
        _clearCodexPinPlacement();
        ui.notifications.info('Codex pin placement cancelled.');
    };
    const onKeyDown = (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            _clearCodexPinPlacement();
            ui.notifications.info('Codex pin placement cancelled.');
        }
    };

    view.addEventListener('pointerdown', onPointerDown, true);
    view.addEventListener('contextmenu', onContextMenu, true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointermove', onPointerMove);
    _codexPinPlacement = { view, previewEl, onPointerDown, onPointerMove, onContextMenu, onKeyDown };
}

function _clearCodexPinPlacement() {
    if (!_codexPinPlacement) return;
    const { view, previewEl, onPointerDown, onPointerMove, onContextMenu, onKeyDown } = _codexPinPlacement;
    view?.removeEventListener('pointerdown', onPointerDown, true);
    view?.removeEventListener('contextmenu', onContextMenu, true);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('pointermove', onPointerMove);
    previewEl?.remove();
    document.body.classList.remove(CODEX_PIN_CURSOR_CLASS);
    document.body.style.cursor = '';
    view?.classList.remove(CODEX_PIN_CANVAS_CURSOR_CLASS);
    _codexPinPlacement = null;
}

/**
 * Migrate codex `codexPinId` flags → standardized `pinId`.
 * Also clears stale `codexSceneId` flags. GM-only, runs once on init.
 */
async function _migrateCodexPinFlags() {
    if (!game.user.isGM) return;
    const journalId = game.settings.get(MODULE.ID, 'codexJournal');
    const journal   = journalId && journalId !== 'none' ? game.journal.get(journalId) : null;
    if (!journal) return;
    for (const page of journal.pages.contents) {
        const codexPinId = page.getFlag(MODULE.ID, 'codexPinId');
        if (codexPinId) {
            await page.setFlag(MODULE.ID, 'pinId', codexPinId);
            await page.unsetFlag(MODULE.ID, 'codexPinId');
        }
        // codexSceneId is no longer tracked — Blacksmith owns position.
        const codexSceneId = page.getFlag(MODULE.ID, 'codexSceneId');
        if (codexSceneId !== undefined && codexSceneId !== null) {
            await page.unsetFlag(MODULE.ID, 'codexSceneId');
        }
    }
}

// ============================================================================
// LIFECYCLE — EVENT HANDLERS & CONTEXT MENUS (internal)
// ============================================================================

let _pinManagerController = null;
let _contextMenuDisposers = [];
let _pinManagerInitialized = false;

let _codexSyncPending = false;
let _codexSyncTimer   = null;

function _scheduleCodexPanelRefresh() {
    _codexSyncPending = true;
    if (_codexSyncTimer) clearTimeout(_codexSyncTimer);
    _codexSyncTimer = trackModuleTimeout(async () => {
        _codexSyncTimer = null;
        if (!_codexSyncPending) return;
        _codexSyncPending = false;
        await refreshCampaignPanel('codex');
    }, 50);
}

function _registerContextMenuItems(pins) {
    // Codex pins carry no context-menu items of their own today. The disposer
    // list and this hook are kept because teardown walks them and because the
    // codex-vs-quest split is expected to grow items here, not lose them.
    if (!pins?.registerContextMenuItem) return;
    _contextMenuDisposers.forEach(d => { try { if (typeof d === 'function') d(); } catch (_) {} });
    _contextMenuDisposers = [];
}

/**
 * Open the codex panel (tray expanded, codex tab) and scroll to / highlight an
 * entry. Shared by the codex pin doubleClick handler and the menubar notification
 * click handlers in manager-notifications.js.
 * @param {string} codexUuid - The codex journal page UUID
 */
export async function focusCodexInPanel(codexUuid) {
    if (!codexUuid) return;
    await revealCampaignPanel('codex');
    const codexPanel = getCampaignPanel('codex');
    if (!codexPanel) return;
    const tryFocus = () => {
        // Prefer the panel's own focus: it records the expansion, so the entry
        // stays open across the next re-render. The raw-DOM fallback below only
        // sets a class, which any render would immediately undo.
        if (codexPanel._focusEntry) return codexPanel._focusEntry(codexUuid);
        const entry = document.querySelector(`.codex-entry[data-uuid="${codexUuid}"]`);
        if (!entry) return false;
        const section = entry.closest('.codex-section');
        if (section) section.classList.remove('collapsed');
        entry.classList.remove('collapsed');
        entry.classList.add('codex-highlighted');
        entry.scrollIntoView({ behavior: 'smooth', block: 'center' });
        trackModuleTimeout(() => entry.classList.remove('codex-highlighted'), 2000);
        return true;
    };
    tryFocus();
    trackModuleTimeout(tryFocus, 200);
    trackModuleTimeout(tryFocus, 500);
    trackModuleTimeout(tryFocus, 1000);
}

function _registerEventHandlers(pins) {
    if (!pins?.on) return;
    const signal = _pinManagerController.signal;

    // Register type friendly names
    if (typeof pins.registerPinType === 'function') {
        try {
            pins.registerPinType(MODULE.ID, getPinType('codex'),     'Codex Pin');
        } catch (_) {}
    }

    // Codex — doubleClick opens codex panel
    pins.on('doubleClick', async (evt) => {
        const pin = evt?.pin;
        if (!pin) return;
        if (pin.moduleId != null && pin.moduleId !== MODULE.ID) return;
        const codexUuid = pin.config?.codexUuid;
        if (!codexUuid) return;
        await focusCodexInPanel(codexUuid);
    }, { moduleId: MODULE.ID, signal });

    // ---- Lifecycle events -------------------------------------------------------

    // deleted: clear the pinId flag from the codex page it belonged to.
    pins.on('deleted', (evt) => {
        const codexUuid = evt.pin?.config?.codexUuid ?? evt.config?.codexUuid;
        if (codexUuid) {
            fromUuid(codexUuid).then(page => {
                if (!page) return;
                const storedId = page.getFlag(MODULE.ID, 'pinId');
                if (evt.pinId && storedId !== evt.pinId) return;
                page.setFlag(MODULE.ID, 'pinId', null).then(() => _scheduleCodexPanelRefresh());
            });
        }
    }, { moduleId: MODULE.ID, signal });

    // unplaced: refresh the panel.
    pins.on('unplaced', (evt) => {
        if (evt.pin?.config?.codexUuid) _scheduleCodexPanelRefresh();
    }, { moduleId: MODULE.ID, signal });

    // placed: sync the pinId flag for codex.
    pins.on('placed', (evt) => {
        const codexUuid = evt.pin?.config?.codexUuid;
        if (codexUuid) {
            fromUuid(codexUuid).then(page => {
                if (!page) return;
                if (evt.pinId && page.getFlag(MODULE.ID, 'pinId') !== evt.pinId) {
                    page.setFlag(MODULE.ID, 'pinId', evt.pinId).then(() => _scheduleCodexPanelRefresh());
                } else {
                    _scheduleCodexPanelRefresh();
                }
            });
        }
    }, { moduleId: MODULE.ID, signal });

    // updated: codex refreshes.
    pins.on('updated', (evt) => {
        const codexUuid = evt.pin?.config?.codexUuid;
        if (codexUuid) {
            // Fire-and-forget: never let a diagnostic block the refresh.
            _warnIfCodexPinVisibilityEdited(evt);
            _scheduleCodexPanelRefresh();
        }
    }, { moduleId: MODULE.ID, signal });

    // created: codex refreshes.
    pins.on('created', (evt) => {
        if (evt.pin?.config?.codexUuid) _scheduleCodexPanelRefresh();
    }, { moduleId: MODULE.ID, signal });

    // bulk deletes: refresh all panels.
    pins.on('deletedAll',       () => _scheduleCodexPanelRefresh(), { moduleId: MODULE.ID, signal });
    pins.on('deletedAllByType', () => _scheduleCodexPanelRefresh(), { moduleId: MODULE.ID, signal });
}

// ============================================================================
// TAXONOMY REGISTRATION
// ============================================================================

async function _registerTaxonomy(pins) {
    if (!isPinsApiAvailable(pins) || typeof pins.registerPinTaxonomy !== 'function') return;
    try {
        pins.registerPinTaxonomy(MODULE.ID, getPinType('codex'),     { label: 'Codex Entry', tags: [] });
    } catch (e) {
        console.warn('Coffee Pub Librarian | registerPinTaxonomy failed:', e);
    }
}

// ============================================================================
// LIFECYCLE
// ============================================================================

/**
 * Initialize the pin manager. Call once in the Foundry `ready` hook.
 * Registers taxonomy, event handlers, context menus, and lifecycle hooks.
 */
export async function initCodexPins() {
    if (_pinManagerInitialized) return;

    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) {
        console.warn('Coffee Pub Librarian | Pin manager init deferred: Blacksmith pins API not available.');
        return;
    }

    try {
        if (typeof pins.whenReady === 'function') await pins.whenReady();
    } catch (e) {
        console.warn('Coffee Pub Librarian | pins.whenReady() failed during initCodexPins:', e);
    }

    _pinManagerController = new AbortController();

    await _registerTaxonomy(pins);
    _registerEventHandlers(pins);
    _registerContextMenuItems(pins);

    // Run migrations (GM only).
    await _migrateCodexPinFlags();

    _pinManagerInitialized = true;
    console.info('Coffee Pub Librarian | Pin manager initialized.');
}

/**
 * Tear down the pin manager. Call from module cleanup / disable hooks.
 * Aborts all pin event handlers and disposes context menu items.
 */
export function teardownCodexPins() {
    if (_pinManagerController) {
        _pinManagerController.abort();
        _pinManagerController = null;
    }

    _contextMenuDisposers.forEach(d => { try { if (typeof d === 'function') d(); } catch (_) {} });
    _contextMenuDisposers = [];

    // All pins.on() lifecycle handlers are cleaned up by the AbortController above.

    if (_codexSyncTimer) { clearTimeout(_codexSyncTimer); _codexSyncTimer = null; }
    _codexSyncPending = false;

    if (_codexPinPlacement) _clearCodexPinPlacement();

    _pinManagerInitialized = false;
    console.info('Coffee Pub Librarian | Pin manager torn down.');
}
