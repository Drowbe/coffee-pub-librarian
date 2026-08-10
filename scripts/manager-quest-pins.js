import { MODULE } from './const.js';
import { trackModuleTimeout } from './timer-utils.js';
import { getCampaignPanel, revealCampaignPanel } from './campaign-panels.js';

/**
 * Quest and objective pins, over Blacksmith's pins API.
 *
 * This is the quest slice of what was one 2,325-line pin manager in Squire,
 * covering quests, codex entries and notes. Only the quest half came across —
 * the codex half follows when codex does, and the note half is Blacksmith's.
 *
 * Deliberately NOT a wholesale port. Blacksmith is designing a general
 * annotation model in which a pin is one view of a relationship, and most of a
 * wrapper like this stops existing under it. So what lives here is what quests
 * genuinely need today, not a copy of the old adapter waiting to be replaced.
 */

// Initial design defaults per pin type. GM customises further via Configure Pin.
const PIN_DEFAULTS = {
    quest: {
        size: { w: 60, h: 60 }, shape: 'circle',
        style: { fill: '#682008', stroke: '#ffffff', strokeWidth: 5, iconColor: '#ffffff' },
        dropShadow: false, textLayout: 'right', textDisplay: 'hover',
        textColor: '#ffffff', textSize: 18, textMaxLength: 100, textMaxWidth: 30,
        textScaleWithPin: false, lockProportions: false, allowDuplicatePins: false,
        eventAnimations: {
            hover:       { animation: 'ripple',      sound: 'interface-button-01' },
            click:       { animation: null,          sound: null                  },
            doubleClick: { animation: 'scale-large', sound: 'book-open-02'        },
            add:         { animation: 'rotate',      sound: 'interface-pop-02'    },
            delete:      { animation: 'fade',        sound: 'interface-error-07'  }
        },
        config: { blacksmithAccess: 'gm', blacksmithVisibility: 'visible' }
    },
    objective: {
        size: { w: 50, h: 50 }, shape: 'circle',
        style: { fill: '#8c2d0d', stroke: '#ffffff', strokeWidth: 5, iconColor: '#ffffff' },
        dropShadow: false, textLayout: 'right', textDisplay: 'hover',
        textColor: '#ffffff', textSize: 18, textMaxLength: 100, textMaxWidth: 30,
        textScaleWithPin: false, lockProportions: false, allowDuplicatePins: false,
        eventAnimations: {
            hover:       { animation: 'ripple',      sound: 'interface-button-01' },
            click:       { animation: null,          sound: null                  },
            doubleClick: { animation: 'scale-large', sound: 'book-open-02'        },
            add:         { animation: 'rotate',      sound: 'interface-pop-02'    },
            delete:      { animation: 'fade',        sound: 'interface-error-07'  }
        },
        config: { blacksmithAccess: 'gm', blacksmithVisibility: 'visible' }
    },
    note: {
        size: { w: 60, h: 60 }, shape: 'circle',
        style: { fill: '#756c00', stroke: '#ffffff', strokeWidth: 5, iconColor: '#ffffff' },
        dropShadow: true, textLayout: 'under', textDisplay: 'always',
        textColor: '#ffffff', textSize: 18, textMaxLength: 0, textMaxWidth: 40,
        textScaleWithPin: true, lockProportions: true, allowDuplicatePins: false,
        eventAnimations: {
            hover:       { animation: 'ripple',      sound: 'interface-pop-03' },
            click:       { animation: 'scale-small', sound: 'book-flip-01'     },
            doubleClick: { animation: 'scale-large', sound: 'book-open-02'     },
            add:         { animation: null,          sound: 'interface-pop-02' },
            delete:      { animation: 'dissolve',    sound: 'interface-error-05' }
        },
        config: { blacksmithAccess: 'private', blacksmithVisibility: 'visible' }
    },
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

const SQUIRE_PIN_TAXONOMY_KIND = Object.freeze({
    quest:     'quest',
    objective: 'objective',
    note:      'note',
    codex:     'codex'
});

const LEGACY_SQUIRE_PIN_TYPE = Object.freeze({
    quest:     'quest-pin',
    objective: 'objective-pin',
    note:      'note-pin',
    codex:     'codex-pin'
});

/** Quest category display name → taxonomy tag key. */
const QUEST_CATEGORY_TAG_MAP = {
    'Main Quest': 'main',
    'Side Quest': 'side',
    'Faction':    'faction',
    'Backstory':  'backstory'
};

const OBJECTIVE_ICON = '<i class="fa-solid fa-sign-post"></i>';

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
 * @param {'quest'|'objective'|'note'|'codex'} kind
 */
export function getSquirePinType(kind) {
    return SQUIRE_PIN_TAXONOMY_KIND[kind] ?? kind;
}

/**
 * True if `pinType` matches the canonical or legacy type for `kind`.
 * @param {string|null|undefined} pinType
 * @param {'quest'|'objective'|'note'|'codex'} kind
 */
export function isSquirePinCategory(pinType, kind) {
    if (!pinType || typeof pinType !== 'string') return false;
    return pinType === getSquirePinType(kind) || pinType === LEGACY_SQUIRE_PIN_TYPE[kind];
}

/**
 * List Squire pins matching a kind (canonical + legacy type), deduped by id.
 * @param {object} pins - Pins API instance
 * @param {'quest'|'objective'|'note'|'codex'} kind
 * @param {{ unplacedOnly?: boolean, sceneId?: string }} [opts]
 */
export function listSquirePinsByKind(pins, kind, opts = {}) {
    if (!pins?.list) return [];
    const base     = { moduleId: MODULE.ID, ...opts };
    const canonical = getSquirePinType(kind);
    const legacy    = LEGACY_SQUIRE_PIN_TYPE[kind];
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

/**
 * List all Squire quest/objective pins across all scenes (includes unplaced).
 * Attaches a synthetic `sceneId` property for convenience.
 * @param {object} pins
 * @param {{ sceneId?: string, unplacedOnly?: boolean }} [opts]
 */
export function listAllQuestPins(pins, opts = {}) {
    if (!pins?.list) return [];
    const collect = (list, byId, sceneId = null) => {
        for (const pin of list || []) {
            if (!pin?.id || !pin?.config?.questUuid) continue;
            byId.set(pin.id, { ...pin, sceneId });
        }
    };
    const byId = new Map();
    if (opts.sceneId || opts.unplacedOnly) {
        collect(pins.list({ ...opts }) || [], byId, opts.unplacedOnly ? null : (opts.sceneId ?? null));
        return [...byId.values()];
    }
    collect(pins.list({ unplacedOnly: true }) || [], byId, null);
    for (const scene of game.scenes.contents) {
        collect(pins.list({ sceneId: scene.id }) || [], byId, scene.id);
    }
    return [...byId.values()];
}

/**
 * Find the live (preferably placed) quest-level pin for a questUuid.
 * @param {string} questUuid
 */
export function findLiveQuestPin(questUuid) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins) || !questUuid) return null;
    let match = null;
    for (const pin of listAllQuestPins(pins)) {
        if (pin?.config?.questUuid !== questUuid) continue;
        if (typeof pin?.config?.objectiveIndex === 'number') continue;
        if (!match || (!match.sceneId && pin.sceneId)) match = pin;
    }
    return match;
}

