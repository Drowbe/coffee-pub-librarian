import { MODULE, TEMPLATES, getCodexCategoryIcon } from './const.js';
import { CodexParser } from './utility-codex-parser.js';
import { CODEX_PAGE_TYPE } from './data/codex-page-model.js';
import { normalizeName, buildCodexPageIndex, renderCodexRef } from './utility-codex-index.js';
import { copyToClipboard, getNativeElement, renderTemplate, getTextEditor, escapeHtml, getPartyActors, hasPrimaryParty, showBlacksmithWait, fillCampaignPlaceholders } from './helpers.js';
import { trackModuleTimeout, clearTrackedTimeout, moduleDelay } from './timer-utils.js';
import { showJournalPicker } from './utility-journal.js';
import {
    resolveCodexLinks,
    reportResolution,
    normalizeCodexLink,
    codexLinkKey
} from './utility-resolver.js';
import {
    validateCodexEntry,
    importCodexEntry,
    findDuplicateNames,
    sortCodexPages,
    countUnresolvedLinks
} from './import-codex.js';
import {
    getPinsApi,
    deleteCodexPin,
    beginCodexPinPlacement,
    unplaceCodexPin,
    updateCodexPinVisibility,
    panToPin
} from './manager-codex-pins.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return globalThis.game?.modules?.get?.('coffee-pub-blacksmith')?.api ?? null;
}

/**
 * Item types the codex inventory scan considers "something the party owns".
 *
 * `container` is the dnd5e 5.x type for backpacks/pouches; `backpack` is its
 * pre-migration name (dnd5e rewrites `backpack` → `container` on load, so a
 * modern world has none — it is kept here only so an unmigrated world still
 * works). Their absence is why containers were invisible to the scan.
 *
 * NOTE: this does NOT need to recurse. dnd5e keeps a contained item as an
 * ordinary embedded item on the actor, tagged with `system.container` — it is
 * never nested inside the container document. `Container#contents` is itself
 * derived by filtering `actor.items`, so `actor.items` already holds everything
 * in every container, at any depth.
 */
const CODEX_SCAN_ITEM_TYPES = Object.freeze([
    'equipment', 'consumable', 'tool', 'loot', 'weapon', 'container', 'backpack'
]);

/**
 * Session cache for enriched `@UUID[uuid]{label}` output.
 *
 * `TextEditor.enrichHTML` was awaited once per resolved link inside the per-entry
 * loop, on every render. Categories ran in parallel; entries within a category did
 * not — so a 314-entry codex cost hundreds of sequential awaits every time anything
 * re-rendered, including pinning a single entry.
 *
 * The output is deterministic given `uuid` + `label`, and both are stored on the
 * link, so the second render onward costs a Map lookup. Keyed on the pair rather
 * than the uuid alone because the same document can be linked under different
 * labels.
 *
 * Not invalidated: a renamed document changes the enriched anchor's text, and this
 * would keep serving the old one until reload. That is the same staleness the
 * unenriched label already has (the label is stored on the link, not read from the
 * document), so caching introduces no new inconsistency.
 */
const _enrichedLinkCache = new Map();

const CODEX_WINDOW_ID = `${MODULE.ID}-codex-window`;

