import { MODULE } from './const.js';

/**
 * Shared helpers, carried over from Squire with the module identity swapped.
 *
 * Only what Quests actually uses came across. Anything Squire keeps that
 * Librarian does not need was deliberately left behind rather than copied for
 * symmetry — a helper nobody calls is a maintenance cost with no reader.
 */

export function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

export function getBlacksmithDialog() {
  const dialog = getBlacksmith()?.dialog;
  if (!dialog) throw new Error('Coffee Pub Librarian | Blacksmith api.dialog is unavailable');
  return dialog;
}

/**
 * Show routine Squire success/status feedback through Blacksmith's themed
 * toast surface rather than Foundry's core notification queue.
 */
export function showLibrarianToast(title, options = {}) {
  const toast = getBlacksmith()?.toast;
  if (typeof toast?.show !== 'function') {
    console.warn('Coffee Pub Librarian | Blacksmith api.toast is unavailable:', title);
    return null;
  }

  return toast.show({
    title: String(title || ''),
    subtitle: options.subtitle ? String(options.subtitle) : undefined,
    icon: options.icon,
    image: options.image,
    duration: options.duration ?? 6,
    color: options.color,
    backgroundColor: options.backgroundColor,
    stackKey: options.stackKey,
    moduleId: MODULE.ID
  });
}

/**
 * Adapt Squire's two remaining complex JSON-import surfaces to Blacksmith's
 * DialogV2 wait contract while their eventual importer replacement is blocked
 * on the public Blacksmith Importer API.
 */