/**
 * Find the live (preferably placed) objective pin.
 * @param {string} questUuid
 * @param {number} objectiveIndex
 */
export function findLiveObjectivePin(questUuid, objectiveIndex) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins) || !questUuid || !Number.isInteger(objectiveIndex)) return null;
    let match = null;
    for (const pin of listAllQuestPins(pins)) {
        if (pin?.config?.questUuid !== questUuid) continue;
        if (Number(pin?.config?.objectiveIndex) !== objectiveIndex) continue;
        if (!match || (!match.sceneId && pin.sceneId)) match = pin;
    }
    return match;
}

/**
 * Build pin ownership for a quest/objective pin based on visibility flags.
 * @param {JournalEntryPage} page
 * @param {object|null} [objective] - Objective data (null = quest-level pin)
 */
export function calculateQuestPinOwnership(page, objective = null) {
    const gmUsers = {};
    game.users.forEach(user => {
        if (user.isGM) gmUsers[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    });
    const questVisible = page?.getFlag(MODULE.ID, 'visible') !== false;
    if (!questVisible) return { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, users: gmUsers };
    if (objective?.state === 'hidden') return { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, users: gmUsers };
    return { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER, users: gmUsers };
}

/**
 * Get the GM's saved design for a type via Configure Pin "Default for [type]".
 * Returns {} if unavailable (strips id/type/moduleId to avoid polluting PinData).
 */
function _getPinTypeDefaultDesign(pins, kind) {
    if (!isPinsApiAvailable(pins) || typeof pins.getDefaultPinDesign !== 'function') return {};
    try {
        const raw = pins.getDefaultPinDesign(MODULE.ID, getSquirePinType(kind)) || {};
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
 * Merge the Squire initial defaults (pin-defaults.json) with the GM's saved
 * Configure Pin defaults for a given kind. Never mutates the JSON defaults.
 * @param {object} pins
 * @param {'quest'|'objective'|'note'|'codex'} kind
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
    return pins.getModuleTaxonomy(MODULE.ID)?.[getSquirePinType(kind)]?.tags ?? null;
}

/** Map quest category string → taxonomy tags, validated against live taxonomy. */
function _questCategoryToPinTags(baseTag, category, taxonomyTags) {
    const extra = QUEST_CATEGORY_TAG_MAP[category];
    if (!taxonomyTags) return extra ? [baseTag, extra] : [baseTag];
    const tags = [];
    if (taxonomyTags.includes(baseTag)) tags.push(baseTag);
    if (extra && taxonomyTags.includes(extra)) tags.push(extra);
    return tags.length ? tags : [baseTag];
}

/**
 * Resolve quest pin image from the quest page's `questIcon` flag.
 * Falls back to the default quest flag icon.
 */
function _getQuestPinImage(page, category = 'Side Quest') {
    const categoryIcon = category === 'Main Quest'
        ? '<i class="fa-solid fa-flag"></i>'
        : '<i class="fa-solid fa-map-signs"></i>';
    if (!page) return categoryIcon;
    const iconFlag = page.getFlag(MODULE.ID, 'questIcon');
    if (!iconFlag) return categoryIcon;
    if (typeof iconFlag === 'object') {
        if (iconFlag.type === 'fa' && iconFlag.value) {
            const v = String(iconFlag.value).trim();
            return v.startsWith('<i') ? v : `<i class="${v}"></i>`;
        }
        if (iconFlag.type === 'img' && iconFlag.value) return iconFlag.value;
    }
    if (typeof iconFlag === 'string') {
        const t = iconFlag.trim();
        if (t.startsWith('<i') && t.includes('fa-')) return t;
        if (t.includes('fa-')) return `<i class="${t}"></i>`;
        return t;
    }
    return categoryIcon;
}

/** Stable quest number derived from UUID. */
function _getQuestNumber(questUuid) {
    if (!questUuid || typeof questUuid !== 'string') return 1;
    let hash = 0;
    for (let i = 0; i < questUuid.length; i++) {
        hash = ((hash << 5) - hash) + questUuid.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash) % 100 + 1;
}

/**
 * Create a quest-level pin (unplaced or placed immediately).
 * Ownership reflects the quest's current `visible` flag.
 * @param {object} opts
 * @param {string}  opts.questUuid
 * @param {number}  [opts.questIndex]
 * @param {string}  [opts.questCategory='Side Quest']
 * @param {number}  [opts.x]
 * @param {number}  [opts.y]
 * @param {string}  [opts.sceneId]
 * @returns {Promise<object|null>} Created PinData or null on failure.
 */
export async function createQuestPin(opts) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return null;
    const { questUuid, questIndex, questCategory = 'Side Quest', x, y, sceneId } = opts;
    const page = await fromUuid(questUuid);
    if (!page) return null;

    const ownership  = calculateQuestPinOwnership(page);
    const questNum   = typeof questIndex === 'number' ? questIndex : _getQuestNumber(questUuid);
    const design     = _buildMergedDesign(pins, 'quest');
    const image      = _getQuestPinImage(page, questCategory);
    const questTitle = (page?.name || 'Quest').trim();
    const pinTitle   = `Quest ${questNum}: ${questTitle}${questTitle.endsWith('.') ? '' : '.'}`;
    const taxTags    = _getModuleTaxonomyTags('quest');

    const pinData = {
        id:              crypto.randomUUID(),
        moduleId:        MODULE.ID,
        type:            getSquirePinType('quest'),
        tags:            _questCategoryToPinTags('quest', questCategory, taxTags),
        text:            pinTitle,
        image,
        size:            _safeSize(design.size, PIN_DEFAULTS.quest.size),
        shape:           design.shape ?? 'circle',
        style:           design.style ?? PIN_DEFAULTS.quest.style,
        dropShadow:      design.dropShadow ?? false,
        textLayout:      design.textLayout ?? 'right',
        textDisplay:     design.textDisplay ?? 'hover',
        textColor:       design.textColor ?? '#ffffff',
        textSize:        design.textSize ?? 10,
        textMaxLength:   design.textMaxLength ?? 100,
        textMaxWidth:    design.textMaxWidth ?? 30,
        textScaleWithPin:design.textScaleWithPin ?? false,
        lockProportions: design.lockProportions ?? false,
        allowDuplicatePins: design.allowDuplicatePins ?? false,
        eventAnimations: design.eventAnimations ?? foundry.utils.deepClone(PIN_DEFAULTS.quest.eventAnimations),
        ownership,
        config: {
            blacksmithAccess:     PIN_DEFAULTS.quest.config.blacksmithAccess,
            blacksmithVisibility: page.getFlag(MODULE.ID, 'visible') !== false ? 'visible' : 'hidden',
            questUuid,
            questIndex:   questNum,
            questCategory
        }
    };
    _applyPinTypeDefaultExtras(pinData, _getPinTypeDefaultDesign(pins, 'quest'));

    const hasPlacement = typeof sceneId === 'string' && Number.isFinite(x) && Number.isFinite(y);
    if (hasPlacement) { pinData.x = x; pinData.y = y; }

    try {
        if (typeof pins.whenReady === 'function') await pins.whenReady();
        const created = await pins.create(pinData, hasPlacement ? { sceneId } : undefined);
        if (hasPlacement && typeof pins.reload === 'function') await pins.reload({ sceneId });
        return created;
    } catch (err) {
        console.error('Coffee Pub Librarian | createQuestPin:', err);
        return null;
    }
}

/**
 * Create an objective-level pin (unplaced or placed immediately).
 * @param {object} opts
 * @param {string}  opts.questUuid
 * @param {number}  opts.objectiveIndex
 * @param {number}  [opts.questIndex]
 * @param {string}  [opts.questCategory='Side Quest']
 * @param {string}  [opts.questState='visible']
 * @param {object}  [opts.objective={state:'active',text:''}]
 * @param {number}  [opts.x]
 * @param {number}  [opts.y]
 * @param {string}  [opts.sceneId]
 * @returns {Promise<object|null>}
 */
export async function createObjectivePin(opts) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return null;
    const {
        questUuid, objectiveIndex, questIndex, questCategory = 'Side Quest',
        questState = 'visible', objective = { state: 'active', text: '' }, x, y, sceneId
    } = opts;
    const page = await fromUuid(questUuid);
    if (!page) return null;

    const ownership = calculateQuestPinOwnership(page, objective);
    const questNum  = typeof questIndex === 'number' ? questIndex : _getQuestNumber(questUuid);
    const design    = _buildMergedDesign(pins, 'objective');
    const objNum    = String((objectiveIndex ?? 0) + 1).padStart(2, '0');
    const objText   = (objective?.text || 'Objective').trim();
    const pinTitle  = `Quest ${questNum}.${objNum}: ${objText}${objText.endsWith('.') ? '' : '.'}`;
    const taxTags   = _getModuleTaxonomyTags('objective');
    const image     = typeof design.image === 'string' && design.image.trim() ? design.image : OBJECTIVE_ICON;

    const pinData = {
        id:              crypto.randomUUID(),
        moduleId:        MODULE.ID,
        type:            getSquirePinType('objective'),
        tags:            _questCategoryToPinTags('objective', questCategory, taxTags),
        text:            pinTitle,
        image,
        size:            _safeSize(design.size, PIN_DEFAULTS.objective.size),
        shape:           design.shape ?? 'circle',
        style:           design.style ?? PIN_DEFAULTS.objective.style,
        dropShadow:      design.dropShadow ?? false,
        textLayout:      design.textLayout ?? 'under',
        textDisplay:     design.textDisplay ?? 'hover',
        textColor:       design.textColor ?? '#ffffff',
        textSize:        design.textSize ?? 12,
        textMaxLength:   design.textMaxLength ?? 100,
        textMaxWidth:    design.textMaxWidth ?? 25,
        textScaleWithPin:design.textScaleWithPin ?? false,
        lockProportions: design.lockProportions ?? false,
        allowDuplicatePins: design.allowDuplicatePins ?? false,
        eventAnimations: design.eventAnimations ?? foundry.utils.deepClone(PIN_DEFAULTS.objective.eventAnimations),
        ownership,
        config: {
            blacksmithAccess:     PIN_DEFAULTS.objective.config.blacksmithAccess,
            blacksmithVisibility: questState === 'hidden' || objective?.state === 'hidden' ? 'hidden' : 'visible',
            questUuid,
            questIndex:     questNum,
            objectiveIndex: objectiveIndex ?? 0,
            questCategory,
            questState,
            objectiveState: objective.state || 'active',
            objectiveText:  (objective.text || '').trim()
        }
    };
    _applyPinTypeDefaultExtras(pinData, _getPinTypeDefaultDesign(pins, 'objective'));

    const hasPlacement = typeof sceneId === 'string' && Number.isFinite(x) && Number.isFinite(y);
    if (hasPlacement) { pinData.x = x; pinData.y = y; }

    try {
        if (typeof pins.whenReady === 'function') await pins.whenReady();
        const created = await pins.create(pinData, hasPlacement ? { sceneId } : undefined);
        if (hasPlacement && typeof pins.reload === 'function') await pins.reload({ sceneId });
        return created;
    } catch (err) {
        console.error('Coffee Pub Librarian | createObjectivePin:', err);
        return null;
    }
}