function openCodexWindow(options = {}) {
    const blacksmith = getBlacksmith();
    if (typeof blacksmith?.openWindow !== 'function') {
        ui.notifications.warn('Codex window is not ready yet.');
        return null;
    }
    return blacksmith.openWindow(CODEX_WINDOW_ID, options);
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

export class CodexPanel {
    constructor() {
        this.element = null;
        this.selectedJournal = null;
        this.categories = new Set();
        this.data = {};
        // One-time GM notice about legacy (pre-data-model) text pages in the journal
        this._legacyNoticeShown = false;
        this.filters = {
            search: "",
            tags: [],
            category: "all"
        };
        this.allTags = new Set();
        this.isImporting = false;
        // Entry uuids the user has expanded. Entries default to collapsed, so this
        // tracks the exceptions. Held here rather than only as a DOM class: the
        // template renders every card collapsed, so ANY re-render (pinning,
        // toggling visibility, an Auto-Link pass) used to slam every open entry
        // shut under the user. Hydrated lazily from the user flag on first use —
        // the constructor can run before `game.user` exists.
        this._expandedEntries = null;
        // Delegated listeners are bound once per container rather than per render;
        // these track which container currently holds them. See _bindDelegatedListeners.
        this._boundContainer = null;
        this._listenersAbort = null;
        this._setupHooks();
        // Pin events registered centrally by manager-pins.js initPinManager().
    }

    /**
     * Sets up global hooks for journal updates
     * @private
     */
    _setupHooks() {
        // Journal hooks are handled by HookManager
        // This method is kept for compatibility but no longer registers hooks
    }

    /**
     * Show the global progress bar for codex imports
     * @private
     */
    _setStatus(text) {
        const slot = getNativeElement(this.element)?.querySelector('[data-codex-status]');
        if (slot) slot.textContent = String(text ?? '');
    }

    /**
     * Progress reporting, into whatever status slot the host provides.
     *
     * These three used to drive `.tray-progress-bar-wrapper` / `-inner` / `-text`,
     * elements that only ever existed in Squire's `tray.hbs`. Once the panels moved
     * into windows the markup stopped existing, every `querySelector` returned null,
     * and all three became silent no-ops — through imports, Auto-Link and
     * auto-discovery alike, since Squire 13.6.0.
     *
     * That was not merely cosmetic: `_autoDiscoverFromInventories` interleaved
     * `moduleDelay` pauses of up to five seconds specifically to make the progress
     * readable, so every scan was slowed down substantially for a display nobody
     * could see. Those pauses are gone with the bar.
     *
     * The host owns the slot: the codex browser puts `[data-codex-status]` in its
     * Tool footer. A host that provides none gets a no-op, which is the correct
     * behaviour rather than an error — the panel does not know what shell it is in.
     * @private
     */
    _showProgressBar() {
        this._setStatus('Starting codex import...');
    }

    /**
     * @param {number} percent 0-100, reported as a percentage rather than a bar
     * @param {string} text
     * @private
     */
    _updateProgressBar(percent, text) {
        const pct = Number.isFinite(percent) ? ` (${Math.round(percent)}%)` : '';
        this._setStatus(`${text}${pct}`);
    }

    /** @private */
    _hideProgressBar() {
        this._setStatus('');
    }

    /**
     * Expanded entry uuids, hydrated once from the user flag.
     *
     * Persisted the same way category collapse is (`codexCollapsedCategories`),
     * so the tray comes back the way the user left it.
     *
     * @returns {Set<string>}
     * @private
     */
    _getExpandedEntries() {
        if (!this._expandedEntries) {
            const stored = game.user?.getFlag(MODULE.ID, 'codexExpandedEntries');
            this._expandedEntries = new Set(Array.isArray(stored) ? stored : []);
        }
        return this._expandedEntries;
    }

    /**
     * Persist expansion across reloads.
     *
     * Prunes uuids whose page no longer exists: re-import replaces pages with new
     * ones, so without this the flag would accumulate dead ids forever. Skipped
     * when no journal is selected — an empty page list there means "unknown",
     * not "everything was deleted".
     *
     * @private
     */
    _persistExpandedEntries() {
        const set = this._getExpandedEntries();
        if (this.selectedJournal?.pages) {
            const live = new Set(this.selectedJournal.pages.contents.map(p => p.uuid));
            for (const uuid of set) if (!live.has(uuid)) set.delete(uuid);
        }
        game.user?.setFlag(MODULE.ID, 'codexExpandedEntries', Array.from(set));
    }

    /**
     * Record a category's collapsed state.
     *
     * Category collapse is driven by the `codexCollapsedCategories` flag at render
     * time, so expanding a section in the DOM alone is undone by the next render.
     * Anything that opens a section must come through here.
     *
     * @param {string|undefined} category
     * @param {boolean} collapsed
     * @private
     */
    _setCategoryCollapsed(category, collapsed) {
        if (!category) return;
        const flags = game.user?.getFlag(MODULE.ID, 'codexCollapsedCategories') || {};
        if (!!flags[category] === !!collapsed) return; // no-op; skip the write
        flags[category] = !!collapsed;
        game.user?.setFlag(MODULE.ID, 'codexCollapsedCategories', flags);
    }

    /**
     * Purge malformed keys from `codexCollapsedCategories`, once per session.
     *
     * Older versions derived the key from rendered element text instead of the
     * `data-category` attribute, so the flag accumulated entries like
     * `" Locations\n "`, `" Artifacts\n \n Browse\n \n \n "`, and HTML-escaped
     * `"Crafting &amp; gathering"`. A junk key is one that isn't identical to its
     * own trimmed form, or that contains markup/newlines.
     *
     * Harmless now that collapse is read by exact key, but they're removed so the
     * flag stops growing and so any future trim-style matching can't resurrect
     * this bug. The clean key always wins — junk never overwrites a real value.
     *
     * @private
     */
    _pruneCategoryFlags() {
        if (this._categoryFlagsPruned) return;
        this._categoryFlagsPruned = true;
        const flags = game.user?.getFlag(MODULE.ID, 'codexCollapsedCategories');
        if (!flags || typeof flags !== 'object') return;

        const clean = {};
        let dropped = 0;
        for (const [key, value] of Object.entries(flags)) {
            const isJunk = key !== key.trim() || /[\n\r<>&]/.test(key);
            if (isJunk) { dropped++; continue; }
            clean[key] = !!value;
        }
        if (!dropped) return;

        game.user?.setFlag(MODULE.ID, 'codexCollapsedCategories', clean);
        getBlacksmith()?.utils?.postConsoleAndNotification(
            MODULE.NAME,
            `Codex: pruned ${dropped} malformed category-collapse key(s)`,
            { dropped, kept: Object.keys(clean) },
            false,
            false
        );
    }

    /**
     * Toggle a card's collapsed state, recording it so it survives re-render
     * and reload.
     * @param {HTMLElement|null} card
     * @private
     */
    _toggleEntryCollapsed(card) {
        if (!card) return;
        const uuid = card.dataset?.uuid;
        const collapsed = card.classList.toggle('collapsed');
        if (!uuid) return;
        const set = this._getExpandedEntries();
        if (collapsed) set.delete(uuid);
        else set.add(uuid);
        this._persistExpandedEntries();
    }

    /**
     * Open a codex entry IN THE TRAY: expand it, reveal its category, scroll to
     * it, and flash it.
     *
     * This is what `related` names and location levels point at — a codex entry,
     * not the journal page behind it. Same destination as double-clicking a codex
     * pin, so a reference and a pin behave identically. (Document `links` are
     * different: those are real documents and open their own sheets.)
     *
     * @param {string} uuid
     * @returns {boolean} false if the entry isn't currently rendered
     * @private
     */
    _focusEntry(uuid) {
        const card = this.element?.querySelector(`.codex-entry[data-uuid="${uuid}"]`);
        if (!card) return false;
        const section = card.closest('.codex-section');
        if (section) {
            section.classList.remove('collapsed');
            // Persist it. Expanding the section in the DOM alone lasts until the
            // next render, which then snaps it shut — that is what made pinning an
            // entry look like it collapsed the whole category.
            this._setCategoryCollapsed(section.dataset?.category, false);
        }
        card.classList.remove('collapsed');
        this._getExpandedEntries().add(uuid);
        this._persistExpandedEntries();
        card.classList.add('codex-highlighted');
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        trackModuleTimeout(() => card.classList.remove('codex-highlighted'), 2000);
        return true;
    }

    /**
     * Panel-side codex reference. The markup is shared with the journal page's view
     * sheet — see utility-codex-index.js — so the two cannot drift; only the click
     * behaviour differs, and that lives in the delegated handler.
     * @private
     */
    _renderCodexRef(name, index) {
        return renderCodexRef(name, index);
    }

    /**
     * Clean up when the panel is destroyed
     * @public
     */
    destroy() {
        // The delegated handlers are bound to the container, not to individual
        // nodes, so they outlive any re-render and have to be released explicitly.
        this._listenersAbort?.abort();
        this._listenersAbort = null;
        this._boundContainer = null;
        this.element = null;
    }

    /**
     * Check if a page belongs to the selected journal
     * @private
     */
    _isPageInSelectedJournal(page) {
        return this.selectedJournal && page.parent.id === this.selectedJournal.id;
    }

    /**
     * Check if a journal page is actually a CODEX entry
     * @private
     * @param {JournalEntryPage} page - The journal page to check
     * @returns {boolean} True if this appears to be a CODEX entry
     */
    _isCodexEntry(page) {
        try {
            // Quick check: if no text content, it's not a CODEX entry
            if (!page.text?.content) return false;
            
            // Get the raw text content to check for CODEX structure
            let content = '';
            if (typeof page.text.content === 'string') {
                content = page.text.content;
            } else if (page.text.content) {
                // For async content, we'll need to check it differently
                // For now, assume it might be a CODEX entry if we can't determine otherwise
                return true;
            }
            
            // Check if the content contains CODEX-specific markers
            // CODEX entries should have a CATEGORY field, but we'll be more lenient
            if (content && typeof content === 'string') {
                // Look for CATEGORY field (case-insensitive)
                const hasCategory = /<strong>category<\/strong>|<strong>category:<\/strong>/i.test(content);
                
                // If it has a category field, it's definitely a CODEX entry
                if (hasCategory) return true;
                
                // If no category field, check if it has other CODEX-like structure
                // Look for common CODEX fields to determine if this might be a CODEX entry
                const hasDescription = /<strong>description<\/strong>|<strong>description:<\/strong>/i.test(content);
                const hasTags = /<strong>tags<\/strong>|<strong>tags:<\/strong>/i.test(content);
                const hasPlotHook = /<strong>plot hook<\/strong>|<strong>plot hook:<\/strong>/i.test(content);
                const hasLocation = /<strong>location<\/strong>|<strong>location:<\/strong>/i.test(content);
                
                // If it has multiple CODEX-like fields, it's probably a CODEX entry
                const codexFieldCount = [hasDescription, hasTags, hasPlotHook, hasLocation].filter(Boolean).length;
                if (codexFieldCount >= 2) return true;
                
                // If we can't determine, assume it's not a CODEX entry to be safe
                return false;
            }
            
            // If we can't determine, assume it's not a CODEX entry to be safe
            return false;
        } catch (error) {
            // If there's any error checking, assume it's not a CODEX entry
            // This prevents crashes and excessive processing
            return false;
        }
    }

    /**
     * Get the icon class for a given category
     * @param {string} category
     * @returns {string} FontAwesome icon class
     */
    getCategoryIcon(category, customIcon = '') {
        const normalizedCustomIcon = String(customIcon || '').trim();
        if (normalizedCustomIcon) return normalizedCustomIcon;
        // Shared with the canvas pin (const.js). Keeping a second copy here is
        // what let the two drift — 13.3.9 added Establishments/Landmarks to this
        // map and not the pin's, so those pins fell back to fa-book.
        return `fa-solid ${getCodexCategoryIcon(category)}`;
    }

    /**
     * Refresh data from the journal
     * @private
     */
    async _refreshData() {
        // Clear existing data
        this.categories.clear();
        this.data = {};
        this.allTags.clear();

        const journalId = game.settings.get(MODULE.ID, 'codexJournal');
        this.selectedJournal = journalId && journalId !== 'none' ? game.journal.get(journalId) : null;

        if (this.selectedJournal) {
            // Typed pages only: fields come straight from page.system — no parsing.
            // Legacy text pages are counted and surfaced to the GM once (re-import converts).
            let legacyPageCount = 0;

            for (const page of this.selectedJournal.pages.contents) {
                try {
                    if (page.type !== CODEX_PAGE_TYPE) {
                        legacyPageCount++;
                        continue;
                    }

                    const sys = page.system;
                    const entry = {
                        name: page.name,
                        uuid: page.uuid,
                        // Explicit image wins; otherwise the first illustration in the
                        // Expanded Details is the entry image (the pre-data-model behavior)
                        img: sys.img || CodexParser.extractImage(page.text?.content || '') || '',
                        category: sys.category || '',
                        categoryIcon: sys.categoryIcon || '',
                        summary: sys.summary || '',
                        description: sys.summary || '', // legacy alias
                        plotHook: sys.plotHook || '',
                        location: sys.location || '',
                        links: sys.linkList,
                        link: sys.linkData, // legacy alias (first resolved link)
                        // Names only. Resolved to pages at render, not here: this parse
                        // is cached per page, but the name -> page index changes whenever
                        // ANY entry is added or renamed, so caching a resolution would
                        // leave "Phlan" unlinked after "Moonsea" is created.
                        related: Array.from(sys.related || []),
                        tags: Array.from(sys.tags || []),
                        hasExpandedDetails: sys.hasExpandedDetails,
                        DiscoveredBy: (sys.discoveredBy || []).join(', '),
                        pinId: page.getFlag(MODULE.ID, 'pinId') ?? null
                    };

                    if (entry.category.length > 0) {
                        entry.category = entry.category.charAt(0).toUpperCase() + entry.category.slice(1).toLowerCase();
                    }

                    // Split the location path into labeled hierarchy levels for display
                    const LOCATION_LEVELS = ['Realm', 'Region', 'Site', 'Area'];
                    entry.locationParts = entry.location
                        .split('>')
                        .map(p => p.trim())
                        .filter(Boolean)
                        .map((value, i) => ({ label: LOCATION_LEVELS[i] || `Level ${i + 1}`, value }));

                    if (entry) {
                        // Volatile per refresh: ownership reference and live pin/scene state
                        entry.ownership = page.ownership;

                        // Pin state — get() now includes sceneId for placed pins (Blacksmith 13.7.6+).
                        entry.pinSceneId = entry.pinId ? (getPinsApi()?.get?.(entry.pinId)?.sceneId ?? null) : null;
                        const activeSceneId = canvas?.scene?.id;
                        entry.hasPinOnScene = !!(entry.pinId && entry.pinSceneId);
                        entry.pinOnActiveScene = !!(
                            entry.pinId
                            && entry.pinSceneId
                            && activeSceneId
                            && entry.pinSceneId === activeSceneId
                        );
                        entry.pinSceneName = entry.pinSceneId
                            ? (game.scenes.get(entry.pinSceneId)?.name?.trim() || 'Unknown scene')
                            : '';

                        // Determine category - if no category, use "No Category"
                        let normCategory = "No Category";
                        if (entry.category && entry.category.trim()) {
                            normCategory = entry.category.trim();
                        }

                        // Add to categories set
                        this.categories.add(normCategory);
                        // Initialize category array if needed
                        if (!this.data[normCategory]) {
                            this.data[normCategory] = [];
                        }
                        // Add entry to category
                        this.data[normCategory].push(entry);
                        // Add tags
                        if (entry.tags && Array.isArray(entry.tags)) {
                            entry.tags.forEach(tag => this.allTags.add(tag));
                        }
                    }
                } catch (error) {
                    console.error('Error parsing codex entry:', error);
                }
            }

            // Surface legacy (pre-data-model) text pages to the GM once per session
            if (legacyPageCount > 0 && game.user.isGM && !this._legacyNoticeShown) {
                this._legacyNoticeShown = true;
                ui.notifications.warn(`Codex: ${legacyPageCount} legacy text page(s) in the codex journal are not shown. Re-import your codex JSON to convert them to codex pages.`);
            }
        }
    }

    /**
     * Paint the search and tag filters into the host's slot.
     *
     * `[data-codex-filters]` is a slot the host may provide, the same idiom as
     * `[data-codex-status]` in the footer: the host decides where its chrome lives,
     * the panel decides what goes in it. The codex browser puts the slot in the Tool
     * window's `toolBarLeft`, which is where Blacksmith's Compendium Search puts its
     * query and type controls.
     *
     * Falls back to prepending into the body, so a host that offers no slot — a
     * future tray, a test harness — still gets working filters.
     * @private
     */
    async _renderFilters(templateData) {
        const root = this.element;
        if (!root) return;
        const html = await renderTemplate(TEMPLATES.PANEL_CODEX_FILTERS, templateData);

        const slot = root.querySelector('[data-codex-filters]');
        if (slot) {
            slot.innerHTML = html;
            return;
        }
        const container = root.querySelector('[data-panel="panel-codex"]');
        if (container) container.insertAdjacentHTML('afterbegin', html);
    }

    /**
     * Wire the panel's interactions.
     *
     * Two passes with very different lifetimes:
     *
     *  - `_bindDelegatedListeners` runs ONCE per container element. Delegated
     *    handlers live on the container, which survives `innerHTML = html`, so a
     *    re-render costs no rebinding at all.
     *  - `_applyFilterState` runs on EVERY render, because the freshly written
     *    markup always starts unfiltered.
     *
     * This replaced 14 `cloneNode(true)` + `replaceChild` sites and ~20 per-node
     * `querySelectorAll().forEach(addEventListener)` loops. The clone idiom exists
     * to strip pre-existing listeners, but this ran once immediately after
     * `container.innerHTML = html`, so every node it touched was microseconds old
     * and carried none — roughly 2,200 deep subtree clones per render against a
     * 314-entry codex, for nothing. `.codex-entry-image img` was cloned too, which
     * can force an image re-decode.
     *
     * @param {HTMLElement|jQuery} html
     * @private
     */
    _activateListeners(html) {
        const container = getNativeElement(html);
        if (!container) return;
        this._bindDelegatedListeners(container);
        this._applyFilterState(container);
    }

    /**
     * Bind once per container. Idempotent: called on every render, binds on the
     * first, and rebinds only when the host hands us a different element — which
     * happens when the browser window itself re-renders.
     * @private
     */
    _bindDelegatedListeners(container) {
        if (this._boundContainer === container) return;
        this._listenersAbort?.abort();
        this._listenersAbort = new AbortController();
        this._boundContainer = container;
        const { signal } = this._listenersAbort;

        container.addEventListener('click', event => this._onPanelClick(event, container), { signal });
        container.addEventListener('input', event => this._onPanelInput(event, container), { signal });
    }

    /**
     * Show/hide entries and sections for the current filters.
     *
     * Live DOM filtering rather than a re-render, deliberately: re-rendering on every
     * keystroke would rebuild the search input and drop focus and caret position.
     * @private
     */
    _filterEntries(container) {
        const search = this.filters.search.trim().toLowerCase();
        container.querySelectorAll('.codex-entry').forEach(entry => {
            // An entry a player cannot observe never becomes visible, whatever the search says
            if (!game.user.isGM) {
                const ownershipDefault = entry.dataset.ownershipDefault;
                if (typeof ownershipDefault !== 'undefined'
                    && parseInt(ownershipDefault) < CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) {
                    entry.style.display = 'none';
                    return;
                }
            }
            // Match against a haystack computed once per render and cached on the
            // node, not `entry.textContent` per keystroke. Reading textContent forces
            // a layout-adjacent tree walk of the whole card — across 300+ entries, on
            // every character typed. Compendium Search reports 103ms across nine
            // compendium packs; a codex already in memory has no excuse to be slower.
            let haystack = entry._codexHaystack;
            if (haystack === undefined) {
                haystack = (entry.textContent || '').toLowerCase().replace(/\s+/g, ' ');
                entry._codexHaystack = haystack;
            }
            const matches = !search || haystack.includes(search);
            entry.style.display = matches ? '' : 'none';
        });

        // A category with nothing left visible hides itself
        container.querySelectorAll('.codex-section').forEach(section => {
            const hasVisible = Array.from(section.querySelectorAll('.codex-entry'))
                .some(entry => entry.style.display !== 'none');
            section.style.display = hasVisible ? '' : 'none';
        });
        this._notifyFiltered(container);
    }

    /** Clear every display override, so filtering starts from a known state. @private */
    _showAll(container) {
        container.querySelectorAll('.codex-entry, .codex-section')
            .forEach(el => { el.style.display = ''; });
        this._notifyFiltered(container);
    }

    /**
     * Tell the host that entry visibility changed.
     *
     * The codex browser's footer count reads the DOM, and search is debounced — so a
     * host listening on `input` would read the previous state and lag a keystroke
     * behind. An explicit signal after the work is the honest fix; a longer debounce
     * on the host side would only be a race that usually wins.
     * @private
     */
    _notifyFiltered(container) {
        (container ?? this.element)?.dispatchEvent(
            new CustomEvent('librarian.codexFiltered', { bubbles: true })
        );
    }

    /**
     * Re-apply stored category collapse to the DOM.
     *
     * Exact key match, the same lookup the template does at render time. The old
     * version compared `attrValue.trim() === category.trim()`, which let a junk key
     * like `" Locations\n "` claim a real section — the pollution
     * `_pruneCategoryFlags` exists to clean up after.
     * @private
     */
    _restoreCollapsedFromFlag(container) {
        const collapsed = game.user.getFlag(MODULE.ID, 'codexCollapsedCategories') || {};
        for (const [category, isCollapsed] of Object.entries(collapsed)) {
            if (!isCollapsed) continue;
            const section = container.querySelector(`.codex-section[data-category="${CSS.escape(category)}"]`);
            if (section) section.classList.add('collapsed');
        }
    }

    /**
     * Post-render pass. The template always emits every entry visible, so anything
     * the user had filtered out has to be re-hidden here.
     * @private
     */
    _applyFilterState(container) {
        const hasSearch = !!this.filters.search;
        const hasTags = !!this.filters.tags?.length;

        const clearButton = container.querySelector('.clear-search');
        if (clearButton) clearButton.classList.toggle('disabled', !hasSearch);

        if (!hasSearch && !hasTags) {
            this._showAll(container);
            return;
        }
        this._filterEntries(container);
    }

    /**
     * Delegated `input`.
     *
     * Debounced, matching the 140ms Blacksmith's Compendium Search uses: long enough
     * to skip a fast typist's intermediate states, short enough to feel immediate.
     * Filtering itself is synchronous DOM work, so an unthrottled handler does it
     * once per character.
     * @private
     */
    _onPanelInput(event, container) {
        const input = event.target;
        if (!input.matches?.('.codex-search input')) return;
        clearTrackedTimeout(this._searchDebounce);
        this._searchDebounce = trackModuleTimeout(() => this._applySearch(input, container), 140);
    }

    /** @private */
    _applySearch(input, container) {
        this.filters.search = String(input.value || '').toLowerCase().trim();
        this._showAll(container);

        const clearButton = container.querySelector('.clear-search');
        if (clearButton) clearButton.classList.toggle('disabled', !this.filters.search);

        if (this.filters.search) {
            // Searching looks through collapsed categories, so open them all — in the
            // DOM only. The stored collapse state is untouched and comes back when the
            // search is cleared.
            container.querySelectorAll('.codex-section').forEach(s => s.classList.remove('collapsed'));
            this._filterEntries(container);
            return;
        }

        this._restoreCollapsedFromFlag(container);
        if (this.filters.tags?.length) {
            container.querySelectorAll('.codex-section').forEach(s => s.classList.remove('collapsed'));
            this._filterEntries(container);
        }
    }

    /**
     * Delegated `click`. Ordered most-specific-first, because these selectors nest —
     * an entry's menu button sits inside its title row, which sits inside the card.
     * @private
     */
    async _onPanelClick(event, container) {
        const target = event.target;
        const hit = selector => target.closest?.(selector);

        // --- Entry collapse ---------------------------------------------------
        const entryToggle = hit('.codex-entry-toggle');
        if (entryToggle) {
            event.stopPropagation();
            this._toggleEntryCollapsed(entryToggle.closest('.codex-entry'));
            return;
        }

        // --- Per-entry controls -----------------------------------------------
        const menuBtn = hit('.codex-entry-menu');
        if (menuBtn) {
            event.preventDefault();
            event.stopPropagation();
            this._openEntryMenu(event, menuBtn);
            return;
        }

        const visBtn = hit('.codex-entry-visibility');
        if (visBtn) {
            event.preventDefault();
            event.stopPropagation();
            await this._toggleEntryVisibility(visBtn);
            return;
        }

        const pinBtn = hit('.codex-entry-pin');
        if (pinBtn) {
            event.preventDefault();
            event.stopPropagation();
            await this._toggleEntryPin(pinBtn);
            return;
        }

        const locateBtn = hit('.codex-entry-locate');
        if (locateBtn) {
            event.preventDefault();
            event.stopPropagation();
            panToPin(locateBtn.dataset.pinId);
            return;
        }

        // --- Anything that opens a journal page --------------------------------
        // "Read more", the player feather, and legacy `data-uuid` links all open the
        // parent journal focused on the page. `page.sheet.render(true)` would open the
        // page's standalone EDIT sheet instead, which is not the reading view.
        const pageLink = hit('.codex-read-more') || hit('.codex-entry-feather-user') || hit('.codex-entry-link');
        if (pageLink?.dataset?.uuid) {
            event.preventDefault();
            event.stopPropagation();
            const page = await fromUuid(pageLink.dataset.uuid);
            if (page?.parent) page.parent.sheet.render(true, { pageId: page.id });
            return;
        }

        // --- Codex cross-references --------------------------------------------
        // `related` names and location levels point at codex ENTRIES, not documents,
        // so they reveal the entry in this panel — the same destination as
        // double-clicking its pin. Document `links` are untouched and keep Foundry's
        // own content-link behaviour.
        const ref = hit('.codex-ref[data-uuid]');
        if (ref) {
            event.preventDefault();
            event.stopPropagation();
            if (this._focusEntry(ref.dataset.uuid)) return;
            ui.notifications.info(`"${ref.textContent}" is filtered out of the current view.`);
            return;
        }

        // --- Entry image ---------------------------------------------------------
        if (target.matches?.('.codex-entry-image img')) {
            event.preventDefault();
            event.stopPropagation();
            await this._openEntryImage(target);
            return;
        }

        // --- Entry title, after the controls that sit inside it -------------------
        const entryName = hit('.codex-entry-name');
        if (entryName) {
            event.preventDefault();
            event.stopPropagation();
            this._toggleEntryCollapsed(entryName.closest('.codex-entry'));
            return;
        }

        // --- Tag cloud ------------------------------------------------------------
        const tag = hit('.codex-tag-cloud .codex-tag');
        if (tag) {
            event.preventDefault();
            this._toggleTagFilter(tag.dataset.tag, container);
            return;
        }

        if (hit('.toggle-tags-button')) {
            const tagCloud = container.querySelector('.codex-tag-cloud');
            if (tagCloud) {
                game.user.setFlag(MODULE.ID, 'codexTagCloudCollapsed', !tagCloud.classList.contains('collapsed'));
                this.render(this.element);
            }
            return;
        }

        // --- Titlebar --------------------------------------------------------------
        if (hit('.codex-titlebar-menu')) {
            event.preventDefault();
            event.stopPropagation();
            this._openTitlebarMenu(event);
            return;
        }

        if (hit('.add-codex-button')) {
            await this._onAddEntry();
            return;
        }

        if (hit('.clear-search')) {
            this._clearFilters(container);
            return;
        }

        // --- Category collapse ------------------------------------------------------
        // Only the chevron and the heading toggle, not the whole header bar.
        const categoryHeader = hit('.codex-category');
        if (categoryHeader && (hit('.fa-chevron-down') || hit('h3'))) {
            event.preventDefault();
            event.stopPropagation();
            const section = categoryHeader.closest('.codex-section');
            if (!section) return;
            this._setCategoryCollapsed(section.dataset.category, section.classList.toggle('collapsed'));
        }
    }

    /** @private */
    _clearFilters(container) {
        this.filters.search = '';
        this.filters.tags = [];
        const input = container.querySelector('.codex-search input');
        if (input) input.value = '';
        container.querySelectorAll('.codex-tag.selected').forEach(t => t.classList.remove('selected'));
        this._showAll(container);
        this._restoreCollapsedFromFlag(container);
        this.render(this.element);
    }

    /** @private */
    _toggleTagFilter(tagValue, container) {
        const index = this.filters.tags.indexOf(tagValue);
        if (index === -1) this.filters.tags.push(tagValue);
        else this.filters.tags.splice(index, 1);

        this._showAll(container);

        if (this.filters.tags.length > 0) {
            // Expanded in the DOM only. render() independently treats an active tag
            // filter as "no categories collapsed", so the stored state never needs
            // touching — this used to clear `codexCollapsedCategories` outright and
            // never restore it, permanently expanding every category for that user.
            container.querySelectorAll('.codex-section').forEach(s => s.classList.remove('collapsed'));
        } else {
            this._restoreCollapsedFromFlag(container);
        }
        this.render(this.element);
    }

    /** @private */
    async _onAddEntry() {
        if (!game.user.isGM) return;
        const journalId = game.settings.get(MODULE.ID, 'codexJournal');
        if (!journalId || journalId === 'none') {
            ui.notifications.warn('No codex journal selected. Use the … menu to select one.');
            return;
        }
        if (!game.journal.get(journalId)) {
            ui.notifications.error('Could not find the codex journal.');
            return;
        }
        await openCodexWindow();
    }

    /** @private */
    async _openEntryImage(imgEl) {
        const src = imgEl.getAttribute('src');
        if (!src) return;
        const uuid = imgEl.closest('.codex-entry')?.dataset?.uuid || null;
        let title = imgEl.getAttribute('alt') || 'Codex Image';
        if (uuid) {
            try {
                const page = await fromUuid(uuid);
                if (page?.name) title = page.name;
            } catch (_) { /* fall back to the alt text */ }
        }
        // v13 AppV2 signature: src and title live in options
        new foundry.applications.apps.ImagePopout({ src, uuid, shareable: true, window: { title } }).render(true);
    }

    /** @private */
    async _toggleEntryVisibility(button) {
        if (!game.user.isGM) return;
        const uuid = button.dataset.uuid;
        if (!uuid) return;
        const page = await fromUuid(uuid);
        if (!page) return;

        const current = page.ownership?.default ?? 0;
        const next = current >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER
            ? CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE
            : CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
        const isVisible = next >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;

        // Skip the full re-render this ownership change would otherwise trigger via
        // the updateJournalEntryPage hook: it resets scroll and collapses cards,
        // making the GM re-find their place. Patch the icon in place instead.
        await page.update({ 'ownership.default': next }, { librarianSkipCodexRender: true });
        await updateCodexPinVisibility(uuid);

        button.classList.toggle('visible', isVisible);
        button.setAttribute('title', isVisible ? 'Hide from Players' : 'Show to Players');
        const menuIcon = button.parentNode?.querySelector(`.codex-entry-menu[data-uuid="${CSS.escape(uuid)}"]`);
        if (menuIcon) menuIcon.dataset.visible = String(isVisible);
    }

    /** @private */
    async _toggleEntryPin(button) {
        if (!game.user.isGM) return;
        const { uuid, name, category, hasPinOnScene } = button.dataset;
        if (hasPinOnScene === 'true') {
            // Unplace from the scene, keeping the pin's design; sync hooks re-render
            await unplaceCodexPin(uuid);
            await this._refreshData();
            this.render(this.element);
            return;
        }
        // Enter canvas placement mode; sync hooks re-render when the pin lands
        await beginCodexPinPlacement(uuid, name, category);
    }

    /** @private */
    _openEntryMenu(event, button) {
        if (!game.user.isGM) return;
        const ctxMenu = getBlacksmith()?.uiContextMenu;
        if (!ctxMenu?.show) return;

        const uuid = button.dataset.uuid;
        const entryEl = button.closest('.codex-entry');
        const hasPinId = !!entryEl?.dataset?.pinId;

        ctxMenu.show({
            id: `${MODULE.ID}-codex-entry-menu`,
            x: event.clientX,
            y: event.clientY,
            zones: {
                gm: [
                    {
                        name: 'Open Journal Page',
                        icon: 'fa-solid fa-feather',
                        callback: async () => {
                            const doc = await fromUuid(uuid);
                            // Reading view, not the page's standalone edit sheet
                            if (doc?.parent) doc.parent.sheet.render(true, { pageId: doc.id });
                            else if (doc) doc.sheet.render(true);
                        }
                    },
                    {
                        name: 'Edit Entry',
                        icon: 'fa-solid fa-pen',
                        callback: async () => {
                            const page = await fromUuid(uuid);
                            if (page) await openCodexWindow({ page });
                        }
                    },
                    ...(hasPinId ? [{
                        name: 'Configure Pin',
                        icon: 'fa-solid fa-palette',
                        callback: async () => {
                            const pins = getPinsApi();
                            const pinId = entryEl?.dataset?.pinId;
                            if (pins?.configure && pinId) await pins.configure(pinId);
                        }
                    },
                    {
                        name: 'Clear Pin',
                        icon: 'fa-solid fa-eraser',
                        callback: async () => {
                            await deleteCodexPin(uuid);
                            await this._refreshData();
                            this.render(this.element);
                        }
                    }] : []),
                    {
                        name: 'Delete Entry',
                        icon: 'fa-solid fa-trash',
                        callback: async () => {
                            const confirmed = await getBlacksmith().dialog.confirm({
                                title: 'Delete Entry',
                                content: '<p>Delete this codex entry? This cannot be undone.</p>',
                                confirmLabel: 'Delete Entry',
                                confirmIcon: 'fa-solid fa-trash',
                                destructive: true
                            });
                            if (!confirmed) return;
                            if (hasPinId) await deleteCodexPin(uuid);
                            const page = await fromUuid(uuid);
                            if (page) await page.delete();
                        }
                    }
                ]
            }
        });
    }

    /**
     * The codex actions, as context-menu items.
     *
     * Public because the Tool window nests these as a **submenu** under its own
     * controls menu rather than opening a second context menu of its own — one
     * `…`, one menu. `getCodexMenuItems()` returns the flat list a submenu wants;
     * `_openTitlebarMenu` below still exists for a host that renders its own
     * `.codex-titlebar-menu` button and has nowhere to nest into.
     *
     * @returns {Array<{name: string, icon: string, callback: Function}>}
     */
    getCodexMenuItems() {
        const coreItems = [{
            name: 'Refresh Codex',
            icon: 'fa-solid fa-sync-alt',
            callback: async () => {
                await this._refreshData();
                this.render(this.element);
                ui.notifications.info('Codex refreshed.');
            }
        }];
        if (this.selectedJournal) {
            coreItems.unshift({
                name: 'Open Codex Journal',
                icon: 'fa-solid fa-feather',
                callback: () => this.selectedJournal.sheet.render(true)
            });
        }

        const gmItems = game.user.isGM ? [
            {
                name: 'Select Journal for Codex',
                icon: 'fa-solid fa-cog',
                callback: () => showJournalPicker({
                    title: 'Select Codex Journal',
                    selectedId: game.settings.get(MODULE.ID, 'codexJournal'),
                    onSelect: async journalId => { await game.settings.set(MODULE.ID, 'codexJournal', journalId); },
                    reRender: async () => { await this._refreshData(); this.render(this.element); }
                })
            },
            { name: 'Auto-Discover from Party Inventories', icon: 'fa-solid fa-search-plus', callback: () => this._autoDiscoverFromInventories() },
            { name: 'Auto-Link Unresolved Links',           icon: 'fa-solid fa-link',        callback: () => this._autoLinkUnresolved() },
            { name: 'Import Codex from JSON',               icon: 'fa-solid fa-file-import', callback: () => this._openImportCodexDialog() },
            { name: 'Export Codex as JSON',                 icon: 'fa-solid fa-file-export', callback: () => this._openExportCodexDialog() }
        ] : [];

        return [...coreItems, ...gmItems];
    }

    /**
     * Open the codex actions as a standalone context menu.
     *
     * Only for a host that renders its own `.codex-titlebar-menu` button — the Tool
     * window does not, and nests `getCodexMenuItems()` as a submenu instead. The
     * panel's delegated click handler still recognises that class, so this stays.
     *
     * `event` may be null: Blacksmith's Tool base calls a header action's `onClick`
     * with the click event for a title-bar button and with `null` from the controls
     * context menu (`window-tool-base.js:360`). `fallbackEl` anchors that case.
     *
     * @param {MouseEvent|null} event
     * @param {HTMLElement|null} [fallbackEl] anchor when there is no event
     * @private
     */
    _openTitlebarMenu(event, fallbackEl = null) {
        const blacksmith = getBlacksmith();
        if (!blacksmith?.uiContextMenu?.show) return;

        let x = event?.clientX;
        let y = event?.clientY;
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            const rect = (fallbackEl ?? this.element)?.getBoundingClientRect?.();
            x = rect ? rect.right - 8 : 0;
            y = rect ? rect.top + 8 : 0;
        }

        blacksmith.uiContextMenu.show({
            id: `${MODULE.ID}-codex-titlebar-menu`,
            x,
            y,
            zones: { core: this.getCodexMenuItems() }
        });
    }


    /**
     * Auto-discover codex entries from party inventories
     * @private
     */
    /**
     * Retry every unresolved codex link against Blacksmith's compendium mapping.
     *
     * Only `links` need this. `related` names and location levels resolve against
     * the journal's own pages at render, so they heal on their own — this is for
     * document links, which are a cross-module lookup too expensive to redo per
     * render and which cannot self-heal.
     *
     * Manual by design: it is a bulk write to journal pages, so the GM triggers it.
     */
    async _autoLinkUnresolved() {
        if (!game.user.isGM) return;
        if (!this.selectedJournal) {
            ui.notifications.warn('No codex journal selected.');
            return;
        }

        const pages = (this.selectedJournal.pages?.contents ?? [])
            .filter(p => p.type === CODEX_PAGE_TYPE);
        const pending = pages.filter(p =>
            (p.system?.links ?? []).some(l => !String(l?.uuid ?? '').trim() && String(l?.name ?? '').trim())
        );

        if (!pending.length) {
            ui.notifications.info('Auto-Link: every codex link is already resolved.');
            return;
        }

        this.isImporting = true;
        this._setStatus(`Auto-linking ${pending.length} ${pending.length === 1 ? 'entry' : 'entries'}...`);

        const reports = [];
        let linked = 0;
        let touched = 0;

        try {
            for (let i = 0; i < pending.length; i++) {
                const page = pending[i];
                this._updateProgressBar((i / pending.length) * 100, `Auto-linking: ${page.name}`);

                const existing = (page.system?.links ?? []).map(normalizeCodexLink);
                // Only the unresolved ones go back to the resolver; anything already
                // linked is left exactly as it is.
                const unresolved = existing.filter(l => !l.uuid && l.name);
                const { links: retried, reports: entryReports } = await resolveCodexLinks({
                    // No name/category: a self-link was already tried at import and a
                    // speculative retry would just re-report the same non-miss.
                    links: unresolved.map(l => ({ name: l.name, type: l.type, label: l.label }))
                });
                reports.push(...entryReports);

                const byKey = new Map(retried.map(l => [codexLinkKey(l), l]));
                let changed = false;
                const merged = existing.map(l => {
                    if (l.uuid) return l;
                    const hit = byKey.get(codexLinkKey(l));
                    if (!hit?.uuid) return l;
                    changed = true;
                    linked++;
                    return hit;
                });

                if (changed) {
                    await page.update({ 'system.links': merged });
                    touched++;
                }
                if (i % 5 === 0) await moduleDelay(50);
            }

            this._setStatus('Auto-Link complete');

            ui.notifications.info(
                linked
                    ? `Auto-Link: resolved ${linked} ${linked === 1 ? 'link' : 'links'} across ${touched} ${touched === 1 ? 'entry' : 'entries'}.`
                    : 'Auto-Link: nothing new resolved — those documents still do not exist.'
            );
            reportResolution(reports, 'Auto-Link');
        } catch (error) {
            console.error('Coffee Pub Librarian | Auto-Link failed:', error);
            ui.notifications.error('Auto-Link failed. See console for details.');
        } finally {
            this.isImporting = false;
            trackModuleTimeout(() => this._hideProgressBar(), 2000);
            await this._refreshData();
            this.render(this.element);
        }
    }

    async _autoDiscoverFromInventories() {
        if (!this.selectedJournal) {
            ui.notifications.warn('No codex journal selected. Please select a journal first.');
            return;
        }

        // Suppresses the per-page re-render the journal-routing hook would otherwise
        // fire for each entry this reveals. Cleared in `finally` — an early return
        // that skipped it used to leave the panel permanently ignoring journal
        // updates for the rest of the session.
        this.isImporting = true;

        try {
            ui.notifications.info('Starting auto-discovery scan...');
            this._setStatus('Starting scan...');

            // The campaign's party, not whoever happens to be standing on the open
            // scene. Discovery is about what the party OWNS — an item in a PC's
            // backpack reveals its codex entry whether or not that PC is deployed,
            // and scanning the canvas silently skipped anyone who wasn't.
            const partyActors = getPartyActors();

            if (partyActors.length === 0) {
                ui.notifications.warn(
                    hasPrimaryParty()
                        ? 'No party members found. The configured party has no player characters.'
                        : "No party members found. No primary party is set — configure one in Blacksmith's campaign settings."
                );
                this._setStatus('No party members found');
                return;
            }

            // ----- Pass 1: what does the party own? ---------------------------
            const inventoryItems = new Set();
            for (const [index, actor] of partyActors.entries()) {
                this._updateProgressBar((index / partyActors.length) * 20, `Scanning ${actor.name}`);
                for (const item of actor.items?.contents ?? []) {
                    // Contained items are already in `items` — see CODEX_SCAN_ITEM_TYPES.
                    if (CODEX_SCAN_ITEM_TYPES.includes(item.type)) inventoryItems.add(normalizeName(item.name));
                }
            }

            if (inventoryItems.size === 0) {
                ui.notifications.warn("No inventory items found in party members' inventories.");
                this._setStatus('No inventory items found');
                return;
            }

            // ----- Pass 2: which hidden entries does that reveal? --------------
            const discovered = [];
            const totalEntries = Object.values(this.data).flat().length;
            let processed = 0;

            for (const entries of Object.values(this.data)) {
                for (const entry of entries) {
                    processed++;
                    this._updateProgressBar(20 + ((processed / totalEntries) * 80), `Scanning: ${entry.name}`);

                    // Yield periodically so a long scan does not freeze the UI thread.
                    // This is the only pause left: the scan used to interleave delays
                    // of 200ms per actor, 1.2s per discovery, and 5s at the end, purely
                    // to make a progress bar readable that had not existed since Squire
                    // 13.6.0. See _showProgressBar.
                    if (processed % 5 === 0) await moduleDelay(50);

                    const entryName = normalizeName(entry.name);
                    if (!inventoryItems.has(entryName)) continue;

                    const page = await fromUuid(entry.uuid);
                    if (!page || (page.ownership?.default ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) continue;

                    // Same list, same normalizer as the pass that built `inventoryItems`
                    // — the two must agree or an entry matches with nobody credited.
                    const discoverers = partyActors
                        .filter(actor => (actor.items?.contents ?? []).some(item =>
                            CODEX_SCAN_ITEM_TYPES.includes(item.type) && normalizeName(item.name) === entryName))
                        .map(actor => actor.name);

                    await page.update({ 'ownership.default': CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER });
                    if (discoverers.length) await this._addDiscoveredByInfo(page, discoverers);

                    discovered.push(entry.name);
                    this._setStatus(`Found: ${entry.name}`);
                }
            }

            const summary = discovered.length
                ? `Auto-discovery revealed ${discovered.length} ${discovered.length === 1 ? 'entry' : 'entries'}: ${discovered.join(', ')}`
                : 'Auto-discovery found nothing new.';
            ui.notifications.info(summary);
            this._setStatus(discovered.length ? `Revealed ${discovered.length}` : 'Nothing new found');
        } catch (error) {
            console.error('Coffee Pub Librarian | Auto-discovery failed:', error);
            ui.notifications.error(`Auto-discovery failed: ${error.message}`);
            this._setStatus('Auto-discovery failed');
        } finally {
            this.isImporting = false;
            await this._refreshData();
            this.render(this.element);
            trackModuleTimeout(() => this._setStatus(''), 4000);
        }
    }

    /**
     * Open the Import Codex from JSON dialog (used from titlebar menu).
     * @private
     */
    async _openImportCodexDialog() {
        // On failure this stays empty rather than holding an error string. It used
        // to be set to 'Failed to load prompt-codex.txt.', which Copy Template then
        // put on the GM's clipboard under a success toast.
        let template = '';
        try {
            const response = await fetch(`modules/${MODULE.ID}/prompts/prompt-codex.txt`);
            if (response.ok) template = await response.text();
            else console.error(`${MODULE.TITLE} | prompt-codex.txt failed to load: ${response.status}`);
        } catch (error) {
            console.error(`${MODULE.TITLE} | prompt-codex.txt failed to load:`, error);
        }
        await showBlacksmithWait({
            title: 'Import Codex from JSON',
            width: 600,
            resizable: true,
            content: await renderTemplate(`modules/${MODULE.ID}/templates/window-import-export.hbs`, {
                type: 'codex',
                isImport: true,
                isExport: false,
                jsonInputId: 'codex-import-json'
            }),
            buttons: {
                cancel: { icon: '<i class="fa-solid fa-times"></i>', label: 'Cancel Import' },
                import: {
                    icon: '<i class="fa-solid fa-file-import"></i>',
                    label: 'Import JSON',
                    callback: async (html) => {
                        ui.notifications.info('Importing Codex entries. This may take some time as entries are added, updated, indexed, and sorted. You will be notified when the process is complete.');
                        this.isImporting = true;
                        this._showProgressBar();
                        try {
                            let nativeDlgHtml = html;
                            if (html && (html.jquery || typeof html.find === 'function')) nativeDlgHtml = html[0] || html.get?.(0) || html;
                            const jsonInput = nativeDlgHtml.querySelector('#codex-import-json');
                            const value = jsonInput?.value || '';
                            const data = JSON.parse(value);
                            if (!Array.isArray(data)) {
                                ui.notifications.error('Imported JSON must be an array of entries.');
                                return;
                            }
                            if (!this.selectedJournal) {
                                ui.notifications.error('No Codex journal selected.');
                                return;
                            }
                            this._updateProgressBar(10, 'Validating import data...');
                            const duplicateNames = findDuplicateNames(data);
                            if (duplicateNames.length > 0) ui.notifications.warn(`Warning: Import data contains duplicate entry names: ${duplicateNames.join(', ')}. These will be merged with existing entries.`);
                            this._updateProgressBar(20, `Processing ${data.length} entries...`);
                            // Filled as entries resolve their links; reported once below.
                            this._resolveReports = [];
                            let added = 0, updated = 0, duplicatesMerged = 0;
                            const failures = [];
                            const totalEntries = data.length;
                            for (let i = 0; i < data.length; i++) {
                                const entry = data[i];
                                const entryProgress = 20 + ((i / totalEntries) * 60);
                                this._updateProgressBar(entryProgress, `Processing: ${entry?.name ?? `Entry ${i + 1}`}`);
                                // Per-entry validate-then-import, matching the contract in
                                // import-codex.js. One bad entry is reported and skipped
                                // rather than aborting the run — the old inline version let
                                // a single throw take the whole import down to 'Invalid JSON.'
                                try {
                                    const { validationWarnings } = validateCodexEntry(entry);
                                    for (const warning of validationWarnings) ui.notifications.warn(warning);
                                    const result = await importCodexEntry(entry, this.selectedJournal);
                                    this._resolveReports?.push(...result.resolveReports);
                                    if (result.outcome === 'added') added++;
                                    else updated++;
                                    if (result.duplicateMerged) duplicatesMerged++;
                                } catch (error) {
                                    const label = entry?.name ? `"${entry.name}"` : `entry ${i + 1}`;
                                    failures.push(`${label}: ${error?.message ?? error}`);
                                    console.error(`${MODULE.TITLE} | Codex import failed for ${label}:`, error);
                                }
                                if (i % 5 === 0) await moduleDelay(100);
                            }
                            this._updateProgressBar(80, 'Sorting entries...');
                            await sortCodexPages(this.selectedJournal);
                            this._updateProgressBar(90, 'Finalizing import...');
                            let message = `Codex import complete: ${added} added, ${updated} updated.`;
                            if (duplicatesMerged > 0) message += ` ${duplicatesMerged} duplicates were merged.`;
                            ui.notifications.info(message);
                            if (failures.length > 0) {
                                ui.notifications.error(
                                    `${failures.length} codex ${failures.length === 1 ? 'entry' : 'entries'} could not be imported. See the console for details.`
                                );
                            }
                            reportResolution(this._resolveReports, 'Codex import');
                            this._resolveReports = null;
                            // Unresolved links are kept, not dropped — tell the GM the
                            // retry exists rather than running a bulk write unasked.
                            const stillUnresolved = countUnresolvedLinks(this.selectedJournal);
                            if (stillUnresolved > 0) {
                                ui.notifications.info(
                                    `${stillUnresolved} codex ${stillUnresolved === 1 ? 'link is' : 'links are'} still unresolved and kept as plain text. `
                                    + `Run "Auto-Link Unresolved Links" from the codex menu once those documents exist.`
                                );
                            }
                            this._updateProgressBar(100, 'Import complete!');
                            await moduleDelay(2000);
                            this._hideProgressBar();
                            this.isImporting = false;
                            await this._refreshData();
                            this.render(this.element);
                        } catch (e) {
                            this._hideProgressBar();
                            this.isImporting = false;
                            ui.notifications.error('Invalid JSON.');
                        }
                    }
                }
            },
            default: 'import',
            render: (html) => {
                let nativeDlgHtml = html;
                if (html && (html.jquery || typeof html.find === 'function')) nativeDlgHtml = html[0] || html.get?.(0) || html;
                const cancelButton = nativeDlgHtml.querySelector('[data-button="cancel"]');
                if (cancelButton) cancelButton.classList.add('librarian-cancel-button');
                const importButton = nativeDlgHtml.querySelector('[data-button="import"]');
                if (importButton) importButton.classList.add('librarian-submit-button');
                const copyTemplateButton = nativeDlgHtml.querySelector('.copy-template-button');
                if (copyTemplateButton) {
                    copyTemplateButton.addEventListener('click', () => {
                        if (!template) {
                            ui.notifications.error('The codex prompt template could not be loaded. See the console for details.');
                            return;
                        }
                        // copyToClipboard reports its own success; a second toast here
                        // fired even when the copy had failed.
                        copyToClipboard(fillCampaignPlaceholders(template));
                    });
                }
                const browseFileButton = nativeDlgHtml.querySelector('.browse-file-button');
                if (browseFileButton) {
                    browseFileButton.addEventListener('click', () => {
                        const fileInput = nativeDlgHtml.querySelector('#import-file-input');
                        if (fileInput) fileInput.click();
                    });
                }
                const fileInput = nativeDlgHtml.querySelector('#import-file-input');
                if (fileInput) {
                    fileInput.addEventListener('change', async (event) => {
                        const file = event.target.files[0];
                        if (!file) return;
                        try {
                            if (!file.name.toLowerCase().endsWith('.json')) {
                                ui.notifications.error('Please select a JSON file.');
                                return;
                            }
                            const text = await file.text();
                            let importData;
                            try {
                                importData = JSON.parse(text);
                            } catch (e) {
                                ui.notifications.error('Invalid JSON in file: ' + e.message);
                                return;
                            }
                            if (!Array.isArray(importData)) {
                                ui.notifications.error('Invalid file format: Must be an array of codex entries.');
                                return;
                            }
                            const jsonInput = nativeDlgHtml.querySelector('#codex-import-json');
                            if (jsonInput) jsonInput.value = text;
                            ui.notifications.info(`File "${file.name}" loaded successfully! Review the content below and click Import when ready.`);
                            event.target.value = '';
                        } catch (error) {
                            console.error('Error reading file:', error);
                            ui.notifications.error(`Error reading file: ${error.message}`);
                        }
                    });
                }
            }
        }, { classes: ['import-export-dialog'], id: 'import-export-dialog-codex-import' });
    }

    /**
     * Open the Export Codex as JSON dialog (used from titlebar menu).
     * @private
     */
    async _openExportCodexDialog() {
        // Refresh first. Exporting from whatever `this.data` happened to hold means
        // a page created or edited since the last render is silently absent from the
        // file. The quest export has always done this; the codex one did not.
        await this._refreshData();

        if (!this.selectedJournal) {
            ui.notifications.error('No codex journal selected. Nothing to export.');
            return;
        }

        // What the journal says SHOULD be in the file. Legacy text pages are
        // deliberately not counted — they are not codex entries and re-import is
        // their conversion path.
        const expectedCount = this.selectedJournal.pages.contents
            .filter(p => p.type === CODEX_PAGE_TYPE).length;

        // Pages whose content could not be read. Previously swallowed, which made a
        // page we failed to open indistinguishable from one that genuinely has no
        // Expanded Details — the export succeeded and quietly dropped the lore.
        const unreadable = [];

        const exportData = [];
        for (const cat of this.categories) {
            for (const entry of (this.data[cat] || [])) {
                // Export only the EXPLICIT image (system.img) — an image derived from
                // the first Expanded Details illustration already travels inside
                // expandedDetails and would be duplicated if exported here too
                let img = null;

                // Expanded Details is the page's raw text content — exported raw so
                // @UUID links and embeds survive a round trip through export → import
                let expandedDetails = null;
                try {
                    const page = await fromUuid(entry.uuid);
                    if (!page) throw new Error('page did not resolve');
                    const raw = typeof page?.text?.content === 'string' ? page.text.content : '';
                    if (raw.trim()) expandedDetails = raw;
                    img = (typeof page?.system?.img === 'string' && page.system.img) ? page.system.img : null;
                } catch (error) {
                    // Recorded, not swallowed. The export is refused below rather than
                    // shipping this entry stripped of its lore under a success message.
                    unreadable.push(entry.name || entry.uuid);
                    console.error(`${MODULE.TITLE} | Codex export could not read "${entry.name}":`, error);
                }
                if (img) {
                    const origin = window.location.origin + '/';
                    if (img.startsWith(origin)) img = img.slice(origin.length);
                }

                // Emit the authoring shape, not the render shape: `key`/`resolved`
                // are computed by linkList and must not round-trip. An unresolved
                // link exports as { name, type } — exactly what the AI prompt asks
                // for — so export → import → Auto-Link is lossless.
                const links = (entry.links || []).map(l => {
                    const out = {};
                    if (l.name) out.name = l.name;
                    if (l.type) out.type = l.type;
                    if (l.uuid) out.uuid = l.uuid;
                    if (l.label && l.label !== l.name) out.label = l.label;
                    return out;
                }).filter(l => Object.keys(l).length > 0);

                exportData.push({
                    name: entry.name,
                    img,
                    category: entry.category || null,
                    summary: entry.summary || '',
                    plotHook: entry.plotHook || null,
                    location: entry.location || null,
                    links,
                    related: entry.related || [],
                    tags: entry.tags || [],
                    uuid: entry.uuid,
                    expandedDetails
                });
            }
        }
        // Refuse a partial rather than write one.
        //
        // An export is a backup, and the dangerous failure is not an error — it is a
        // file that looks complete and is not, discovered only when someone tries to
        // restore it. Three ways that happened here: `_refreshData` skips (and logs)
        // a page that throws while parsing, a page whose content will not read used
        // to export as if it simply had no lore, and the whole thing used to run off
        // stale data.
        //
        // The scenario Blacksmith flagged — a subtype page refused at world load
        // while Librarian is disabled — cannot be caught from here, because this
        // panel cannot open in that state. It is covered in the migration runbook
        // instead: never take a codex backup with Librarian disabled.
        if (unreadable.length || exportData.length !== expectedCount) {
            const reasons = [];
            if (exportData.length !== expectedCount) {
                reasons.push(`the journal holds ${expectedCount} codex ${expectedCount === 1 ? 'page' : 'pages'} but only ${exportData.length} could be gathered`);
            }
            if (unreadable.length) {
                reasons.push(`${unreadable.length} could not be read (${unreadable.slice(0, 5).join(', ')}${unreadable.length > 5 ? ', …' : ''})`);
            }
            ui.notifications.error(
                `Codex export refused: ${reasons.join('; ')}. `
                + `A partial export that reports success is worse than no export. See the console for the failures.`
            );
            return;
        }

        const jsonString = JSON.stringify(exportData, null, 2);
        const sanitizeWindowsFilename = name => name
            .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
            .replace(/\s+$/g, '')
            .replace(/\.+$/g, '')
            .slice(0, 150);
        const stamp = new Date().toISOString().replace(/[:]/g, '-');
        const { openDataExportWindow } = await import('./window-data-export.js');
        openDataExportWindow({
            title: 'Export Codex as JSON',
            data: jsonString,
            filename: sanitizeWindowsFilename(`COFFEEPUB-LIBRARIAN-codex-export-${stamp}.json`),
            summary: [
                // Both numbers, deliberately: "312 of 312" is checkable at a glance in
                // a way that "312 entries" is not.
                { label: 'Total Exported', value: `${exportData.length} of ${expectedCount} codex entries` },
                { label: 'Format', value: 'Codex export v1.0' },
                { label: 'Created', value: new Date().toLocaleString() }
            ]
        });
    }

    /**
     * Add "Discovered By" information to a journal entry.
     * @private
     * @param {JournalEntryPage} page - The journal entry page to update.
     * @param {string[]} discoverers - An array of character names who discovered the entry.
     */
    async _addDiscoveredByInfo(page, discoverers) {
        try {
            // Typed pages: merge into system.discoveredBy — no HTML manipulation
            const existing = Array.from(page.system?.discoveredBy || []);
            const allDiscoverers = [...new Set([...existing, ...discoverers])];
            await page.update({ 'system.discoveredBy': allDiscoverers });
        } catch (error) {
            console.error('Error updating "Discovered By" information:', error);
        }
    }

    /**
     * Render the codex panel
     * @param {HTMLElement|jQuery} element - The element to render into (may be jQuery, will be converted)
     */
    async render(element) {
        if (!element) return;
        // v13: Convert jQuery to native DOM if needed
        this.element = getNativeElement(element);

        // codexContainer is guaranteed native DOM (from querySelector on already-converted element)
        const codexContainer = this.element?.querySelector('[data-panel="panel-codex"]');
        if (!codexContainer) return;

        // Refresh data if needed
        await this._refreshData();

        // Get collapsed states
        this._pruneCategoryFlags();
        const collapsedCategories = this.filters.tags.length > 0 ? {} : (game.user.getFlag(MODULE.ID, 'codexCollapsedCategories') || {});
        const isTagCloudCollapsed = game.user.getFlag(MODULE.ID, 'codexTagCloudCollapsed') || false;

        // Build categoriesData array for the template
        // Sort categories with "No Category" always first, then alphabetically for the rest
        const sortedCategories = Array.from(this.categories).sort((a, b) => {
            if (a === "No Category") return -1;
            if (b === "No Category") return 1;
            return a.localeCompare(b);
        });
        
        // One index per render, shared by every entry's related names and location
        // levels. Rebuilt each time so a newly created entry links itself everywhere.
        const pageIndex = buildCodexPageIndex(this.selectedJournal);

        const categoriesData = await Promise.all(sortedCategories.map(async category => {
            let entries = this.data[category] || [];
            if (!game.user.isGM) {
                // Only show visible entries for non-GMs
                entries = entries.filter(e => (e.ownership?.default ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
            }
            if (this.filters.tags && this.filters.tags.length > 0) {
                entries = entries.filter(entry => entry.tags.some(tag => this.filters.tags.includes(tag)));
            }
            // Sort entries alphabetically by name
            entries = entries.slice().sort((a, b) => a.name.localeCompare(b.name));
            const customCategoryIcon = entries.find(entry => String(entry.categoryIcon || '').trim())?.categoryIcon || '';
            // Enrich links for Foundry UUID handling
            for (const entry of entries) {
                const links = entry.links || (entry.link ? [entry.link] : []);
                entry.linksHtml = [];
                for (const link of links) {
                    // Unresolved link: render the plain name rather than skipping it.
                    // The relationship was asserted by the author; Auto-Link retries it.
                    if (!link?.uuid) {
                        const label = link?.label || link?.name;
                        if (label) entry.linksHtml.push(`<span class="codex-link-unresolved">${escapeHtml(label)}</span>`);
                        continue;
                    }
                    const label = link.label || link.uuid;
                    const cacheKey = `${link.uuid}|${label}`;
                    if (_enrichedLinkCache.has(cacheKey)) {
                        entry.linksHtml.push(_enrichedLinkCache.get(cacheKey));
                        continue;
                    }
                    try {
                        const TextEditor = getTextEditor();
                        const enriched = await TextEditor.enrichHTML(
                            `@UUID[${link.uuid}]{${label}}`,
                            { documents: true, links: true }
                        );
                        _enrichedLinkCache.set(cacheKey, enriched);
                        entry.linksHtml.push(enriched);
                    } catch (_) {
                        // Not cached: a failure here is usually transient (the document
                        // is mid-load), and caching it would make it permanent.
                    }
                }

                // Related entries and location levels both point at other codex
                // entries, so they resolve through the same page index — cheaply,
                // every render, which is what makes them self-healing.
                // Survives re-render AND reload: without this, pinning or revealing
                // an entry collapses every open card.
                entry.isExpanded = this._getExpandedEntries().has(entry.uuid);

                entry.relatedHtml = (entry.related || [])
                    .map(name => this._renderCodexRef(name, pageIndex))
                    .filter(Boolean);
                entry.locationParts = (entry.locationParts || []).map(part => ({
                    ...part,
                    valueHtml: this._renderCodexRef(part.value, pageIndex) || escapeHtml(part.value)
                }));
            }
            const totalCount = entries.length;
            const visibleEntries = entries.filter(e => (e.ownership?.default ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
            const visibleCount = visibleEntries.length;
            
            // For "No Category", only include if it has visible entries
            if (category === "No Category" && visibleCount === 0) {
                return null;
            }
            
            return {
                name: category,
                icon: this.getCategoryIcon(category, customCategoryIcon),
                entries,
                collapsed: collapsedCategories[category] || false,
                totalCount,
                visibleCount,
                visibleEntries
            };
        }));
        
        // Filter out null entries (empty "No Category" sections)
        const filteredCategoriesData = categoriesData.filter(cat => cat !== null);

        // Build allTags for tag cloud
        let allTags;
        if (game.user.isGM) {
            // GMs see tags from all entries
            const allEntries = filteredCategoriesData.flatMap(cat => cat.entries);
            allTags = new Set();
            allEntries.forEach(entry => {
                if (entry.tags && Array.isArray(entry.tags)) {
                    entry.tags.forEach(tag => allTags.add(tag));
                }
            });
        } else {
            // Players see tags only from visible entries
            const allVisibleEntries = filteredCategoriesData.flatMap(cat => cat.visibleEntries);
            allTags = new Set();
            allVisibleEntries.forEach(entry => {
                if (entry.tags && Array.isArray(entry.tags)) {
                    entry.tags.forEach(tag => allTags.add(tag));
                }
            });
        }

        // Prepare template data
        const templateData = {
            position: "left",
            hasJournal: !!this.selectedJournal,
            journalName: this.selectedJournal ? this.selectedJournal.name : "",
            isGM: game.user.isGM,
            categoriesData: filteredCategoriesData,
            filters: {
                ...this.filters,
                search: this.filters.search || ""
            },
            allTags: Array.from(allTags).sort(),
            isTagCloudCollapsed
        };

        // Passed straight to Handlebars. There used to be a
        // `JSON.parse(JSON.stringify(templateData))` here to "break references and
        // ensure only primitives are passed" — a full serialise-and-reparse of every
        // entry, link, tag and location part on every single render.
        //
        // It protected nothing. Handlebars does not mutate its context, and the loop
        // above already writes `linksHtml`, `relatedHtml`, `isExpanded` and
        // `locationParts` onto the live entry objects in `this.data` — so if anything
        // needed isolating, the clone came too late to provide it.
        const html = await renderTemplate(TEMPLATES.PANEL_CODEX, templateData);
        // Preserve the scroll position across the re-render. Replacing innerHTML destroys
        // the .codex-content scroll container and recreates it at scrollTop 0, so actions
        // like placing/unplacing a pin or toggling visibility would otherwise jump the GM
        // back to the top and force them to scroll back down to find their place.
        // (Same fix the notes panel already carries.)
        const prevScrollTop = codexContainer.querySelector('.codex-content')?.scrollTop ?? 0;

        // v13: Use native DOM innerHTML instead of jQuery html()
        codexContainer.innerHTML = html;

        // Filters are rendered separately so the host can place them in its own
        // chrome — the codex browser slots them into the Tool window's toolbar,
        // beside the title bar rather than on top of the list. A host that offers no
        // slot gets them prepended to the body, so the panel still works anywhere.
        await this._renderFilters(templateData);

        // Bound to the HOST element, not the panel container: the toolbar sits
        // outside the container, and delegated handlers only see what they contain.
        this._activateListeners(this.element ?? codexContainer);

        // Restored last, after listeners: _activateListeners schedules a pass that
        // sets entry/section display, which changes layout and would otherwise
        // land the restore on a stale height.
        const scrollContent = codexContainer.querySelector('.codex-content');
        if (scrollContent) scrollContent.scrollTop = prevScrollTop;

        // NOTE: collapsed state is applied by the template (`cat.collapsed`, an
        // exact key lookup). There used to be a second pass here that re-applied
        // it by iterating every flag key and matching with `.trim()`. It was both
        // redundant and actively wrong: older versions derived keys from rendered
        // element text, so the flag holds junk like `" Locations\n "` and
        // `" Artifacts\n \n Browse\n \n \n "`. Trim-matching made a junk key
        // saying "collapsed" override the real key saying "expanded", on every
        // single render — which is why pinning an entry appeared to collapse its
        // category. Exact keys only; junk keys are inert and pruned below.
    }
}