export async function showBlacksmithWait(config = {}, renderOptions = {}) {
  const buttons = Object.entries(config.buttons || {}).map(([action, button]) => ({
    action,
    label: button?.label || action,
    icon: String(button?.icon || '').match(/class=["'][^"']*?(fa-(?:solid|regular|brands)\s+fa-[\w-]+)[^"']*["']/)?.[1]
      || String(button?.icon || '').match(/(fa-(?:solid|regular|brands)\s+fa-[\w-]+)/)?.[1]
      || undefined,
    default: config.default === action,
    destructive: Boolean(button?.destructive),
    disabled: Boolean(button?.disabled),
    callback: typeof button?.callback === 'function' ? form => button.callback(form) : undefined
  }));
  const onRender = config.onRender || config.render || renderOptions.onRender || renderOptions.render;
  const outcome = await getBlacksmithDialog().wait({
    title: config.title || '',
    content: config.content || '',
    buttons,
    onRender: root => {
      if (typeof onRender === 'function') onRender(root);
      root?.querySelectorAll?.('.transfer-dialog input[type="range"][name^="quantity_"]').forEach(input => {
        const container = input.closest('.transfer-quantity');
        const selected = container?.querySelector('.quantity-label');
        const remaining = container?.querySelector('.range-value');
        const update = () => {
          const value = Number(input.value) || 1;
          const maximum = Number(input.max) || value;
          if (selected) selected.textContent = String(value);
          if (remaining) remaining.textContent = String(Math.max(0, maximum - value));
        };
        input.addEventListener('input', update);
        update();
      });
    },
    closeValue: null,
    cancelValue: null,
    classes: [...(config.classes || []), ...(renderOptions.classes || [])],
    position: config.position || { width: config.width || renderOptions.width || 600 }
  });
  if (outcome.action === 'close' && typeof config.close === 'function') {
    await config.close();
  }
  return outcome;
}

/**
 * v13: Render template using namespaced API
 * @param {string} template - Template path
 * @param {object} data - Template data
 * @returns {Promise<string>} Rendered HTML
 */
export async function renderTemplate(template, data) {
    return foundry.applications.handlebars.renderTemplate(template, data);
}

/**
 * v13: Convert jQuery object to native DOM element, or return native DOM as-is
 * @param {jQuery|HTMLElement} element - jQuery object or native DOM element
 * @returns {HTMLElement|null} Native DOM element
 */
export function getNativeElement(element) {
    if (!element) return null;
    // If it's already a native DOM element, return it
    if (element instanceof HTMLElement || element instanceof Element || element.nodeType) {
        return element;
    }
    // If it's a jQuery object, extract the native element
    if (element.jquery || typeof element.find === 'function') {
        return element[0] || element.get?.(0) || element;
    }
    // If it's a NodeList or array-like, return first element
    if (element.length && element[0]) {
        return getNativeElement(element[0]);
    }
    return element;
}

/**
 * v13: Get TextEditor implementation using namespaced API
 * @returns {object} TextEditor implementation
 */
export function getTextEditor() {
    return foundry.applications.ux.TextEditor.implementation;
}

/**
 * Copy text to clipboard with multiple fallback methods
 * @param {string} text - The text to copy
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
export async function copyToClipboard(text) {
    // Method 1: Try modern clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            ui.notifications.info('Template copied to clipboard!');
            return true;
        } catch (error) {
            console.error('Modern clipboard API failed:', error);
        }
    }
    
    // Method 2: Try legacy execCommand approach
    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (successful) {
            ui.notifications.info('Template copied to clipboard!');
            return true;
        }
    } catch (error) {
        console.error('Legacy clipboard method failed:', error);
    }
    
    // Method 3: Show dialog with text for manual copying
    const content = document.createElement('div');
    const message = document.createElement('p');
    message.textContent = 'Automatic clipboard copy failed. Please manually copy the text below:';
    const manualCopy = document.createElement('textarea');
    manualCopy.readOnly = true;
    manualCopy.value = text;
    manualCopy.style.cssText = 'width: 100%; height: 200px; margin-top: 10px;';
    content.append(message, manualCopy);

    await getBlacksmithDialog().wait({
        title: 'Copy to Clipboard',
        content,
        buttons: [
            { action: 'close', label: 'Close', icon: 'fa-solid fa-xmark', default: true }
        ],
        closeValue: null
    });
    
    return false;
}

/**
 * The campaign's party roster, as Actor documents in the GM's configured order.
 *
 * Blacksmith owns the party; do not rebuild this from game.actors. Worlds that
 * have not configured one fall back to the historical heuristic so the roster
 * never silently empties. Token actors are excluded — the roster is the
 * campaign's player characters, not whatever synthetic actors exist right now.
 *
 * This is the configured party, NOT "tokens on the canvas" and NOT "actors I
 * own"; those are different concepts with their own call sites.
 *
 * @returns {Actor[]}
 */
export function getPartyActors() {
  const members = getBlacksmith()?.campaign?.getParty?.()?.members;
  if (Array.isArray(members) && members.length) {
    const actors = members.map(member => game.actors.get(member.id)).filter(Boolean);
    if (actors.length) return actors;
  }
  return game.actors.filter(actor => actor?.type === 'character' && actor?.hasPlayerOwner && !actor?.isToken);
}

/**
 * Fill an import template's `[ADD-*-HERE]` placeholders from campaign data.
 *
 * A placeholder whose value isn't configured in Blacksmith is left in place —
 * the point of a placeholder is to show what's missing, and blanking it would
 * hide the gap rather than prompt the GM to fill it.
 *
 * @param {string} template
 * @returns {string}
 */
export function fillCampaignPlaceholders(template) {
    if (typeof template !== 'string') return template;

    const campaign = getCampaignContext();
    const p = campaign.prompt ?? {};

    const substitutions = {
        '[ADD-RULEBOOKS-HERE]': campaign.rulebooks,
        '[ADD-CAMPAIGN-HERE]': campaign.name,
        '[ADD-PARTY-HERE]': campaign.party,
        '[ADD-PARTY-SIZE-HERE]': p.partySize,
        '[ADD-PARTY-LEVEL-HERE]': p.partyLevel,
        '[ADD-PARTY-MAKEUP-HERE]': p.partyMakeup,
        '[ADD-PARTY-CLASSES-HERE]': Array.isArray(p.partyClasses) ? p.partyClasses.join(', ') : p.partyClasses,
        '[ADD-REALM-HERE]': p.realm,
        '[ADD-REGION-HERE]': p.region,
        '[ADD-SITE-HERE]': p.site,
        '[ADD-AREA-HERE]': p.area
    };

    let output = template;
    for (const [token, value] of Object.entries(substitutions)) {
        const text = value === null || value === undefined ? '' : String(value).trim();
        if (text) output = output.split(token).join(text);
    }
    return output;
}

/**
 * Campaign details, read from Blacksmith.
 *
 * Squire used to collect its own campaign name, party name/size/makeup/level,
 * and rulebook list. Four of those six were never read by anything, and the two
 * that were duplicated fields Blacksmith already owns — so a GM configured the
 * same campaign twice and Squire's copy could silently disagree. Blacksmith's
 * campaign data is now the only source; if it isn't configured, Squire simply
 * doesn't have the value rather than offering a second place to set it.
 *
 * Read-only, and there is no change hook — values are picked up on the next
 * render, which matches how Squire's own settings behaved.
 *
 * @returns {{name: string, party: string, rulebooks: string, prompt: object}}
 */
export function getCampaignContext() {
    const empty = { name: '', party: '', rulebooks: '', prompt: {} };
    try {
        const campaign = getBlacksmith()?.campaign;
        if (!campaign?.getCampaign) return empty;

        const prompt = campaign.getPromptContext?.() ?? {};
        const core = campaign.getCore?.() ?? {};
        const party = campaign.getParty?.() ?? {};

        // Rulebooks come back either as a list or an already-joined string
        // depending on which accessor answers; normalize to display text.
        const rawBooks = prompt.rulebooks ?? core.rulebooks ?? '';
        const rulebooks = Array.isArray(rawBooks) ? rawBooks.filter(Boolean).join(', ') : String(rawBooks || '');

        return {
            name: core.name ?? prompt.campaignName ?? '',
            party: party.name ?? prompt.partyName ?? '',
            rulebooks,
            prompt
        };
    } catch (error) {
        console.warn('Coffee Pub Librarian | Could not read campaign data from Blacksmith:', error);
        return empty;
    }
}

/**
 * Escape text for safe interpolation into an HTML string.
 *
 * Needed wherever we hand-build markup that a template renders through a
 * triple-stash: Handlebars won't escape it, and codex/quest names are
 * user-authored.
 *
 * Regex rather than a `createElement`/`textContent`/`innerHTML` round-trip.
 * This runs per related name and per location level on every codex render — a
 * real 314-entry codex is thousands of calls per render, and building a DOM
 * node for each is orders of magnitude more expensive than a replace. The DOM
 * approach also leaves `"` and `'` unescaped, which is wrong for the attribute
 * contexts this is used in.
 *
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

/**
 * Show quest tooltip with consistent formatting and delay
 * @param {string} tooltipId - The ID for the tooltip element
 * @param {Object} data - Tooltip data object
 * @param {string} data.questName - Name of the quest
 * @param {number} data.objectiveIndex - Index of the objective (0-based)
 * @param {string} data.objectiveState - State of the objective (active, completed, failed, hidden)
 * @param {string} data.description - Description text for the objective
 * @param {string} data.controls - Controls text to display
 * @param {boolean} data.isGM - Whether the current user is a GM
 * @param {Object} event - Mouse event for positioning
 * @param {number} delay - Delay in milliseconds before showing tooltip (default: 500ms)
 */
export async function showQuestTooltip(tooltipId, data, event, delay = 500, autoHide = 4000) {
    try {
        // Validate input parameters
        if (!tooltipId || typeof tooltipId !== 'string') {
            console.error('showQuestTooltip: Invalid tooltipId parameter', { tooltipId, data });
            return;
        }

        if (!data || typeof data !== 'object') {
            console.error('showQuestTooltip: Invalid data parameter', { tooltipId, data });
            return;
        }

        if (!event) {
            console.error('showQuestTooltip: Missing event parameter', { tooltipId, data });
            return;
        }

        // Clear any existing timeout for this tooltip
        if (tooltipTimeouts.has(tooltipId)) {
            clearTrackedTimeout(tooltipTimeouts.get(tooltipId));
            tooltipTimeouts.delete(tooltipId);
        }
        
        // Set new timeout to show tooltip after delay
        const timeoutId = trackModuleTimeout(async () => {
            try {
                const tooltip = getOrCreateQuestTooltip(tooltipId);
                const template = TEMPLATES.TOOLTIP_QUEST;
                // Render the tooltip using the Handlebars template
                const html = await renderTemplate(template, data);
                tooltip.innerHTML = html;
                tooltip.style.display = 'block';
                // Position tooltip near mouse with small offset
                const mouse = event.data?.originalEvent || event;
                if (mouse && typeof mouse.clientX === 'number' && typeof mouse.clientY === 'number') {
                    tooltip.style.left = (mouse.clientX + 16) + 'px';
                    tooltip.style.top = (mouse.clientY + 8) + 'px';
                }
                // Clear the timeout reference
                tooltipTimeouts.delete(tooltipId);

                if (autoHide > 0) {
                    const hideId = trackModuleTimeout(() => {
                        hideQuestTooltip(tooltipId);
                    }, autoHide);
                    tooltipTimeouts.set(`${tooltipId}-autohide`, hideId);
                }
            } catch (error) {
                console.error('showQuestTooltip: Error in timeout callback', { tooltipId, error: error.message });
            }
        }, delay);
        // Store the timeout reference
        tooltipTimeouts.set(tooltipId, timeoutId);
    } catch (error) {
        console.error('showQuestTooltip: Unexpected error', { tooltipId, error: error.message });
    }
}

/**
 * Hide quest tooltip
 * @param {string} tooltipId - The ID for the tooltip element
 */
export function hideQuestTooltip(tooltipId) {
    // Clear any pending timeout for this tooltip
    if (tooltipTimeouts.has(tooltipId)) {
        clearTrackedTimeout(tooltipTimeouts.get(tooltipId));
        tooltipTimeouts.delete(tooltipId);
    }
    const autoKey = `${tooltipId}-autohide`;
    if (tooltipTimeouts.has(autoKey)) {
        clearTrackedTimeout(tooltipTimeouts.get(autoKey));
        tooltipTimeouts.delete(autoKey);
    }
    
    const tooltip = document.getElementById(tooltipId);
    if (tooltip) {
        tooltip.style.display = 'none';
    }
}

/**
 * Get task text for a specific objective from quest data
 * @param {Object} questData - The quest data object
 * @param {number} objectiveIndex - The index of the objective (0-based)
 * @returns {string} The task text for the objective
 */
export function getTaskText(questData, objectiveIndex) {
    try {
        if (!questData) return 'Objective';

        // Parse the quest content to get tasks
        let content = '';
        if (typeof questData.text?.content === 'string') {
            content = questData.text.content;
        } else if (typeof questData.text === 'string') {
            content = questData.text;
        }

        if (!content) return 'Objective';

        // Parse tasks from the content
        const tasksMatch = content.match(/<strong>Tasks:<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/);
        if (tasksMatch) {
            const tasksHtml = tasksMatch[1];
            const parser = new DOMParser();
            const ulDoc = parser.parseFromString(`<ul>${tasksHtml}</ul>`, 'text/html');
            const ul = ulDoc.querySelector('ul');
            if (ul) {
                const liList = Array.from(ul.children);
                const li = liList[objectiveIndex];
                if (li) {
                    // Get the text content, removing any HTML tags
                    let rawText = li.textContent.trim();
                    // Clean the text to remove GM notes and treasure links
                    return cleanTaskText(rawText);
                }
            }
        }

        return 'Objective';
    } catch (error) {
        console.error('Error getting task text:', error);
        return 'Objective';
    }
}

/**
 * Async helper to fetch quest and objective data for tooltips
 * @param {string} questPageUuid - The quest UUID
 * @param {number} objectiveIndex - The objective index (0-based)
 * @returns {Promise<Object|null>} Tooltip data or null if not found
 */
export async function getObjectiveTooltipData(questPageUuid, objectiveIndex, pinQuestState = null, pinObjectiveState = null) {
    try {
        // Find the journal page by UUID
        let page = null;
        for (const journal of game.journal.contents) {
            page = journal.pages.find(p => p.uuid === questPageUuid);
            if (page) break;
        }
        if (!page) {
            console.error('SQUIRE | QUESTS getObjectiveTooltipData: Journal page not found', { questPageUuid, objectiveIndex });
            return null;
        }

        // Enrich the page HTML if needed
        const TextEditor = getTextEditor();
        const enrichedHtml = await TextEditor.enrichHTML(page.text.content, { async: true });
        // Parse the quest entry using the source of truth
        const entry = await QuestParser.parseSinglePage(page, enrichedHtml);
        if (!entry) {
            console.error('SQUIRE | QUESTS getObjectiveTooltipData: Failed to parse quest entry', { questPageUuid, objectiveIndex });
            return null;
        }

        // Get the relevant objective/task
        const task = entry.tasks[objectiveIndex];
        if (!task) {
            console.error('SQUIRE | QUESTS getObjectiveTooltipData: Objective not found', { questPageUuid, objectiveIndex });
            return null;
        }

        let visibility;
        if (game.user.isGM) {
            // Use pin's actual states if provided, otherwise fall back to parsed entry/task states
            const actualQuestState = pinQuestState || entry.state;
            const actualObjectiveState = pinObjectiveState || task.state;
            
            // Check quest-level visibility first
            if (actualQuestState === 'hidden') {
                visibility = 'Visible to GM';
            } else if (actualObjectiveState === 'hidden') {
                visibility = 'Visible to GM';
            } else {
                visibility = 'Visible to All';
            }
        }
        
        // For non-GM users, if the objective is hidden, show placeholder text
        let questName = entry.name;
        let description = task.text || 'Objective';
        
        if (!game.user.isGM && task.state === 'hidden') {
            questName = 'Objective Not Discovered';
            description = 'You have not uncovered this quest objective yet.';
        }
        
        // Check if there's a pin nearby for hidden objectives
        let objectiveNearby = false;
        if (task.state === 'hidden') {
            // MIGRATED TO BLACKSMITH API: Check if objective pin exists via Blacksmith API
            const pins = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
            if (pins?.isAvailable()) {
                const allPins = pins.list({ moduleId: MODULE.ID, sceneId: canvas.scene?.id });
                objectiveNearby = allPins.some(pin => 
                    pin.config?.questUuid === questPageUuid && 
                    pin.config?.objectiveIndex === objectiveIndex
                );
            }
        }
        
        return {
            questName,
            questNumber: getQuestNumber(page.uuid),
            objectiveIndex,
            objectiveNumber: objectiveIndex + 1,
            objectiveNumberPadded: String(objectiveIndex + 1).padStart(2, '0'),
            objectiveState: pinObjectiveState || task.state || 'active',
            description,
            gmHint: (game.user.isGM && task.gmHint) ? task.gmHint : undefined,
            visibility,
            isGM: game.user.isGM,
            objectiveNearby
        };
    } catch (error) {
        console.error('SQUIRE | QUESTS getObjectiveTooltipData: Unexpected error', { questPageUuid, objectiveIndex, error: error.message });
        return null;
    }
}