/**
 * Delete all quest (and objective) pins for a quest on all scenes (or one scene).
 * @param {string} questUuid
 * @param {string} [sceneId] - If provided, only delete pins placed on this scene.
 */
export async function deleteQuestPins(questUuid, sceneId) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;
    const all = listAllQuestPins(pins).filter(p => p?.config?.questUuid === questUuid);
    const targets = sceneId ? all.filter(p => p.sceneId === sceneId) : all;
    for (const pin of targets) {
        try {
            await pins.delete(pin.id, pin.sceneId ? { sceneId: pin.sceneId } : undefined);
        } catch (e) {
            console.warn('Coffee Pub Librarian | deleteQuestPins:', e);
        }
    }
}

/**
 * Unplace the quest-level pin from the canvas (pin data kept, can be re-placed).
 * @param {JournalEntryPage} page - Quest page
 */
export async function unplaceQuestPin(page) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;
    const livePin = page?.uuid ? findLiveQuestPin(page.uuid) : null;
    if (!livePin?.id || !livePin.sceneId) return;
    try {
        if (typeof pins.unplace === 'function') await pins.unplace(livePin.id);
        else if (typeof pins.update === 'function') await pins.update(livePin.id, { unplace: true });
    } catch (e) {
        console.warn('Coffee Pub Librarian | unplaceQuestPin:', e);
    }
    if (typeof pins.reload === 'function') await pins.reload({ sceneId: canvas.scene?.id });
}

