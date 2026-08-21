import { MODULE } from './const.js';

const HTML_ESCAPES = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
});

/**
 * Shared helpers.
 *
 * Everything here has a caller — verified, not assumed. The file arrived from
 * Squire carrying a tooltip surface and a favourites accessor that nothing
 * called and that referenced four identifiers the file never imported; they
 * were removed rather than left to look like working code. A helper nobody
 * calls is a maintenance cost with no reader, and a broken one is a trap.
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
 * Show routine success/status feedback through Blacksmith's themed toast
 * surface rather than Foundry's core notification queue.
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
 * Adapt Librarian's two remaining hand-rolled JSON-import dialogs to
 * Blacksmith's DialogV2 wait contract.
 *
 * Both callers are scheduled for replacement: Blacksmith now ships
 * `api.importer`, whose window supersedes these dialogs entirely (TODO **H6**).
 * This function loses its last caller with them and should be deleted at the
 * same time.
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
  // `acting()` is the party's player characters — who can act on their own
  // behalf. Deliberately not `resting()`, which also returns NPC members
  // (familiars, companions, hirelings): a familiar rests with the party and
  // cannot own the item that reveals a codex entry.
  //
  // Blacksmith owns the "no primary party configured" fallback, which is the
  // part every consumer used to reinvent slightly differently. Do not add one
  // here — surface `hasPrimaryParty()` instead if a caller needs to explain an
  // odd roster.
  const acting = getBlacksmith()?.party?.acting?.();
  if (Array.isArray(acting) && acting.length) return acting;

  // Legacy path for a Blacksmith predating `api.party`. Remove once the
  // manifest's Blacksmith minimum is raised past the release that added it.
  const members = getBlacksmith()?.campaign?.getParty?.()?.members;
  if (Array.isArray(members) && members.length) {
    const actors = members.map(member => game.actors.get(member.id)).filter(Boolean);
    if (actors.length) return actors;
  }
  return game.actors.filter(actor => actor?.type === 'character' && actor?.hasPlayerOwner && !actor?.isToken);
}

/**
 * Whether Blacksmith has a primary party configured.
 *
 * Worth showing in a GM-facing message: "no primary party set" explains an odd
 * roster better than the roster does. Returns true when the answer is unknown,
 * so a caller never warns about something it cannot verify.
 */
export function hasPrimaryParty() {
  const has = getBlacksmith()?.party?.hasPrimaryParty;
  return typeof has === 'function' ? !!has() : true;
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
 * Handlebars helpers Librarian actually owns.
 *
 * Deliberately one helper. Blacksmith registers `add`, `and`, `divide`, `eq`,
 * `gt`, `includes`, `multiply`, `or`, `round`, `subtract`, `formatDamage`,
 * `formatTime` and `isImageUrl` globally and unconditionally during its own
 * `init` (see its documentation/api/api-core.md), and Foundry supplies `if`,
 * `each`, `unless`, `gte`, `lookup` and the rest. Handlebars is a single global
 * namespace with last-registration-wins semantics, so re-registering any of
 * those names does not give Librarian its own copy — it silently replaces
 * Blacksmith's for EVERY module in the world.
 *
 * This file used to register seventeen. Five collided with Blacksmith's
 * (`add`, `divide`, `eq`, `includes`, `multiply`), `includes` was registered
 * twice, and exactly one of the seventeen was used by a Librarian template.
 *
 * Before adding one here: check Blacksmith and Foundry first, and confirm a
 * template actually calls it. A helper nobody calls is a maintenance cost with
 * no reader, and a helper that shadows Blacksmith's is a bug in somebody
 * else's module.
 */
export const registerHelpers = function() {
    // Used by templates/partials/quest-entry.hbs. Neither Blacksmith nor
    // Foundry provides it.
    Handlebars.registerHelper('default', function(value, defaultValue) {
        return value ?? defaultValue;
    });
};