/**
 * Unplace an objective pin from the canvas.
 * @param {JournalEntryPage} page
 * @param {number} objectiveIndex
 */
export async function unplaceObjectivePin(page, objectiveIndex) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;
    const livePin = page?.uuid ? findLiveObjectivePin(page.uuid, objectiveIndex) : null;
    if (!livePin?.id) return;
    try {
        if (typeof pins.unplace === 'function') await pins.unplace(livePin.id);
        else if (typeof pins.update === 'function') await pins.update(livePin.id, { unplace: true });
    } catch (e) {
        console.warn('Coffee Pub Librarian | unplaceObjectivePin:', e);
    }
    if (typeof pins.reload === 'function') await pins.reload({ sceneId: canvas.scene?.id });
}

/** Reload quest/objective pins on the current scene canvas. */
export async function reloadAllQuestPins() {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins) || !canvas?.scene) return;
    if (typeof pins.reload === 'function') await pins.reload({ sceneId: canvas.scene.id });
}

/**
 * Update pin ownership for all pins belonging to a quest after visibility changes.
 * Also updates blacksmithVisibility on quest-level pins.
 * @param {string} questUuid
 * @param {string} [sceneId]
 */
export async function updateQuestPinVisibility(questUuid, sceneId) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;
    const page = await fromUuid(questUuid);
    if (!page) return;

    let content = '';
    try {
        if (typeof page.text?.content === 'string') content = page.text.content;
        else if (page.text?.content) content = await page.text.content;
    } catch (_) {}
    const enrichedHtml = typeof page.getEnrichedContent === 'function'
        ? await page.getEnrichedContent(content)
        : content;
    const quest    = await QuestParser.parseSinglePage(page, enrichedHtml);
    const tasks    = quest?.tasks ?? [];
    const forQuest = listAllQuestPins(pins).filter(p => p?.config?.questUuid === questUuid);
    const questHidden = page.getFlag(MODULE.ID, 'visible') === false;

    for (const pin of forQuest) {
        const objective  = typeof pin.config?.objectiveIndex === 'number' ? tasks[pin.config.objectiveIndex] : null;
        const ownership  = calculateQuestPinOwnership(page, objective);
        const isHidden   = questHidden || objective?.state === 'hidden';
        const patch = {
            ownership,
            config: {
                ...(pin.config || {}),
                blacksmithVisibility: isHidden ? 'hidden' : 'visible'
            }
        };
        try {
            await pins.update(pin.id, patch, pin.sceneId ? { sceneId: pin.sceneId } : undefined);
        } catch (e) {
            console.warn('Coffee Pub Librarian | updateQuestPinVisibility:', e);
        }
    }
    if (sceneId && typeof pins.reload === 'function') await pins.reload({ sceneId });
}

/**
 * Update pin text, tags, and config for all pins on a quest page after content changes.
 * Does NOT update style/design — Blacksmith owns appearance after initial create.
 * @param {JournalEntryPage} page
 * @param {string} [sceneId]
 */
export async function updateQuestPinText(page, sceneId) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins) || !page) return;

    let content = '';
    try {
        if (typeof page.text?.content === 'string') content = page.text.content;
        else if (page.text?.content) content = await page.text.content;
    } catch (_) {}
    const enrichedHtml = typeof page.getEnrichedContent === 'function'
        ? await page.getEnrichedContent(content)
        : content;
    const quest    = await QuestParser.parseSinglePage(page, enrichedHtml);
    if (!quest) return;

    const forQuest = listAllQuestPins(pins).filter(p => p?.config?.questUuid === page.uuid);
    const questNum = _getQuestNumber(page.uuid);
    const questTitle = (page?.name || 'Quest').trim();
    const questTaxTags = _getModuleTaxonomyTags('quest');
    const objTaxTags   = _getModuleTaxonomyTags('objective');

    for (const pin of forQuest) {
        const patch = {};
        if (typeof pin.config?.objectiveIndex !== 'number') {
            // Quest-level pin: update title and tags
            patch.text = `Quest ${questNum}: ${questTitle}${questTitle.endsWith('.') ? '' : '.'}`;
            patch.image = _getQuestPinImage(page, quest.category);
            patch.tags = _questCategoryToPinTags('quest', pin.config?.questCategory, questTaxTags);
            patch.config = { ...(pin.config || {}), questState: page.getFlag(MODULE.ID, 'visible') !== false ? 'visible' : 'hidden' };
        } else {
            // Objective-level pin: update text and tags
            const obj    = quest.tasks[pin.config.objectiveIndex];
            const objNum = String((pin.config.objectiveIndex ?? 0) + 1).padStart(2, '0');
            const objText = (obj?.text || 'Objective').trim();
            patch.text  = `Quest ${questNum}.${objNum}: ${objText}${objText.endsWith('.') ? '' : '.'}`;
            patch.tags  = _questCategoryToPinTags('objective', pin.config?.questCategory, objTaxTags);
            patch.config = {
                ...(pin.config || {}),
                objectiveState: obj?.state || 'active',
                objectiveText:  (obj?.text || '').trim()
            };
        }
        if (Object.keys(patch).length) {
            try {
                await pins.update(pin.id, patch, pin.sceneId ? { sceneId: pin.sceneId } : undefined);
            } catch (e) {
                console.warn('Coffee Pub Librarian | updateQuestPinText:', e);
            }
        }
    }
    if (sceneId && typeof pins.reload === 'function') await pins.reload({ sceneId });
}

/**
 * Reconcile quest page `pinId` flags against live Blacksmith pin data. GM only.
 * Restores pinId when a pin exists; clears it when the pin is gone.
 */
export async function reconcileQuestPins() {
    if (!game.user.isGM) return;
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;

    const allPins = listAllQuestPins(pins);
    const byQuest = new Map();
    for (const pin of allPins) {
        const qid = pin.config?.questUuid;
        if (!qid) continue;
        const objIndex = typeof pin.config?.objectiveIndex === 'number' ? pin.config.objectiveIndex : null;
        const key = objIndex === null ? qid : `${qid}|${objIndex}`;
        byQuest.set(key, pin);
    }

    const journalId = game.settings.get(MODULE.ID, 'questJournal');
    const journal   = journalId && journalId !== 'none' ? game.journal.get(journalId) : null;
    for (const page of journal?.pages ?? []) {
        if (!page) continue;
        const livePin = byQuest.get(page.uuid);
        if (livePin) {
            await page.setFlag(MODULE.ID, 'pinId', livePin.id);
        } else {
            const storedId = page.getFlag(MODULE.ID, 'pinId');
            if (storedId && !pins.exists(storedId)) {
                await page.setFlag(MODULE.ID, 'pinId', null);
            }
        }
    }
}

function _isPermissionDeniedError(error) {
    const msg = String(error?.message || error || '').toLowerCase();
    return msg.includes('permission denied') || msg.includes('lacks permission') || msg.includes('permission to update setting');
}

/**
 * Pan the canvas to a pin and ping it.
 *
 * Shared by every kind — note, codex, quest objective. Panels must not reach for
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

function _mapQuestStatusToFilter(questStatus) {
    if (typeof questStatus !== 'string') return null;
    switch (questStatus) {
        case 'In Progress': return 'active';
        case 'Not Started': return 'available';
        case 'Complete':
        case 'Failed':      return 'complete';
        default:            return null;
    }
}

function _hasQuestEntryInDom(questUuid) {
    const entry = document.querySelector(`.quest-entry[data-quest-uuid="${questUuid}"]`);
    if (!entry) return false;
    const section = entry.closest('.quest-section[data-status]');
    if (!section) return true;
    return section.style.display !== 'none';
}

function _focusQuestEntryInDom(questUuid, objectiveIndex = null) {
    const entry = document.querySelector(`.quest-entry[data-quest-uuid="${questUuid}"]`);
    if (!entry) return false;
    entry.classList.remove('collapsed');
    entry.classList.add('quest-highlighted');
    entry.scrollIntoView({ behavior: 'smooth', block: 'center' });
    trackModuleTimeout(() => entry.classList.remove('quest-highlighted'), 2000);
    const objIndex = objectiveIndex !== null ? parseInt(objectiveIndex, 10) : null;
    if (objIndex !== null && !Number.isNaN(objIndex)) {
        const taskItem = entry.querySelector(`.quest-entry-tasks li[data-task-index="${objIndex}"]`);
        if (taskItem) {
            taskItem.classList.add('objective-highlighted');
            trackModuleTimeout(() => taskItem.classList.remove('objective-highlighted'), 2000);
        }
    }
    return true;
}

/**
 * Open the quest panel (tray expanded, quest tab) and scroll to / highlight a quest,
 * optionally highlighting one objective. Shared by the pin doubleClick handler and
 * the menubar notification click handlers in panel-quest.js.
 * @param {string} questUuid - The quest journal page UUID
 * @param {number|string|null} objectiveIndex - Objective index to highlight, if any
 * @param {string|null} questStatus - Quest status hint used to pick the right status filter
 */
export async function focusQuestInPanel(questUuid, objectiveIndex = null, questStatus = null) {
    if (!questUuid) return;
    // Reveal first: it opens the browser window when nothing is hosting the
    // panel yet, which is the normal case for a pin clicked on a fresh load.
    await revealCampaignPanel('quest');
    const questPanel = getCampaignPanel('quest');
    if (!questPanel) return;

    const pinFilter = _mapQuestStatusToFilter(questStatus);
    let targetFilter = questPanel.resolveStatusFilterForQuestUuid?.(questUuid) ?? pinFilter ?? 'active';
    if (typeof questPanel.applyQuestStatusFilter === 'function') questPanel.applyQuestStatusFilter(targetFilter);
    if (!_hasQuestEntryInDom(questUuid)) {
        for (const f of [...new Set([pinFilter, 'active', 'available', 'complete'].filter(Boolean))]) {
            if (_hasQuestEntryInDom(questUuid)) break;
            questPanel.applyQuestStatusFilter?.(f);
        }
    }
    const tryFocus = () => _focusQuestEntryInDom(questUuid, objectiveIndex);
    tryFocus();
    trackModuleTimeout(tryFocus, 200);
    trackModuleTimeout(tryFocus, 500);
    trackModuleTimeout(tryFocus, 1000);
}
