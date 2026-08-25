import { MODULE, TEMPLATES } from './const.js';
import {
    QuestParser,
    QUEST_CATEGORIES,
    normalizeQuestCategory,
    normalizeQuestStatus
} from './utility-quest-parser.js';
import {
    getPinsApi,
    isPinsApiAvailable,
    deleteQuestPins,
    reloadAllQuestPins,
    createQuestPin,
    createObjectivePin,
    unplaceQuestPin,
    unplaceObjectivePin,
    listAllQuestPins,
    findLiveQuestPin,
    findLiveObjectivePin,
    reconcileQuestPins,
    focusQuestInPanel
} from './manager-quest-pins.js';
import { copyToClipboard, getNativeElement, renderTemplate, getTextEditor, getPartyActors, showBlacksmithWait, fillCampaignPlaceholders, showLibrarianToast } from './helpers.js';
import { trackModuleTimeout, clearTrackedTimeout, moduleDelay } from './timer-utils.js';
import { showJournalPicker } from './utility-journal.js';
import { resolveEntries, reportResolution, isSameParticipant } from './utility-resolver.js';

const QUEST_PIN_BACKGROUND     = '#682008';
const OBJECTIVE_PIN_BACKGROUND = '#8c2d0d';

const QUEST_WINDOW_ID = `${MODULE.ID}-quest-window`;

// Helper function to get quest number from UUID
function getQuestNumber(questUuid) {
    let hash = 0;
    for (let i = 0; i < questUuid.length; i++) {
        hash = ((hash << 5) - hash) + questUuid.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash) % 100 + 1;
}

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

function openQuestWindow(options = {}) {
    const blacksmith = getBlacksmith();
    if (typeof blacksmith?.openWindow !== 'function') {
        ui.notifications.warn('Quest window is not ready yet.');
        return null;
    }
    return blacksmith.openWindow(QUEST_WINDOW_ID, options);
}

// --- Quest pin icon helpers (mirror notes pattern) ---
const QUEST_PIN_ICON = 'fa-flag';
const OBJECTIVE_PIN_ICON = 'fa-bullseye';

function getDefaultQuestIconFlag() {
    return { type: 'fa', value: `fa-solid ${QUEST_PIN_ICON}` };
}

function normalizeQuestIconFaClassList(value) {
    if (typeof value !== 'string') return '';
    const classMatch = value.trim().startsWith('<i')
        ? value.match(/class=["']([^"']+)["']/i)?.[1]
        : value;
    const tokens = String(classMatch || '').split(/\s+/).map(t => t.trim()).filter(Boolean);
    const deduped = Array.from(new Set(tokens));
    if (!deduped.some(t => t.startsWith('fa-') || t.startsWith('fa'))) return '';
    return deduped.join(' ');
}

function normalizeQuestIconFlag(iconFlag) {
    if (!iconFlag) return null;
    if (typeof iconFlag === 'string') {
        const trimmed = iconFlag.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith('<img')) {
            const m = trimmed.match(/src=["']([^"']+)["']/i);
            if (m?.[1]) return { type: 'img', value: m[1] };
            return null;
        }
        if (trimmed.startsWith('<i') && trimmed.includes('fa-')) {
            const m = trimmed.match(/class=["']([^"']+)["']/i);
            if (m?.[1]) return { type: 'fa', value: m[1] };
            return null;
        }
        return { type: trimmed.includes('fa-') ? 'fa' : 'img', value: trimmed };
    }
    if (typeof iconFlag === 'object') {
        const type = iconFlag.type || iconFlag.kind;
        const value = iconFlag.value || iconFlag.icon || iconFlag.src;
        if (type && value) {
            if (type === 'fa') return { type, value: normalizeQuestIconFaClassList(value) };
            return { type, value };
        }
    }
    return null;
}

function buildQuestIconHtml(iconData, imgClass = '') {
    if (!iconData) return `<i class="fa-solid ${QUEST_PIN_ICON}"></i>`;
    if (iconData.type === 'fa') {
        const classValue = normalizeQuestIconFaClassList(String(iconData.value || ''));
        if (!classValue) return `<i class="fa-solid ${QUEST_PIN_ICON}"></i>`;
        return `<i class="${classValue}"></i>`;
    }
    const classAttr = imgClass ? ` class="${imgClass}"` : '';
    let src = typeof iconData.value === 'string' ? iconData.value.trim() : '';
    const imgMatch = src.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch?.[1]) src = imgMatch[1];
    if (!src || (!/^(https?:\/\/|\/|data:)/i.test(src) && !src.startsWith('modules/'))) return `<i class="fa-solid ${QUEST_PIN_ICON}"></i>`;
    const href = src.startsWith('modules/') ? `/${src}` : src;
    return `<img src="${href}"${classAttr}>`;
}

function resolveQuestIconHtmlFromPage(page, imgClass = '', category = 'Side Quest') {
    const iconFlag = normalizeQuestIconFlag(page?.getFlag(MODULE.ID, 'questIcon'));
    if (iconFlag) return buildQuestIconHtml(iconFlag, imgClass);
    return `<i class="fa-solid ${category === 'Main Quest' ? 'fa-flag' : 'fa-map-signs'}"></i>`;
}

// Quest notification functions - moved to QuestPanel class methods

export function notifyObjectiveCompleted(objectiveText, questUuid = null, objectiveIndex = null) {
    try {
        const blacksmith = getBlacksmith();
        if (!blacksmith?.addNotification) return;

        blacksmith.addNotification(
            `${objectiveText} completed!`,
            "fa-solid fa-check-circle",
            5, // 5 seconds
            MODULE.ID,
            questUuid ? { onClick: () => focusQuestInPanel(questUuid, objectiveIndex) } : undefined
        );
    } catch (error) {
        console.error('Coffee Pub Librarian | Error sending objective completed notification:', error);
    }
}

export function notifyQuestCompleted(questName, questUuid = null) {
    try {
        const blacksmith = getBlacksmith();
        if (!blacksmith?.addNotification) return;

        blacksmith.addNotification(
            `Quest '${questName}' completed!`,
            "fa-solid fa-trophy",
            5, // 5 seconds
            MODULE.ID,
            {
                pulse: true,
                ...(questUuid ? { onClick: () => focusQuestInPanel(questUuid) } : {})
            }
        );
    } catch (error) {
        console.error('Coffee Pub Librarian | Error sending quest completed notification:', error);
    }
}

// Quest notification functions - moved to QuestPanel class methods

export class QuestPanel {
    // Global notification IDs to prevent duplicates across QuestPanel instances
    static questNotificationId = null;
    static activeObjectiveNotificationId = null;
    // Session-scoped: true after the user closes the notification with the ×.
    // Render-driven re-notifies stay quiet until a deliberate action (repinning /
    // setting an active objective) resets these. Reload clears them.
    static questNotificationDismissed = false;
    static activeObjectiveNotificationDismissed = false;
    
    constructor() {
        this.element = null;
        this.categories = [...QUEST_CATEGORIES];
        this.data = {};
        // Parsed-page cache keyed by page UUID: { modifiedTime, entry }.
        // Enrich+parse is skipped for unchanged pages; quest number and live pin
        // state are recomputed on every refresh (see _refreshData).
        this._pageParseCache = new Map();
        for (const category of this.categories) {
            this.data[category] = [];
        }
        this.selectedJournal = null;
        this.filters = {
            search: "",
            tags: [],
            category: "all",
            statusFilter: "active" // active, available, complete (includes failed)
        };
        this.allTags = new Set();
        this.isImporting = false; // Flag to prevent panel refreshes during import
        this._notificationDebounceTimeouts = {}; // Debounce timeouts for notifications
        this._verifyAndUpdateCategories();
        this._setupHooks();
        // Pin events registered centrally by manager-pins.js initPinManager().
    }

    /**
     * Notify that a quest has been pinned (update existing or create new)
     * @param {string} questName - The quest name
     * @param {string} questCategory - The quest category
     */
    notifyQuestPinned(questName, questCategory) {
        // Debounce rapid calls to prevent duplicate notifications
        const debounceKey = 'questPinned';
        if (this._notificationDebounceTimeouts[debounceKey]) {
            clearTrackedTimeout(this._notificationDebounceTimeouts[debounceKey]);
        }
        
        this._notificationDebounceTimeouts[debounceKey] = trackModuleTimeout(() => {
            this._doNotifyQuestPinned(questName, questCategory);
            delete this._notificationDebounceTimeouts[debounceKey];
        }, 100); // 100ms debounce
    }
    
    _doNotifyQuestPinned(questName, questCategory) {
        try {
            // User closed the tracker with the × this session — stay quiet until they repin
            if (QuestPanel.questNotificationDismissed) return;
            const blacksmith = getBlacksmith();
            if (!blacksmith?.addNotification) return;
            
            const icon = questCategory === "Main Quest" ? "fa-solid fa-flag" : "fa-solid fa-map-signs";

            // Check if we already have a notification with this content to prevent duplicates
            if (QuestPanel.questNotificationId) {
                try {
                    // Update existing notification
                    const result = blacksmith.updateNotification(QuestPanel.questNotificationId, {
                        text: questName,
                        icon: icon,
                        duration: 0 // Keep persistent
                    });
                    
                    // If update failed, the notification might have been removed
                    if (!result) {
                        QuestPanel.questNotificationId = null;
                        // Fall through to create new notification
                    } else {
                        return; // Successfully updated, no need to create new
                    }
                } catch (updateError) {
                    console.warn('Coffee Pub Librarian | Failed to update quest notification, creating new:', updateError);
                    QuestPanel.questNotificationId = null;
                    // Fall through to create new notification
                }
            }
            
            // Create new notification and store ID. Handlers are set once at creation:
            // the updateNotification path above only touches text/icon/duration, which
            // leaves them intact. onClick therefore resolves the pinned quest at click
            // time, so it stays correct after updates swap which quest is pinned.
            QuestPanel.questNotificationId = blacksmith.addNotification(
                questName,
                icon,
                0, // 0 = persistent until manually removed
                MODULE.ID,
                {
                    onClick: () => {
                        // Blacksmith removes the notification after a click
                        QuestPanel.questNotificationId = null;
                        const pinnedQuests = game.user.getFlag(MODULE.ID, 'pinnedQuests') || {};
                        const uuid = Object.values(pinnedQuests).find(u => u !== null);
                        if (uuid) focusQuestInPanel(uuid);
                    },
                    onDismiss: () => {
                        // Duration is 0, so this only fires on the user's ×: stop
                        // tracking the ID and suppress re-notifies until a repin
                        QuestPanel.questNotificationId = null;
                        QuestPanel.questNotificationDismissed = true;
                    }
                }
            );
        } catch (error) {
            console.error('Coffee Pub Librarian | Error sending quest pinned notification:', error);
        }
    }

    /**
     * Clear quest notifications (remove the persistent quest notification)
     */
    clearQuestNotifications() {
        try {
            const blacksmith = getBlacksmith();
            if (!blacksmith?.removeNotification || !QuestPanel.questNotificationId) return;
            
            blacksmith.removeNotification(QuestPanel.questNotificationId);
            QuestPanel.questNotificationId = null;
        } catch (error) {
            console.error('Coffee Pub Librarian | Error clearing quest notifications:', error);
        }
    }

    /**
     * Notify that an objective is active (update existing or create new)
     * @param {string} questName - The quest name
     * @param {string} objectiveText - The objective text
     * @param {number} objectiveNumber - The objective number
     */
    notifyActiveObjective(questName, objectiveText, objectiveNumber) {
        // Debounce rapid calls to prevent duplicate notifications
        const debounceKey = 'activeObjective';
        if (this._notificationDebounceTimeouts[debounceKey]) {
            clearTrackedTimeout(this._notificationDebounceTimeouts[debounceKey]);
        }
        
        this._notificationDebounceTimeouts[debounceKey] = trackModuleTimeout(() => {
            this._doNotifyActiveObjective(questName, objectiveText, objectiveNumber);
            delete this._notificationDebounceTimeouts[debounceKey];
        }, 100); // 100ms debounce
    }
    
    _doNotifyActiveObjective(questName, objectiveText, objectiveNumber) {
        try {
            // User closed the tracker with the × this session — stay quiet until they
            // deliberately set an active objective again
            if (QuestPanel.activeObjectiveNotificationDismissed) return;
            const blacksmith = getBlacksmith();
            if (!blacksmith?.addNotification) {
                return;
            }
            
            const notificationText = objectiveText;
            const icon = "fa-solid fa-bullseye";
                       
            // Check if we already have a notification with this content to prevent duplicates
            if (QuestPanel.activeObjectiveNotificationId) {
                try {
                    // Update existing notification
                    const result = blacksmith.updateNotification(QuestPanel.activeObjectiveNotificationId, {
                        text: notificationText,
                        icon: icon,
                        duration: 0 // Keep persistent
                    });
                    
                    // If update failed, the notification might have been removed
                    if (!result) {
                        QuestPanel.activeObjectiveNotificationId = null;
                        // Fall through to create new notification
                    } else {
                        return; // Successfully updated, no need to create new
                    }
                } catch (updateError) {
                    QuestPanel.activeObjectiveNotificationId = null;
                    // Fall through to create new notification
                }
            }
            
            // Create new notification and store ID. Handlers are set once at creation:
            // the updateNotification path above only touches text/icon/duration, which
            // leaves them intact. onClick therefore resolves the active objective at
            // click time, so it stays correct after updates swap the objective.
            QuestPanel.activeObjectiveNotificationId = blacksmith.addNotification(
                notificationText,
                icon,
                0, // 0 = persistent until manually removed
                MODULE.ID,
                {
                    onClick: () => {
                        // Blacksmith removes the notification after a click
                        QuestPanel.activeObjectiveNotificationId = null;
                        const activeData = (game.user.getFlag(MODULE.ID, 'activeObjectives') || {}).active;
                        if (typeof activeData !== 'string') return;
                        const [uuid, indexStr] = activeData.split('|');
                        if (uuid) focusQuestInPanel(uuid, indexStr ?? null);
                    },
                    onDismiss: () => {
                        // Duration is 0, so this only fires on the user's ×: stop
                        // tracking the ID and suppress re-notifies until the user
                        // sets an active objective again
                        QuestPanel.activeObjectiveNotificationId = null;
                        QuestPanel.activeObjectiveNotificationDismissed = true;
                    }
                }
            );
        } catch (error) {
            console.error('Coffee Pub Librarian | Error sending active objective notification:', error);
        }
    }

    /**
     * Clear active objective notification (remove the persistent active objective notification)
     */
    clearActiveObjectiveNotification() {
        try {
            const blacksmith = getBlacksmith();
            if (!blacksmith?.removeNotification || !QuestPanel.activeObjectiveNotificationId) return;
            
            blacksmith.removeNotification(QuestPanel.activeObjectiveNotificationId);
            QuestPanel.activeObjectiveNotificationId = null;
        } catch (error) {
            console.error('Coffee Pub Librarian | Error clearing active objective notification:', error);
        }
    }

    /**
     * Check for pinned quests and show notification if found
     * @private
     */
    async _checkAndNotifyPinnedQuest() {
        try {
            // Get pinned quests
            const pinnedQuests = await game.user.getFlag(MODULE.ID, 'pinnedQuests') || {};
            const pinnedQuestUuid = Object.values(pinnedQuests).find(uuid => uuid !== null);
            
            if (pinnedQuestUuid) {
                // Get the quest page to get name and category
                const questPage = await fromUuid(pinnedQuestUuid);
                if (questPage) {
                    const questName = questPage.name || 'Unknown Quest';
                    
                    // Find which category this quest is pinned to
                    let questCategory = 'Main Quest'; // default
                    for (const [category, uuid] of Object.entries(pinnedQuests)) {
                        if (uuid === pinnedQuestUuid) {
                            questCategory = category;
                            break;
                        }
                    }
                    
                    // Send quest pinned notification
                    this.notifyQuestPinned(questName, questCategory);
                }
            }
        } catch (error) {
            console.error('Coffee Pub Librarian | Error checking pinned quest:', error);
        }
    }

    /**
     * Show the active-objective notification from the current user flag, or clear it
     * if no objective is active. Needs this.data populated for the objective text.
     * Called from the render path and from the remote tracker-update hook in squire.js.
     * @private
     */
    async _checkAndNotifyActiveObjective() {
        const activeData = (game.user.getFlag(MODULE.ID, 'activeObjectives') || {}).active;
        let activeQuestUuid = null;
        let activeObjectiveIndex = null;
        if (activeData && typeof activeData === 'string') {
            const [storedUuid, indexStr] = activeData.split('|');
            activeQuestUuid = storedUuid;
            activeObjectiveIndex = parseInt(indexStr);
        }

        if (activeQuestUuid && activeObjectiveIndex !== null) {
            try {
                const questPage = await fromUuid(activeQuestUuid);
                if (questPage) {
                    const questName = questPage.name || 'Unknown Quest';

                    // Find the quest in our panel data
                    let questEntry = null;
                    for (const category of this.categories) {
                        questEntry = this.data[category]?.find(entry => entry.uuid === activeQuestUuid);
                        if (questEntry) break;
                    }

                    if (questEntry?.tasks && questEntry.tasks[activeObjectiveIndex]) {
                        const objectiveText = questEntry.tasks[activeObjectiveIndex].text || 'Unknown Objective';
                        const objectiveNumber = activeObjectiveIndex + 1;
                        this.notifyActiveObjective(questName, objectiveText, objectiveNumber);
                    }
                }
            } catch (error) {
                console.error('Coffee Pub Librarian | Error loading active objective notification:', error);
            }
        } else {
            // Clear notification if no active objective
            this.clearActiveObjectiveNotification();
        }
    }

    /**
     * Mirror a quest tracker flag (pinnedQuests / activeObjectives) onto every
     * player's User document. The pinned quest and active objective are GM-directed,
     * party-wide state, but they are stored as per-user flags — without this a GM's
     * pin only ever lands on the GM's own user and no player tray, handle, or
     * menubar tracker changes. Players' clients react in the updateUser hook
     * registered in squire.js.
     * @param {string} key - 'pinnedQuests' or 'activeObjectives'
     * @param {Object} value - The flag value to mirror
     * @private
     */
    async _mirrorTrackerFlagToPlayers(key, value) {
        if (!game.user.isGM) return;
        try {
            for (const user of game.users.filter(u => !u.isGM)) {
                await user.setFlag(MODULE.ID, key, foundry.utils.deepClone(value));
            }
        } catch (error) {
            console.error(`Coffee Pub Librarian | Error mirroring ${key} to players:`, error);
        }
    }

    /**
     * Get the active objective index for a quest
     * @param {string} questUuid - The quest UUID
     * @returns {number|null} The active objective index or null if none
     * @private
     */
    async _getActiveObjectiveIndex(questUuid) {
        try {
            const activeObjectives = await game.user.getFlag(MODULE.ID, 'activeObjectives') || {};
            const activeData = activeObjectives.active;
            
            if (activeData && typeof activeData === 'string') {
                const [storedUuid, indexStr] = activeData.split('|');
                if (storedUuid === questUuid) {
                    return parseInt(indexStr);
                }
            }
            
            return null;
        } catch (error) {
            console.error('Coffee Pub Librarian | Error getting active objective index:', error);
            return null;
        }
    }

    /**
     * Set the active objective for a quest
     * @param {string} questUuid - The quest UUID
     * @param {number} objectiveIndex - The objective index to set as active
     * @private
     */
    async _setActiveObjective(questUuid, objectiveIndex) {
        try {
            const activeObjectives = await game.user.getFlag(MODULE.ID, 'activeObjectives') || {};
           
            // Clear any existing active objective first
            for (const key in activeObjectives) {
                if (activeObjectives[key] !== null) {
                    activeObjectives[key] = null;
                }
            }
            
            // Set the new active objective using a simple key
            activeObjectives.active = `${questUuid}|${objectiveIndex}`;
            await game.user.setFlag(MODULE.ID, 'activeObjectives', activeObjectives);
            await this._mirrorTrackerFlagToPlayers('activeObjectives', activeObjectives);

            // Deliberate action: lift any ×-dismissal suppression so the notify below lands
            QuestPanel.activeObjectiveNotificationDismissed = false;
            
            // Get quest and objective details for notification from panel data
            const questPage = await fromUuid(questUuid);
            if (questPage) {
                const questName = questPage.name || 'Unknown Quest';
                
                // Find the quest in our panel data
                let questEntry = null;
                for (const category of this.categories) {
                    questEntry = this.data[category]?.find(entry => entry.uuid === questUuid);
                    if (questEntry) break;
                }
                
                if (questEntry?.tasks && questEntry.tasks[objectiveIndex]) {
                    const objectiveText = questEntry.tasks[objectiveIndex].text || 'Unknown Objective';
                    const objectiveNumber = objectiveIndex + 1;
                    this.notifyActiveObjective(questName, objectiveText, objectiveNumber);
                } else {
                    // No quest entry or tasks found in panel data
                }
            } else {
                // Quest page not found
            }
        } catch (error) {
            console.error('Coffee Pub Librarian | Error setting active objective:', error);
        }
    }

    /**
     * Clear the active objective for a quest
     * @param {string} questUuid - The quest UUID
     * @private
     */
    async _clearActiveObjective(questUuid) {
        try {
            const activeObjectives = await game.user.getFlag(MODULE.ID, 'activeObjectives') || {};
            const activeData = activeObjectives.active;
            
            if (activeData && typeof activeData === 'string') {
                const [storedUuid] = activeData.split('|');
                if (storedUuid === questUuid) {
                    activeObjectives.active = null;
                    await game.user.setFlag(MODULE.ID, 'activeObjectives', activeObjectives);
                    await this._mirrorTrackerFlagToPlayers('activeObjectives', activeObjectives);

                    // Clear the active objective notification
                    this.clearActiveObjectiveNotification();
                }
            }
        } catch (error) {
            console.error('Coffee Pub Librarian | Error clearing active objective:', error);
        }
    }

    /**
     * Clear ALL active objectives (only one can be active at a time)
     * @private
     */
    async _clearAllActiveObjectives() {
        try {
            const activeObjectives = await game.user.getFlag(MODULE.ID, 'activeObjectives') || {};
            activeObjectives.active = null;
            await game.user.setFlag(MODULE.ID, 'activeObjectives', activeObjectives);
            await this._mirrorTrackerFlagToPlayers('activeObjectives', activeObjectives);

            // Clear the active objective notification
            this.clearActiveObjectiveNotification();
        } catch (error) {
            console.error('Coffee Pub Librarian | Error clearing all active objectives:', error);
        }
    }

    /**
     * Set a single objective's state in the journal (completed, active/incomplete, failed, hidden).
     * Mirrors the task checkbox left/right/middle-click behavior.
     * @param {string} questUuid - The quest journal page UUID
     * @param {number} taskIndex - The objective index
     * @param {string} state - One of: 'completed', 'active', 'failed', 'hidden'
     * @private
     */
    async _setObjectiveState(questUuid, taskIndex, state) {
        const journalId = game.settings.get(MODULE.ID, 'questJournal');
        if (!journalId || journalId === 'none') return;
        const journal = game.journal.get(journalId);
        if (!journal) return;
        const page = journal.pages.find(p => p.uuid === questUuid);
        if (!page) return;
        let content = page.text.content;
        const tasksMatch = content.match(/<strong>Tasks:<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/);
        if (!tasksMatch) return;
        const tasksHtml = tasksMatch[1];
        const parser = new DOMParser();
        const ulDoc = parser.parseFromString(`<ul>${tasksHtml}</ul>`, 'text/html');
        const ul = ulDoc.querySelector('ul');
        const liList = ul ? Array.from(ul.children) : [];
        const li = liList[taskIndex];
        if (!li) return;

        // Get raw inner content (strip s/code/em)
        const sTag = li.querySelector('s');
        const codeTag = li.querySelector('code');
        const emTag = li.querySelector('em');
        const rawInner = (sTag || codeTag || emTag)?.innerHTML ?? li.innerHTML;

        if (state === 'completed') {
            li.innerHTML = `<s>${rawInner}</s>`;
            notifyObjectiveCompleted(li.textContent.trim(), questUuid, taskIndex);
        } else if (state === 'failed') {
            li.innerHTML = `<code>${rawInner}</code>`;
        } else if (state === 'hidden') {
            li.innerHTML = `<em>${rawInner}</em>`;
        } else {
            // active / incomplete
            li.innerHTML = rawInner;
        }

        let newContent = content.replace(tasksMatch[1], ul.innerHTML);

        // All-completed / uncomplete quest status logic (same as checkbox left-click)
        const allLis = Array.from(ul.children);
        const allCompleted = allLis.length > 0 && allLis.every(l => l.querySelector('s'));
        const statusMatch = newContent.match(/<strong>Status:<\/strong>\s*([^<]*)/);
        const currentStatus = statusMatch ? statusMatch[1].trim() : '';
        const categoryMatch = newContent.match(/<strong>Category:<\/strong>\s*([^<]*)/);
        const currentCategory = categoryMatch ? categoryMatch[1].trim() : '';

        if (allCompleted && !['Complete', 'Succeeded'].includes(currentStatus)) {
            if (statusMatch) {
                newContent = newContent.replace(/(<strong>Status:<\/strong>\s*)[^<]*/, '$1Succeeded');
            } else {
                newContent += `<p><strong>Status:</strong> Succeeded</p>`;
            }
            let originalCategory = await page.getFlag(MODULE.ID, 'originalCategory');
            if (!originalCategory && currentCategory && currentCategory !== 'Completed') {
                originalCategory = currentCategory;
                await page.setFlag(MODULE.ID, 'originalCategory', originalCategory);
            }
            const questName = page.name || 'Unknown Quest';
            notifyQuestCompleted(questName, questUuid);
        } else if (!allCompleted && ['Complete', 'Succeeded'].includes(currentStatus)) {
            newContent = newContent.replace(/(<strong>Status:<\/strong>\s*)[^<]*/, '$1Active');
            if (currentCategory === 'Completed') {
                const originalCategory = await page.getFlag(MODULE.ID, 'originalCategory');
                if (originalCategory && categoryMatch) {
                    newContent = newContent.replace(/(<strong>Category:<\/strong>\s*)[^<]*/, `$1${originalCategory}`);
                }
            }
        }

        try {
            await page.update({ text: { content: newContent } });
            if (this.element) {
                await this._refreshData();
                this.render(this.element);
            }
        } catch (error) {
            console.error('Coffee Pub Librarian | Error setting objective state:', error);
        }
    }

    /**
     * Verifies that all required categories exist and updates if needed
     * @private
     */
    _verifyAndUpdateCategories() {
        const storedCategories = game.settings.get(MODULE.ID, 'questCategories') || [];
        const updatedCategories = [...QUEST_CATEGORIES];
        
        // Update settings if there's a change
        const currentCategories = JSON.stringify(storedCategories);
        const newCategories = JSON.stringify(updatedCategories);
        
        if (currentCategories !== newCategories) {
            game.settings.set(MODULE.ID, 'questCategories', updatedCategories);
        }
        
        // Update this instance's categories
        this.categories = [...QUEST_CATEGORIES];
    }

    /**
     * Sets up global hooks for journal updates
     * @private
     */
    _setupHooks() {
        // Journal hooks are handled by HookManager
        // This method is kept for compatibility but no longer registers hooks
        getBlacksmith()?.utils.postConsoleAndNotification(
            MODULE.NAME,
            'Quest Panel: Hooks managed by HookManager',
            {},
            true,
            false
        );
    }

    /**
     * Clean up when the panel is destroyed
     * @public
     */
    destroy() {
        // Clear any pending debounce timeouts
        Object.values(this._notificationDebounceTimeouts).forEach(timeout => {
            if (timeout) clearTrackedTimeout(timeout);
        });
        this._notificationDebounceTimeouts = {};

        // Ensure pin-placement mode listeners are removed.
        this._clearQuestPinPlacement();

        // Ensure container-level listeners are torn down.
        if (this._questListenersAbort) {
            this._questListenersAbort.abort();
            this._questListenersAbort = null;
        }

        this.element = null;
    }

    /**
     * Clear all quest pins from specified scenes
     * @param {string} scope - 'thisScene' or 'allScenes'
     * @private
     */
    async _clearAllQuestPins(scope) {
        try {
            // MIGRATED TO BLACKSMITH API
            const pins = getPinsApi();
            if (!pins || !pins.isAvailable()) {
                ui.notifications.warn('Quest pins require the Blacksmith module');
                return;
            }
            
            // Only clear this module's quest and objective pins (not Notes or other pin types)
            const isQuestOrObjectivePin = (pin) => !!pin?.config?.questUuid;

            const deletePinSafe = async (pin) => {
                try {
                    await pins.delete(pin.id, pin.sceneId ? { sceneId: pin.sceneId } : undefined);
                } catch (e) {
                    console.warn('Coffee Pub Librarian | Clear pins delete failed:', e);
                }
            };

            if (scope === 'thisScene') {
                // Clear quest/objective pins from current scene only
                if (canvas.scene) {
                    const allPins = listAllQuestPins(pins, { sceneId: canvas.scene.id });
                    const questObjectivePins = allPins.filter(isQuestOrObjectivePin);
                    const clearedCount = questObjectivePins.length;
                    
                    if (clearedCount > 0) {
                        for (const pin of questObjectivePins) await deletePinSafe(pin);
                        ui.notifications.info(`Cleared ${clearedCount} quest pins from the current scene.`);
                    }
                }
            } else if (scope === 'allScenes') {
                // Clear quest/objective pins from all scenes
                const allDeleted = [];
                for (const scene of game.scenes.contents) {
                    const scenePins = listAllQuestPins(pins, { sceneId: scene.id });
                    const questObjectivePins = scenePins.filter(isQuestOrObjectivePin);
                    for (const pin of questObjectivePins) { await deletePinSafe(pin); allDeleted.push(pin); }
                }
                // Unplaced as well
                const unplaced = listAllQuestPins(pins, { unplacedOnly: true });
                const questObjectiveUnplaced = unplaced.filter(isQuestOrObjectivePin);
                for (const pin of questObjectiveUnplaced) { await deletePinSafe(pin); allDeleted.push(pin); }
                ui.notifications.info(`Cleared ${allDeleted.length} quest pins from all scenes.`);
            }

            // Reload and reconcile after bulk clear
            try {
                if (typeof pins.reload === 'function') {
                    if (scope === 'thisScene' && canvas.scene) {
                        await pins.reload({ sceneId: canvas.scene.id });
                    } else {
                        for (const scene of game.scenes.contents) {
                            await pins.reload({ sceneId: scene.id });
                        }
                    }
                }
                await reconcileQuestPins();
                this.render(this.element);
            } catch (e) {
                console.warn('Coffee Pub Librarian | post-clear reload/reconcile:', e);
            }
        } catch (error) {
            console.error('Error clearing quest pins:', { error, scope });
            ui.notifications.error('Error clearing quest pins. See console for details.');
        }
    }

    /**
     * Open the Clear All Quest Pins dialog (titlebar menu).
     * @private
     */
    async _openClearAllQuestPinsDialog() {
        const result = await getBlacksmith().dialog.choose({
            title: 'Clear All Quest Pins',
            content: '<p>Choose which scenes to clear quest pins from:</p>',
            choices: [
                { id: 'thisScene', label: 'This Scene', icon: 'fa-solid fa-map' },
                { id: 'allScenes', label: 'All Scenes', icon: 'fa-solid fa-globe', destructive: true }
            ],
            closeValue: null,
            cancelValue: null
        });
        if (result.action === 'submit' && result.value) {
            await this._clearAllQuestPins(result.value);
        }
    }

    /**
     * Open the Import Quests from JSON dialog (titlebar menu).
     * @private
     */
    async _openImportQuestsDialog() {
        if (!game.user.isGM) return;
        // Stays empty on failure rather than holding an error string — see the
        // matching note in panel-codex.js _openImportCodexDialog.
        let template = '';
        try {
            const response = await fetch(`modules/${MODULE.ID}/prompts/prompt-quests.txt`);
            if (response.ok) template = await response.text();
            else console.error(`${MODULE.TITLE} | prompt-quests.txt failed to load: ${response.status}`);
        } catch (error) {
            console.error(`${MODULE.TITLE} | prompt-quests.txt failed to load:`, error);
        }
        await showBlacksmithWait({
            title: 'Import Quests and Scene Pins from JSON',
            width: 600,
            resizable: true,
            content: await renderTemplate(`modules/${MODULE.ID}/templates/window-import-export.hbs`, {
                type: 'quests',
                isImport: true,
                isExport: false,
                jsonInputId: 'import-quests-json-input'
            }),
            buttons: {
                cancel: { icon: '<i class="fa-solid fa-times"></i>', label: 'Cancel Import' },
                import: {
                    icon: '<i class="fa-solid fa-file-import"></i>',
                    label: 'Import JSON',
                    callback: async (dlgHtml) => {
                        let nativeDlgHtml = dlgHtml;
                        if (dlgHtml && (dlgHtml.jquery || typeof dlgHtml.find === 'function')) {
                            nativeDlgHtml = dlgHtml[0] || dlgHtml.get?.(0) || dlgHtml;
                        }
                        const input = nativeDlgHtml.querySelector('#import-quests-json-input');
                        const inputValue = input?.value || '';
                        let importData;
                        try {
                            importData = JSON.parse(inputValue);
                        } catch (e) {
                            ui.notifications.error('Invalid JSON: ' + e.message);
                            return;
                        }
                        this.isImporting = true;
                        this._showProgressBar();
                        try {
                            let quests, scenePins;
                            if (Array.isArray(importData)) {
                                quests = importData;
                                scenePins = {};
                            } else if (importData.quests && Array.isArray(importData.quests)) {
                                quests = importData.quests;
                                scenePins = importData.scenePins || {};
                                if (importData.exportVersion) {
                                    ui.notifications.info(`Importing enhanced export (v${importData.exportVersion}) with ${quests.length} quests and ${Object.keys(scenePins).length} scenes with pins.`);
                                }
                            } else {
                                ui.notifications.error('Invalid format: JSON must be either an array of quests or an object with quests and scenePins properties.');
                                return;
                            }
                            let categories = game.settings.get(MODULE.ID, 'questCategories') || [];
                            let changed = false;
                            for (const cat of QUEST_CATEGORIES) {
                                if (!categories.includes(cat)) { categories.push(cat); changed = true; }
                            }
                            if (changed) await game.settings.set(MODULE.ID, 'questCategories', categories);
                            const journalId = game.settings.get(MODULE.ID, 'questJournal');
                            if (!journalId || journalId === 'none') {
                                ui.notifications.error('No quest journal selected.');
                                return;
                            }
                            const journal = game.journal.get(journalId);
                            if (!journal) {
                                ui.notifications.error('Selected quest journal not found.');
                                return;
                            }
                            await this._importQuestsFromData(quests, scenePins, journal);
                        } catch (error) {
                            this._hideProgressBar();
                            this.isImporting = false;
                            console.error('Error during quest import:', error);
                            ui.notifications.error(`Quest import failed: ${error.message}`);
                        }
                    }
                }
            },
            classes: ['import-export-dialog'],
            id: 'import-export-dialog-quest-import',
            render: (html) => {
                let nativeDlgHtml = html;
                if (html && (html.jquery || typeof html.find === 'function')) {
                    nativeDlgHtml = html[0] || html.get?.(0) || html;
                }
                const cancelButton = nativeDlgHtml.querySelector('[data-button="cancel"]');
                if (cancelButton) cancelButton.classList.add('librarian-cancel-button');
                const importButton = nativeDlgHtml.querySelector('[data-button="import"]');
                if (importButton) importButton.classList.add('librarian-submit-button');
                const copyTemplateButton = nativeDlgHtml.querySelector('.copy-template-button');
                if (copyTemplateButton) {
                    copyTemplateButton.addEventListener('click', () => {
                        if (!template) {
                            ui.notifications.error('The quest prompt template could not be loaded. See the console for details.');
                            return;
                        }
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
                            let quests, scenePins;
                            if (Array.isArray(importData)) {
                                quests = importData;
                                scenePins = {};
                            } else if (importData.quests && Array.isArray(importData.quests)) {
                                quests = importData.quests;
                                scenePins = importData.scenePins || {};
                                if (importData.exportVersion) {
                                    ui.notifications.info(`File contains enhanced export (v${importData.exportVersion}) with ${quests.length} quests and ${Object.keys(scenePins).length} scenes with pins.`);
                                }
                            } else {
                                ui.notifications.error('Invalid file format: Must be either an array of quests or an object with quests and scenePins properties.');
                                return;
                            }
                            const jsonInput = nativeDlgHtml.querySelector('#import-quests-json-input');
                            if (jsonInput) jsonInput.value = text;
                            ui.notifications.info(`File "${file.name}" loaded successfully! Review the content below and click Import when ready.`);
                            event.target.value = '';
                        } catch (error) {
                            console.error('Error reading file:', { error, fileName: file.name });
                            ui.notifications.error(`Error reading file: ${error.message}`);
                        }
                    });
                }
            }
        });
    }

    /**
     * Open the Export Quests to JSON dialog (titlebar menu).
     * @private
     */
    async _openExportQuestsDialog() {
        if (!game.user.isGM) return;
        await this._refreshData();
        const allQuests = [];
        for (const category of this.categories) {
            allQuests.push(...(this.data[category] || []));
        }
        const uniqueQuests = [];
        const seenUUIDs = new Set();
        allQuests.forEach(quest => {
            if (quest.uuid && !seenUUIDs.has(quest.uuid)) {
                seenUUIDs.add(quest.uuid);
                uniqueQuests.push(quest);
            }
        });
        if (uniqueQuests.length === 0) {
            ui.notifications.warn("No quests to export");
            return;
        }
        const exportQuests = uniqueQuests.map(q => ({
            name: q.name,
            uuid: q.uuid,
            img: (q.img || "").replace(new RegExp('^' + window.location.origin + '/'), ''),
            category: q.category || "Side Quest",
            description: q.description || "",
            plotHook: q.plotHook || "",
                        status: normalizeQuestStatus(q.status),
            visible: q.visible !== false,
            timeframe: q.timeframe || { duration: "" },
            tasks: (q.tasks || []).map(t => ({
                text: t.text,
                completed: t.completed || false,
                state: t.state || "active",
                gmnotes: t.gmHint || "",
                tasktreasure: t.treasureUnlocks || [],
                originalText: t.originalText || ""
            })),
            reward: { xp: q.reward?.xp || 0, treasure: q.reward?.treasure || [] },
            participants: q.participants || [],
            tags: q.tags || [],
            location: q.location || ""
        }));
        // Refuse a partial rather than write one — the same rule the codex export
        // follows (M11), for the same reason: an export is a backup, and the
        // dangerous failure is not an error but a file that looks complete and is
        // not, discovered only at restore. Before C4 this silently wrote zero pins.
        let pinExport;
        try {
            pinExport = await this._exportScenePins();
        } catch (error) {
            ui.notifications.error('Quest export aborted: the scene pins could not be read. Nothing was written. See the console.');
            return;
        }
        const { scenePins, gathered, total, unplaced } = pinExport;
        if (gathered + unplaced !== total) {
            const missing = total - gathered - unplaced;
            console.error(`${MODULE.TITLE} | Pin export incomplete: ${gathered} placed + ${unplaced} unplaced != ${total} total (${missing} unaccounted).`);
            ui.notifications.error(
                `Quest export aborted: ${missing} quest ${missing === 1 ? 'pin' : 'pins'} could not be accounted for. Nothing was written.`
            );
            return;
        }

        const enhancedExportData = {
            // Diagnostic only, never dispatch — lets a reader (and Blacksmith's
            // importer) name the owning module when Librarian is absent.
            kind: 'coffee-pub-librarian.quest',
            quests: exportQuests,
            scenePins,
            exportVersion: "1.1",
            timestamp: new Date().toISOString(),
            metadata: {
                totalQuests: exportQuests.length,
                totalScenesWithPins: Object.keys(scenePins).length,
                totalPins: gathered,
                // Unplaced pins are real state with no placement to restore. Recorded
                // so `totalPins` being lower than a GM expects has a visible reason.
                unplacedPins: unplaced
            }
        };
        const exportData = JSON.stringify(enhancedExportData, null, 2);
        const sanitizeWindowsFilename = name => name
            .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
            .replace(/\s+$/g, '')
            .replace(/\.+$/g, '')
            .slice(0, 150);
        const filename = `quests-export-${sanitizeWindowsFilename(game.world?.name || 'export')}-${Date.now()}.json`;
        const { openDataExportWindow } = await import('./window-data-export.js');
        openDataExportWindow({
            title: 'Export Quests and Scene Pins to JSON',
            data: exportData,
            filename,
            summary: [
                { label: 'Quests', value: exportQuests.length },
                { label: 'Scenes with Pins', value: Object.keys(scenePins).length },
                { label: 'Pins', value: `${gathered} of ${total}` },
                { label: 'Format', value: `Quest export v${enhancedExportData.exportVersion}` },
                { label: 'Created', value: new Date(enhancedExportData.timestamp).toLocaleString() }
            ],
            sceneNames: Object.values(scenePins).map(scene => scene.sceneName).filter(Boolean)
        });
    }

    /**
     * Run the core import logic (validation, quest create/update, scene pins). Called from _openImportQuestsDialog.
     * @param {object[]} quests - Parsed quest data
     * @param {object} scenePins - Scene pins data keyed by scene id
     * @param {Journal} journal - Quest journal
     * @private
     */
    async _importQuestsFromData(quests, scenePins, journal) {
        this._updateProgressBar(10, 'Validating import data...');
        const importNameCounts = {};
        const duplicateNames = [];
        quests.forEach(q => {
            if (q.name) {
                importNameCounts[q.name] = (importNameCounts[q.name] || 0) + 1;
                if (importNameCounts[q.name] > 1 && !duplicateNames.includes(q.name)) duplicateNames.push(q.name);
            }
        });
        if (duplicateNames.length > 0) {
            ui.notifications.warn(`Warning: Import data contains duplicate quest names: ${duplicateNames.join(', ')}. These will be merged with existing quests.`);
        }
        this._updateProgressBar(20, `Processing ${quests.length} quests...`);
        let imported = 0, updated = 0, duplicatesMerged = 0;
        // Filled by the content builders as they resolve names; reported once below.
        this._resolveReports = [];
        const totalQuests = quests.length;
        for (let i = 0; i < quests.length; i++) {
            const quest = quests[i];
            if (!quest.name) continue;
            const questProgress = 20 + ((i / totalQuests) * 60);
            this._updateProgressBar(questProgress, `Processing: ${quest.name}`);
            let existingPage = null, matchType = 'none';
            if (quest.uuid) {
                existingPage = journal.pages.find(p => p.getFlag(MODULE.ID, 'questUuid') === quest.uuid);
                if (existingPage) matchType = 'uuid';
            }
            if (!existingPage) {
                existingPage = journal.pages.find(p => p.name === quest.name);
                if (existingPage) matchType = 'name';
            }
            if (existingPage) {
                let existingContent = '';
                if (typeof existingPage.text?.content === 'string') existingContent = existingPage.text.content;
                else if (existingPage.text?.content) existingContent = await existingPage.text.content;
                const updatedContent = await this._mergeJournalContent(existingContent, quest);
                await existingPage.update({ text: { content: updatedContent } });
                if (quest.visible !== undefined) await existingPage.setFlag(MODULE.ID, 'visible', quest.visible !== false);
                const uuid = quest.uuid || existingPage.getFlag(MODULE.ID, 'questUuid') || foundry.utils.randomID();
                if (uuid !== existingPage.getFlag(MODULE.ID, 'questUuid')) await existingPage.setFlag(MODULE.ID, 'questUuid', uuid);
                if (quest.name && quest.name !== existingPage.name) await existingPage.update({ name: quest.name });
                if ((quest.status === 'Complete' || quest.status === 'Failed') && quest.category && !(await existingPage.getFlag(MODULE.ID, 'originalCategory'))) {
                    await existingPage.setFlag(MODULE.ID, 'originalCategory', quest.category);
                }
                updated++;
                if (matchType === 'name') duplicatesMerged++;
            } else {
                const uuid = quest.uuid || foundry.utils.randomID();
                const pageData = {
                    name: quest.name,
                    type: 'text',
                    text: { content: await this._generateJournalContentFromImport(quest) },
                    flags: { [MODULE.ID]: { questUuid: uuid } }
                };
                const created = await journal.createEmbeddedDocuments('JournalEntryPage', [pageData]);
                const page = created[0];
                if (page) {
                    await page.setFlag(MODULE.ID, 'visible', quest.visible !== false);
                    if ((quest.status === 'Complete' || quest.status === 'Failed') && quest.category) await page.setFlag(MODULE.ID, 'originalCategory', quest.category);
                    imported++;
                }
            }
            if (i % 5 === 0) await moduleDelay(100);
        }
        this._updateProgressBar(80, 'Importing scene pins...');
        if (Object.keys(scenePins).length > 0) {
            try {
                await this._importScenePins(scenePins);
            } catch (error) {
                console.error('Error during scene pin import:', error);
                ui.notifications.warn('Scene pins import failed, but quests were imported successfully. Check console for details.');
            }
        }
        this._updateProgressBar(90, 'Finalizing import...');
        let message = `Quest import complete: ${imported} added, ${updated} updated.`;
        if (duplicatesMerged > 0) message += ` ${duplicatesMerged} duplicates were merged.`;
        ui.notifications.info(message);
        reportResolution(this._resolveReports, 'Quest import');
        this._resolveReports = null;
        this._updateProgressBar(100, 'Import complete!');
        await moduleDelay(2000);
        this._hideProgressBar();
        this.isImporting = false;
        await this._refreshData();
        this.render(this.element);
    }

    /**
     * Clear quest pins for a specific quest from the current scene
     * @param {string} questUuid - The UUID of the quest
     * @private
     */
    async _clearQuestPins(questUuid) {
        try {
            if (!canvas.scene) return;
            
            // MIGRATED TO BLACKSMITH API
            await deleteQuestPins(questUuid, canvas.scene?.id);
            await reconcileQuestPins();
            if (this.element) this.render(this.element);
            ui.notifications.info('Quest pins cleared from the current scene.');
        } catch (error) {
            console.error('Error clearing quest pins:', { error, questUuid });
            ui.notifications.error('Error clearing quest pins. See console for details.');
        }
    }

    /**
     * Apply a quest status change.
     *
     * `normalizeQuestStatus` is the only definition, and it writes one of
     * **Available / Active / Succeeded / Failed**. This comment used to claim the
     * persisted vocabulary was `Not Started` / `In Progress` / `Complete` / `Failed`,
     * a set nothing writes and nothing reads.
     *
     * **`Complete` is still live in real data**, though, which is why several sites
     * test for it alongside `Succeeded` — see `_setObjectiveState` and
     * `_importQuestsFromData`. Those are compatibility, not redundancy: pages written
     * before the normalizer landed still carry it, confirmed against a production
     * world. Do not simplify them away without migrating those pages first.
     *
     * TODO **A1** settles this properly by making status a schema field rather than a
     * string parsed out of markup.
     *
     * @param {string} uuid - Quest journal page UUID
     * @param {string} newStatus - New status value
     * @private
     */
    async _applyQuestStatus(uuid, newStatus) {
        const page = await fromUuid(uuid);
        if (!page) return;

        const status = normalizeQuestStatus(newStatus);
        let content = '';
        if (typeof page.text?.content === 'string') content = page.text.content;
        else if (page.text?.content) content = await page.text.content;
        const statusMatch = content.match(/<strong>Status:<\/strong>\s*([^<]*)/);

        if (statusMatch) {
            content = content.replace(/(<strong>Status:<\/strong>\s*)[^<]*/, `$1${status}`);
        } else {
            content += `<p><strong>Status:</strong> ${status}</p>`;
        }

        content = content.replace(/<p><strong>Outcome:<\/strong>\s*[^<]*<\/p>\s*/i, '');
        await page.unsetFlag?.(MODULE.ID, 'questOutcome');

        await page.update({ text: { content } });
    }

    /**
     * Toggle quest visibility (show/hide to players).
     * @param {string} uuid - Quest journal page UUID
     * @private
     */
    async _toggleQuestVisibility(uuid) {
        const page = await fromUuid(uuid);
        if (!page) return;
        let visible = await page.getFlag(MODULE.ID, 'visible');
        if (typeof visible === 'undefined') visible = true;
        visible = !visible;
        await page.setFlag(MODULE.ID, 'visible', visible);
        if (this.element) {
            await this._refreshData();
            this.render(this.element);
        }
    }

    /**
     * Open Blacksmith Configure Pin for the quest's pin. Persists design to quest flags.
     * Creates an unplaced quest pin if none exists (same pattern as notes).
     * @param {string} uuid - Quest journal page UUID
     * @private
     */
    async _configureQuestPin(uuid) {
        const pins = getPinsApi();
        if (!pins?.configure) return;
        const page = await fromUuid(uuid);
        if (!page) return;

        let livePin = findLiveQuestPin(uuid);
        let pinId = livePin?.id ?? null;
        let sceneId = livePin?.sceneId;

        if (!pinId) {
            const questState = page.getFlag(MODULE.ID, 'visible') === false ? 'hidden' : 'visible';
            const pin = await createQuestPin({
                questUuid: uuid,
                questIndex: getQuestNumber(uuid),
                questCategory: 'Side Quest',
                questStatus: 'Not Started',
                questState
            });
            if (pin) {
                pinId = pin.id;
                livePin = pin;
                sceneId = pin.sceneId ?? undefined;
            } else {
                ui.notifications.error('Failed to create pin for this quest.');
                return;
            }
        }

        const openConfig = async () => {
            await pins.configure(pinId, {
                sceneId,
                moduleId: MODULE.ID,
                useAsDefault: true,
                onSelect: async (config) => {
                    // Only persist the icon — Blacksmith owns all other design fields.
                    if (config?.icon != null) await page.setFlag(MODULE.ID, 'questIcon', config.icon);
                    if (this.element) { await this._refreshData(); this.render(this.element); }
                }
            });
        };

        try {
            await openConfig();
        } catch (err) {
            const msg = String(err?.message || err || '').toLowerCase();
            if (msg.includes('pin not found')) {
                try {
                    const pin = await createQuestPin({
                        questUuid: uuid,
                        questIndex: getQuestNumber(uuid),
                        questCategory: 'Side Quest',
                        questStatus: 'Not Started',
                        questState: page.getFlag(MODULE.ID, 'visible') === false ? 'hidden' : 'visible'
                    });
                    if (pin) {
                        await pins.configure(pin.id, {
                            moduleId: MODULE.ID,
                            useAsDefault: true,
                            onSelect: async (config) => {
                                if (config?.icon != null) await page.setFlag(MODULE.ID, 'questIcon', config.icon);
                                if (this.element) { await this._refreshData(); this.render(this.element); }
                            }
                        });
                    }
                } catch (retryErr) {
                    console.error('Coffee Pub Librarian | _configureQuestPin (recreate):', retryErr);
                    ui.notifications.warn('Pin no longer exists. Cleared from quest. Configure again to create a new pin.');
                }
            } else {
                console.error('Coffee Pub Librarian | _configureQuestPin:', err);
                ui.notifications.error('Failed to open pin configuration. See console.');
            }
        }
    }

    /** Cursor class for Pin to Scene placement mode */
    static QUEST_PIN_CURSOR_CLASS = 'librarian-quest-pin-placement';
    static QUEST_PIN_CANVAS_CURSOR_CLASS = 'librarian-quest-pin-placement-canvas';

    /**
     * Create a preview element for Pin to Scene (follows mouse, like Notes).
     * Uses fixed background and status-based border color (same as placed pin).
     * @param {'circle'|'square'} shape - Pin shape
     * @param {number} sizePx - Size in pixels
     * @param {string} fillColor - Background fill hex (e.g. QUEST_PIN_BACKGROUND)
     * @param {string} strokeColor - Border stroke hex (status/state color)
     * @param {string} text - Label text (e.g. Q85)
     * @param {string} iconHtml - Icon HTML (e.g. <i class="fa-solid fa-scroll"></i>)
     * @param {number} [strokeWidthPx=2] - CSS border width for preview ring
     * @returns {HTMLDivElement}
     * @private
     */
    _createQuestPinPreviewElement(shape, sizePx, fillColor, strokeColor, text, iconHtml, strokeWidthPx = 2) {
        const preview = document.createElement('div');
        preview.className = 'quest-pin-preview';
        preview.dataset.shape = shape;
        preview.style.setProperty('--quest-pin-width', `${sizePx}px`);
        preview.style.setProperty('--quest-pin-height', `${sizePx}px`);
        preview.style.setProperty('--quest-pin-fill', fillColor);
        preview.style.setProperty('--quest-pin-stroke', strokeColor);
        preview.style.setProperty('--quest-pin-stroke-width', `${strokeWidthPx}px`);
        preview.innerHTML = `
            <div class="quest-pin-preview-inner">
                ${iconHtml || ''}
                <span>${text || ''}</span>
            </div>
        `;
        return preview;
    }

    async _syncQuestPinMirror(page, pin) {
        if (!page) return;
        // pinId is the only mirrored flag (pinId-only contract) — scene resolution
        // comes from live Blacksmith pin records. The old sceneId mirror write was
        // read by nothing and each write was a world update that also invalidated
        // the page-parse cache for this page.
        const nextPinId = pin?.id ?? page.getFlag(MODULE.ID, 'pinId') ?? null;
        if (page.getFlag(MODULE.ID, 'pinId') !== nextPinId) {
            await page.setFlag(MODULE.ID, 'pinId', nextPinId);
        }
    }

    /**
     * Begin Pin to Scene placement for a quest-level pin. User clicks on canvas to place.
     * @param {string} questUuid - Quest journal page UUID
     * @param {number} questIndex - Quest number for label
     * @param {string} questCategory - Quest category
     * @param {string} questStatus - Quest status
     * @param {string} questState - 'visible' or 'hidden'
     * @private
     */
    async _beginQuestPinPlacement(questUuid, questIndex, questCategory, questStatus, questState) {
        if (!canvas?.scene || !canvas?.app?.view) {
            ui.notifications.warn('Canvas is not ready. Open a scene to place a quest pin.');
            return;
        }
        if (!getPinsApi()?.isAvailable()) {
            ui.notifications.warn('Quest pins require the Blacksmith module.');
            return;
        }
        const page = await fromUuid(questUuid);
        // Delete any existing quest-level pin before re-placing to avoid duplicates.
        const livePin = findLiveQuestPin(questUuid);
        if (livePin?.id) {
            const pins = getPinsApi();
            const pinExists = typeof pins?.exists === 'function' ? pins.exists(livePin.id) : !!pins?.get?.(livePin.id);
            if (pinExists) {
                try {
                    await pins.delete(livePin.id, livePin.sceneId ? { sceneId: livePin.sceneId } : undefined);
                } catch (e) {
                    console.warn('Coffee Pub Librarian | Auto-delete quest pin before re-place:', e);
                    return;
                }
            }
        }
        if (this._questPinPlacement) this._clearQuestPinPlacement();

        ui.notifications.info('Click on the map to place the quest pin. Press Esc to cancel.');
        document.body.classList.add(QuestPanel.QUEST_PIN_CURSOR_CLASS);
        document.body.style.cursor = 'crosshair';
        const view = canvas.app.view;
        view.classList.add(QuestPanel.QUEST_PIN_CANVAS_CURSOR_CLASS);

        const questStateVal = questState === 'true' || questState === true ? 'visible' : 'hidden';
        const strokeColor = '#ffffff';
        const questNum = typeof questIndex === 'string' ? parseInt(questIndex, 10) || 0 : (questIndex ?? 0);
        const previewEl = this._createQuestPinPreviewElement(
            'circle',
            60,
            QUEST_PIN_BACKGROUND,
            strokeColor,
            `Q${questNum}`,
            '<i class="fa-solid fa-flag"></i>',
            5
        );
        document.body.appendChild(previewEl);

        const onPointerMove = (event) => {
            previewEl.style.left = `${event.clientX}px`;
            previewEl.style.top = `${event.clientY}px`;
        };

        const onPointerDown = async (event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            const rect = view.getBoundingClientRect();
            const globalX = event.clientX - rect.left;
            const globalY = event.clientY - rect.top;
            const localPos = canvas.stage?.toLocal({ x: globalX, y: globalY });
            if (!localPos) {
                ui.notifications.warn('Unable to place pin: canvas position unavailable.');
                this._clearQuestPinPlacement();
                return;
            }
            const page = await fromUuid(questUuid);
            if (!page) {
                this._clearQuestPinPlacement();
                return;
            }

            const created = await createQuestPin({
                questUuid,
                questIndex: questNum,
                questCategory: questCategory || 'Side Quest',
                questStatus: questStatus || 'Not Started',
                questState: questStateVal,
                sceneId: canvas.scene.id,
                x: localPos.x,
                y: localPos.y
            });
            if (!created?.id) {
                ui.notifications.error('Failed to create quest pin.');
                this._clearQuestPinPlacement();
                return;
            }
            await this._syncQuestPinMirror(page, { ...created, sceneId: canvas.scene.id });
            this._clearQuestPinPlacement();
            const questIsHidden = questStateVal === 'hidden';
            showLibrarianToast(questIsHidden ? 'Quest pin placed, hidden' : 'Quest pin placed', {
                subtitle: questIsHidden
                    ? 'Hidden quests get hidden pins. Turn on Show Hidden in Manage Pins to see it.'
                    : undefined,
                icon: questIsHidden ? 'fa-solid fa-eye-slash' : 'fa-solid fa-location-dot'
            });
            // Reload before re-rendering: `pins.list()` reads a cache that the
            // create has not landed in yet, so the icon would render unpinned
            // and a second click would place a duplicate.
            await reloadAllQuestPins();
            if (this.element) await this.render(this.element);
        };

        const onContextMenu = (event) => {
            event.preventDefault();
            event.stopPropagation();
            this._clearQuestPinPlacement();
        };
        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                this._clearQuestPinPlacement();
            }
        };

        view.addEventListener('pointerdown', onPointerDown, true);
        view.addEventListener('contextmenu', onContextMenu, true);
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('pointermove', onPointerMove);

        this._questPinPlacement = {
            view,
            previewEl,
            onPointerDown,
            onPointerMove,
            onContextMenu,
            onKeyDown
        };
    }

    /**
     * Begin Pin to Scene placement for an objective-level pin.
     * @param {string} questUuid - Quest journal page UUID
     * @param {number} objectiveIndex - Task index
     * @param {number} questIndex - Quest number for label
     * @param {string} questCategory - Quest category
     * @param {string} questState - 'visible' or 'hidden'
     * @param {Object} objective - { state, text }
     * @private
     */
    async _beginObjectivePinPlacement(questUuid, objectiveIndex, questIndex, questCategory, questState, objective) {
        if (!canvas?.scene || !canvas?.app?.view) {
            ui.notifications.warn('Canvas is not ready. Open a scene to place an objective pin.');
            return;
        }
        if (!getPinsApi()?.isAvailable()) {
            ui.notifications.warn('Quest pins require the Blacksmith module.');
            return;
        }
        const page = await fromUuid(questUuid);
        // Delete any existing objective pin before re-placing to avoid duplicates.
        const liveObjectivePin = findLiveObjectivePin(questUuid, objectiveIndex);
        if (liveObjectivePin?.id) {
            const pins = getPinsApi();
            const pinExists = typeof pins?.exists === 'function' ? pins.exists(liveObjectivePin.id) : !!pins?.get?.(liveObjectivePin.id);
            if (pinExists) {
                try {
                    await pins.delete(liveObjectivePin.id, liveObjectivePin.sceneId ? { sceneId: liveObjectivePin.sceneId } : undefined);
                } catch (e) {
                    console.warn('Coffee Pub Librarian | Auto-delete objective pin before re-place:', e);
                    return;
                }
            }
        }
        if (this._questPinPlacement) this._clearQuestPinPlacement();

        ui.notifications.info('Click on the map to place the objective pin. Press Esc to cancel.');
        document.body.classList.add(QuestPanel.QUEST_PIN_CURSOR_CLASS);
        document.body.style.cursor = 'crosshair';
        const view = canvas.app.view;
        view.classList.add(QuestPanel.QUEST_PIN_CANVAS_CURSOR_CLASS);

        const questStateVal = questState === 'true' || questState === true ? 'visible' : 'hidden';
        const strokeColor = '#ffffff';
        const questNum = typeof questIndex === 'string' ? parseInt(questIndex, 10) || 0 : (questIndex ?? 0);
        const previewEl = this._createQuestPinPreviewElement(
            'circle',
            50,
            OBJECTIVE_PIN_BACKGROUND,
            strokeColor,
            `Q${questNum}.${objectiveIndex + 1}`,
            '<i class="fa-solid fa-bullseye"></i>',
            5
        );
        document.body.appendChild(previewEl);

        const onPointerMove = (event) => {
            previewEl.style.left = `${event.clientX}px`;
            previewEl.style.top = `${event.clientY}px`;
        };

        const onPointerDown = async (event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            const rect = view.getBoundingClientRect();
            const globalX = event.clientX - rect.left;
            const globalY = event.clientY - rect.top;
            const localPos = canvas.stage?.toLocal({ x: globalX, y: globalY });
            if (!localPos) {
                ui.notifications.warn('Unable to place pin: canvas position unavailable.');
                this._clearQuestPinPlacement();
                return;
            }
            const created = await createObjectivePin({
                questUuid,
                questIndex: questNum,
                objectiveIndex,
                questCategory: questCategory || 'Side Quest',
                questState: questStateVal,
                objective: objective || { state: 'active', text: '' },
                sceneId: canvas.scene.id,
                x: localPos.x,
                y: localPos.y
            });
            if (!created?.id) {
                ui.notifications.error('Failed to create objective pin.');
                this._clearQuestPinPlacement();
                return;
            }
            this._clearQuestPinPlacement();
            // A pin for a hidden objective (or on a hidden quest) is created
            // hidden — correct, but indistinguishable from a failed placement
            // unless we say so: nothing appears on the canvas, and Blacksmith's
            // pin manager filters it out until Show Hidden is on.
            const objectiveIsHidden = questStateVal === 'hidden' || (objective?.state || '') === 'hidden';
            showLibrarianToast(objectiveIsHidden ? 'Objective pin placed, hidden' : 'Objective pin placed', {
                subtitle: objectiveIsHidden
                    ? 'Hidden objectives get hidden pins. Turn on Show Hidden in Manage Pins to see it.'
                    : undefined,
                icon: objectiveIsHidden ? 'fa-solid fa-eye-slash' : 'fa-solid fa-location-dot'
            });
            // Reload before re-rendering: `pins.list()` reads a cache that the
            // create has not landed in yet, so the icon would render unpinned
            // and a second click would place a duplicate.
            await reloadAllQuestPins();
            if (this.element) await this.render(this.element);
        };

        const onContextMenu = (event) => {
            event.preventDefault();
            event.stopPropagation();
            this._clearQuestPinPlacement();
        };
        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                this._clearQuestPinPlacement();
            }
        };

        view.addEventListener('pointerdown', onPointerDown, true);
        view.addEventListener('contextmenu', onContextMenu, true);
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('pointermove', onPointerMove);

        this._questPinPlacement = {
            view,
            previewEl,
            onPointerDown,
            onPointerMove,
            onContextMenu,
            onKeyDown
        };
    }

    _clearQuestPinPlacement() {
        if (!this._questPinPlacement) return;
        const { view, previewEl, onPointerDown, onPointerMove, onContextMenu, onKeyDown } = this._questPinPlacement;
        view?.removeEventListener('pointerdown', onPointerDown, true);
        view?.removeEventListener('contextmenu', onContextMenu, true);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('pointermove', onPointerMove);
        previewEl?.remove();
        document.body.classList.remove(QuestPanel.QUEST_PIN_CURSOR_CLASS);
        document.body.style.cursor = '';
        view?.classList.remove(QuestPanel.QUEST_PIN_CANVAS_CURSOR_CLASS);
        this._questPinPlacement = null;
    }

    /**
     * Unplace the quest-level pin from the canvas (like Notes unpin). Clears sceneId so UI shows dim.
     * @param {string} questUuid - Quest journal page UUID
     * @private
     */
    async _unplaceQuestPin(questUuid) {
        const page = await fromUuid(questUuid);
        if (!page) return;
        try {
            await unplaceQuestPin(page);
            await this._syncQuestPinMirror(page, { id: page.getFlag(MODULE.ID, 'pinId'), sceneId: null });
        } catch (e) {
            console.warn('Coffee Pub Librarian | Unplace quest pin:', e);
        }
        // Same cache lag as placement, in the other direction: without the
        // reload the icon stays lit and the next click tries to unpin nothing.
        await reloadAllQuestPins();
        if (this.element) await this.render(this.element);
    }

    /**
     * Unplace an objective pin from the canvas.
     * @param {string} questUuid - Quest journal page UUID
     * @param {number} objectiveIndex - Task index
     * @private
     */
    async _unplaceObjectivePin(questUuid, objectiveIndex) {
        const page = await fromUuid(questUuid);
        if (!page) return;
        try {
            await unplaceObjectivePin(page, objectiveIndex);
        } catch (e) {
            console.warn('Coffee Pub Librarian | Unplace objective pin:', e);
        }
        await reloadAllQuestPins();
        if (this.element) await this.render(this.element);
    }

    /**
     * Unpin a hidden quest from all players
     * @param {string} questUuid - The UUID of the quest to unpin
     * @private
     */
    async _unpinHiddenQuestFromPlayers(questUuid) {
        // Get the quest page for the name
        const questPage = await fromUuid(questUuid);
        const questName = questPage?.name || 'Unknown Quest';
        try {
            // Get all users who are not GMs
            const nonGMUsers = game.users.filter(user => !user.isGM);
            
            for (const user of nonGMUsers) {
                const pinnedQuests = await user.getFlag(MODULE.ID, 'pinnedQuests') || {};
                
                // Check if this quest is pinned for this user
                let isPinned = false;
                let pinnedCategory = null;
                
                for (const [category, uuid] of Object.entries(pinnedQuests)) {
                    if (uuid === questUuid) {
                        isPinned = true;
                        pinnedCategory = category;
                        break;
                    }
                }
                
                // If pinned, unpin it
                if (isPinned && pinnedCategory) {
                    pinnedQuests[pinnedCategory] = null;
                    await user.setFlag(MODULE.ID, 'pinnedQuests', pinnedQuests);
                    
                    // Notify the player if they're online
                    if (user.active) {
                        ui.notifications.info(`${user.name}: Your pinned quest "${questName}" has been hidden by the GM and automatically unpinned.`);
                    }
                }
            }
        } catch (error) {
            console.error('Error unpinning hidden quest from players:', { error, questUuid });
        }
    }

    _isPageInSelectedJournal(page) {
        return this.selectedJournal && page.parent.id === this.selectedJournal.id;
    }

    /**
     * Check if a journal page looks like a quest entry
     * @private
     * @param {JournalEntryPage} page - The journal page to check
     * @returns {boolean} True if the page appears to be a quest entry
     */
    _isQuestEntry(page) {
        try {
            const rawContent = page?.text?.content;
            if (!rawContent || typeof rawContent !== 'string') return false;

            const normalized = rawContent.toLowerCase();
            return normalized.includes('## tasks') || normalized.includes('<strong>tasks:');
        } catch (error) {
            console.error('QuestPanel | Error checking quest entry:', error);
            return false;
        }
    }

    /**
     * Refresh data from the journal
     * @private
     */
    async _refreshData() {
        // Always verify categories are correct
        this._verifyAndUpdateCategories();
        
        // Always clear data and tags before repopulating
        this.data = {};
        for (const category of this.categories) {
            this.data[category] = [];
        }
        this.allTags = new Set();

        const journalId = game.settings.get(MODULE.ID, 'questJournal');
        this.selectedJournal = journalId && journalId !== 'none' ? game.journal.get(journalId) : null;
        const pins = getPinsApi();
        const liveQuestPins = new Map();
        const liveObjectivePins = new Map();

        if (pins?.isAvailable()) {
            const allQuestPins = listAllQuestPins(pins);
            for (const pin of allQuestPins) {
                const questUuid = pin?.config?.questUuid;
                if (!questUuid) continue;
                if (typeof pin?.config?.objectiveIndex === 'number') {
                    const key = `${questUuid}|${pin.config.objectiveIndex}`;
                    const existing = liveObjectivePins.get(key);
                    if (!existing || (!existing.sceneId && pin.sceneId)) liveObjectivePins.set(key, pin);
                } else {
                    const existing = liveQuestPins.get(questUuid);
                    if (!existing || (!existing.sceneId && pin.sceneId)) liveQuestPins.set(questUuid, pin);
                }
            }
        }

        if (this.selectedJournal) {
            // Prune cache entries for pages no longer in the journal
            const validUuids = new Set(this.selectedJournal.pages.contents.map(p => p.uuid));
            for (const key of [...this._pageParseCache.keys()]) {
                if (!validUuids.has(key)) this._pageParseCache.delete(key);
            }

            for (const page of this.selectedJournal.pages.contents) {
                try {
                    // Enrich+parse only when the page actually changed; any document update
                    // (content, flags like `visible`/`pinId`, ownership) bumps modifiedTime
                    // and invalidates.
                    const modifiedTime = page._stats?.modifiedTime ?? 0;
                    const cached = this._pageParseCache.get(page.uuid);
                    let entry;
                    if (cached && cached.modifiedTime === modifiedTime) {
                        entry = cached.entry;
                    } else {
                        entry = null;
                        let content = '';
                        if (typeof page.text?.content === 'string') {
                            content = page.text.content;
                        } else if (typeof page.text === 'string') {
                            content = page.text;
                        } else if (page.text?.content) {
                            content = await page.text.content;
                        }
                        if (content) {
                            const TextEditor = getTextEditor();
                            const enriched = await TextEditor.enrichHTML(content, {
                                secrets: game.user.isGM,
                                documents: true,
                                links: true,
                                rolls: true
                            });
                            // Each page is a single quest entry
                            entry = await QuestParser.parseSinglePage(page, enriched);
                            if (entry) {
                                // Set visible from flag, default true
                                let visible = await page.getFlag(MODULE.ID, 'visible');
                                if (typeof visible === 'undefined') visible = true;
                                entry.visible = visible;

                                // Ensure all required properties exist
                                entry.tasks = entry.tasks || [];
                                entry.reward = entry.reward || { xp: 0, treasure: [] };
                                entry.participants = entry.participants || [];
                                entry.tags = entry.tags || [];
                                entry.timeframe = entry.timeframe || { duration: '' };
                                entry.progress = entry.progress || 0;

                                // Add objective numbers to tasks
                                if (entry.tasks && Array.isArray(entry.tasks)) {
                                    entry.tasks.forEach((task, index) => {
                                        task.objectiveNumber = String(index + 1).padStart(2, '0');
                                        // Ensure task properties exist
                                        task.text = task.text || '';
                                        task.completed = task.completed || false;
                                        task.state = task.state || 'active';
                                        task.treasureUnlocks = task.treasureUnlocks || [];
                                    });
                                }

                                entry.iconHtml = resolveQuestIconHtmlFromPage(page, 'quest-icon-image', entry.category);
                            }
                        }
                        this._pageParseCache.set(page.uuid, { modifiedTime, entry });
                    }

                    if (entry) {
                        // Volatile per refresh: quest number (user flag) and live pin state
                        entry.questNumber = getQuestNumber(page.uuid);

                        const liveQuestPin = liveQuestPins.get(page.uuid) || null;
                        const liveQuestSceneId = liveQuestPin?.sceneId ?? null;
                        entry.hasPinOnScene = !!liveQuestSceneId;
                        entry.pinSceneId = liveQuestSceneId || null;
                        entry.pinSceneName = entry.pinSceneId ? (game.scenes.get(entry.pinSceneId)?.name || null) : null;
                        if (entry.tasks && Array.isArray(entry.tasks)) {
                            entry.tasks.forEach((task, index) => {
                                const liveObjPin = liveObjectivePins.get(`${page.uuid}|${index}`) || null;
                                task.hasPinOnScene = !!liveObjPin?.sceneId;
                            });
                        }
                        const category = entry.category && this.categories.includes(entry.category) ? entry.category : this.categories[0];
                        this.data[category].push(entry);

                        // Add only the explicit tags from the entry
                        if (entry.tags && Array.isArray(entry.tags)) {
                            entry.tags.forEach(tag => this.allTags.add(tag));
                        }
                    }
                } catch (error) {
                    console.error(`Error processing quest page ${page.name}:`, { page: page.name, error });
                    ui.notifications.error(`Error loading quest: ${page.name}. See console for details.`);
                }
            }
        }
    }

    /**
     * Map status filter value to data-status attribute
     * @private
     */
    _statusFilterToDataStatus(filterValue) {
        const map = {
            active: 'Active',
            available: 'Available',
            complete: 'Complete'
        };
        return map[filterValue] ?? null;
    }

    /**
     * Apply status filter to show/hide quest sections
     * @param {HTMLElement} html - The quest container element
     * @private
     */
    _applyStatusFilter(html) {
        const nativeHtml = getNativeElement(html);
        if (!nativeHtml) return;

        const statusFilter = this.filters.statusFilter || 'active';
        const targetStatus = this._statusFilterToDataStatus(statusFilter);

        nativeHtml.querySelectorAll('.quest-section[data-status]').forEach(section => {
            const sectionStatus = section.getAttribute('data-status');
            const shouldShow = targetStatus && sectionStatus === targetStatus;
            section.style.display = shouldShow ? '' : 'none';
        });
    }

    /**
     * Map a loaded quest entry's status to the quest panel status filter (Active / Available / Complete).
     * Uses current `this.data` — call after refresh (e.g. `render`).
     * @param {string} questUuid - Journal page UUID
     * @returns {'active'|'available'|'complete'|null}
     */
    resolveStatusFilterForQuestUuid(questUuid) {
        if (!questUuid) return null;
        for (const category of this.categories) {
            const entry = (this.data[category] || []).find(e => e?.uuid === questUuid);
            if (!entry) continue;
            const status = normalizeQuestStatus(entry.status);
            if (status === 'Succeeded' || status === 'Failed') return 'complete';
            if (status === 'Active') return 'active';
            return 'available';
        }
        return null;
    }

    /**
     * Switch the quest status tab (Active / Available / Complete) and sync section visibility + button active state.
     * Does not reload journal data — same path as clicking the status buttons (`_applyStatusFilter` + `.active` toggles).
     * @param {'active'|'available'|'complete'} filter
     */
    applyQuestStatusFilter(filter) {
        const allowed = ['active', 'available', 'complete'];
        if (!allowed.includes(filter)) return;
        this.filters.statusFilter = filter;
        if (!this.element) return;
        const questContainer = this.element.querySelector('[data-panel="panel-quest"]');
        if (!questContainer) return;
        const nativeHtml = getNativeElement(questContainer);
        if (!nativeHtml) return;
        this._applyStatusFilter(nativeHtml);
        nativeHtml.querySelectorAll('.quest-status-button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.statusFilter === filter);
        });
    }

    /**
     * Apply current filters to entries
     * @private
     */
    _applyFilters(entries) {
        const sortedEntries = [...entries].sort((a, b) => a.name.localeCompare(b.name));
        // Only show visible quests to non-GMs
        const filteredEntries = sortedEntries.filter(entry => game.user.isGM || entry.visible !== false);
        if (this.filters.tags.length > 0) {
            return filteredEntries.filter(entry => {
                // Only check for tags in the explicit tags array
                if (!entry.tags || !Array.isArray(entry.tags)) return false;
                const hasAnyTag = this.filters.tags.some(tag => entry.tags.includes(tag));
                return hasAnyTag;
            });
        }
        return filteredEntries;
    }

    /**
     * Set up event listeners
     * @private
     */
    _activateListeners(html) {
        // v13: Use helper method for consistency
        const nativeHtml = getNativeElement(html);
        if (!nativeHtml) return;

        // Abort previous container-level listeners to prevent duplicates on re-render
        if (this._questListenersAbort) this._questListenersAbort.abort();
        this._questListenersAbort = new AbortController();
        const listenerSignal = this._questListenersAbort.signal;

        // Search input - live DOM filtering
        const questSearchContainer = nativeHtml.querySelector('.quest-search');
        const searchInput = questSearchContainer?.querySelector('input');
        const clearButton = nativeHtml.querySelector('.clear-search');
        
        if (searchInput) {
            // Clone to remove existing listeners
            const newInput = searchInput.cloneNode(true);
            searchInput.parentNode?.replaceChild(newInput, searchInput);
            
            newInput.addEventListener('input', (event) => {
                const searchValue = event.target.value.toLowerCase();
                this.filters.search = searchValue;
                
                // Show all entries first (within visible sections)
                // v13: Use nativeHtml instead of html
                if (game.user.isGM) {
                    nativeHtml.querySelectorAll('.quest-entry').forEach(entry => {
                        entry.style.display = '';
                    });
                } else {
                    nativeHtml.querySelectorAll('.quest-entry:not(.unidentified)').forEach(entry => {
                        entry.style.display = '';
                    });
                }
                nativeHtml.querySelectorAll('.quest-section').forEach(section => {
                    section.style.display = '';
                });
                
                if (searchValue) {
                    // Then filter entries
                    // v13: Use nativeHtml instead of html
                    const entriesToSearch = game.user.isGM ? 
                        nativeHtml.querySelectorAll('.quest-entry') : 
                        nativeHtml.querySelectorAll('.quest-entry:not(.unidentified)');

                    entriesToSearch.forEach((entry) => {
                        const name = (entry.querySelector('.quest-entry-name')?.textContent || '').toLowerCase();
                        const description = (entry.querySelector('.quest-entry-description')?.textContent || '').toLowerCase();
                        const location = (entry.querySelector('.quest-entry-location')?.textContent || '').toLowerCase();
                        const tasks = (entry.querySelector('.quest-entry-tasks')?.textContent || '').toLowerCase();
                        const plotHook = (entry.querySelector('.quest-entry-plothook')?.textContent || '').toLowerCase();
                        const tags = (entry.querySelector('.quest-entry-tags')?.textContent || '').toLowerCase();
                        const treasure = (entry.querySelector('.quest-entry-reward')?.textContent || '').toLowerCase();
                        
                        // Special handling for participants - extract names from portrait title attributes
                        let participants = '';
                        entry.querySelectorAll('.participant-portrait').forEach(portrait => {
                            participants += (portrait.title || '') + ' ';
                        });
                        participants = participants.toLowerCase();
                        
                        const matches = name.includes(searchValue) || 
                            description.includes(searchValue) || 
                            location.includes(searchValue) ||
                            tasks.includes(searchValue) ||
                            plotHook.includes(searchValue) ||
                            participants.includes(searchValue) ||
                            tags.includes(searchValue) ||
                            treasure.includes(searchValue);
                        
                        entry.style.display = matches ? '' : 'none';
                    });
                    
                    // Hide empty sections
                    // v13: Use nativeHtml instead of html
                    nativeHtml.querySelectorAll('.quest-section').forEach((section) => {
                        const hasVisibleEntries = section.querySelector('.quest-entry[style*="display: block"], .quest-entry:not([style*="display: none"])') !== null;
                        section.style.display = hasVisibleEntries ? '' : 'none';
                    });
                }
                this._applyStatusFilter(nativeHtml);
            });
        }

        // Add new quest button
        // v13: Use nativeHtml instead of html
        const addQuestButton = nativeHtml.querySelector('.add-quest-button');
        if (addQuestButton) {
            const newButton = addQuestButton.cloneNode(true);
            addQuestButton.parentNode?.replaceChild(newButton, addQuestButton);
            newButton.addEventListener('click', () => {
                if (!game.user.isGM) return;
                
                const journalId = game.settings.get(MODULE.ID, 'questJournal');
                if (!journalId || journalId === 'none') {
                    ui.notifications.warn("No quest journal selected. Use the … menu to select one.");
                    return;
                }
                
                const journal = game.journal.get(journalId);
                if (!journal) {
                    ui.notifications.error("Could not find the quest journal.");
                    return;
                }
                
                openQuestWindow();
            });
        }

        // Quest titlebar "..." context menu (Blacksmith) - all actions except Add New Quest
        // Availability is checked when the button is CLICKED, not when the panel
        // renders. Deciding at render time means that if the API is not ready
        // for that one pass, no listener is ever attached and the button is
        // silently inert for the life of the panel — with nothing logged.
        const titlebarMenuBtn = nativeHtml.querySelector('.quest-titlebar-menu');
        if (titlebarMenuBtn) {
            const newTitlebarBtn = titlebarMenuBtn.cloneNode(true);
            titlebarMenuBtn.parentNode?.replaceChild(newTitlebarBtn, titlebarMenuBtn);
            newTitlebarBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const zones = {
                    core: [
                        {
                            name: 'Refresh Quests',
                            icon: 'fa-solid fa-sync-alt',
                            callback: async () => {
                                if (this.selectedJournal) {
                                    await this._refreshData();
                                    this.render(this.element);
                                    ui.notifications.info("Quests refreshed.");
                                }
                            }
                        },
                        {
                            name: 'Open Quest Journal',
                            icon: 'fa-solid fa-feather',
                            callback: async () => {
                                const journalId = game.settings.get(MODULE.ID, 'questJournal');
                                if (!journalId || journalId === 'none') {
                                    ui.notifications.warn(game.user.isGM ? "No quest journal selected. Use the … menu to select one." : "No quest journal has been set by the GM.");
                                    return;
                                }
                                const journal = game.journal.get(journalId);
                                if (!journal) {
                                    ui.notifications.error("Could not find the quest journal.");
                                    return;
                                }
                                journal.sheet.render(true);
                            }
                        }
                    ],
                    gm: game.user.isGM ? [
                        {
                            name: 'Clear All Quest Pins',
                            icon: 'fa-solid fa-location-xmark',
                            callback: () => this._openClearAllQuestPinsDialog()
                        },
                        {
                            name: 'Select Journal for Quests',
                            icon: 'fa-solid fa-cog',
                            callback: () => {
                                showJournalPicker({
                                    title: 'Select Journal for Quests',
                                    getCurrentId: () => game.settings.get(MODULE.ID, 'questJournal'),
                                    onSelect: async (journalId) => {
                                        await game.settings.set(MODULE.ID, 'questJournal', journalId);
                                        ui.notifications.info(`Journal for Quests ${journalId === 'none' ? 'cleared' : 'selected'}.`);
                                    },
                                    reRender: () => this.render(this.element),
                                    hint: 'Each page in this journal is one quest.'
                                });
                            }
                        },
                        {
                            name: 'Import Quests from JSON',
                            icon: 'fa-solid fa-file-import',
                            callback: () => this._openImportQuestsDialog()
                        },
                        {
                            name: 'Export Quests to JSON',
                            icon: 'fa-solid fa-file-export',
                            callback: () => this._openExportQuestsDialog()
                        }
                    ] : []
                };
                const contextMenu = getBlacksmith()?.uiContextMenu;
                if (typeof contextMenu?.show !== 'function') {
                    ui.notifications.warn('The quest menu needs Coffee Pub Blacksmith.');
                    console.error(`${MODULE.TITLE} | uiContextMenu unavailable when opening the quest menu.`);
                    return;
                }
                contextMenu.show({
                    id: `${MODULE.ID}-quest-titlebar-menu`,
                    x: event.clientX,
                    y: event.clientY,
                    zones
                });
            });
        }

        // Tag cloud tag selection
        // v13: Use nativeHtml instead of html
        nativeHtml.querySelectorAll('.quest-tag-cloud .quest-tag').forEach(tag => {
            const newTag = tag.cloneNode(true);
            tag.parentNode?.replaceChild(newTag, tag);
            newTag.addEventListener('click', (event) => {
                event.preventDefault();
                const tagValue = event.currentTarget.dataset.tag;
                const tagIndex = this.filters.tags.indexOf(tagValue);
                if (tagIndex === -1) {
                    this.filters.tags.push(tagValue);
                } else {
                    this.filters.tags.splice(tagIndex, 1);
                }
                
                // Show all entries and sections before filtering
                // v13: Use nativeHtml instead of html
                nativeHtml.querySelectorAll('.quest-entry').forEach(entry => {
                    entry.style.display = '';
                });
                nativeHtml.querySelectorAll('.quest-section').forEach(section => {
                    section.style.display = '';
                });
                
                this.render(this.element);
            });
        });

        // Clear search button
        // v13: Use native DOM methods
        if (clearButton) {
            clearButton.classList.remove('disabled');
            const newClearButton = clearButton.cloneNode(true);
            clearButton.parentNode?.replaceChild(newClearButton, clearButton);
            newClearButton.addEventListener('click', (event) => {
                this.filters.search = "";
                this.filters.tags = [];
                this.filters.statusFilter = "active";
                if (searchInput) {
                    searchInput.value = "";
                }
                // v13: Use nativeHtml instead of html
                nativeHtml.querySelectorAll('.quest-tag.selected').forEach(tag => {
                    tag.classList.remove('selected');
                });
                
                // Show all entries and sections
                nativeHtml.querySelectorAll('.quest-entry').forEach(entry => {
                    entry.style.display = '';
                });
                nativeHtml.querySelectorAll('.quest-section').forEach(section => {
                    section.style.display = '';
                });
                
                this.render(this.element);
            });
        }

        // Status filter buttons
        nativeHtml.querySelectorAll('.quest-status-button').forEach(button => {
            const newButton = button.cloneNode(true);
            button.parentNode?.replaceChild(newButton, button);
            newButton.addEventListener('click', (event) => {
                event.preventDefault();
                const statusFilter = event.currentTarget.dataset.statusFilter || 'active';
                this.filters.statusFilter = statusFilter;
                this._applyStatusFilter(nativeHtml);
                nativeHtml.querySelectorAll('.quest-status-button').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.statusFilter === statusFilter);
                });
            });
        });

        // Toggle tags button
        // v13: Use nativeHtml instead of html
        const toggleTagsButton = nativeHtml.querySelector('.toggle-tags-button');
        if (toggleTagsButton) {
            const newButton = toggleTagsButton.cloneNode(true);
            toggleTagsButton.parentNode?.replaceChild(newButton, toggleTagsButton);
            newButton.addEventListener('click', (event) => {
                const tagCloud = nativeHtml.querySelector('.quest-tag-cloud');
                if (!tagCloud) return;
                const isCollapsed = tagCloud.classList.contains('collapsed');
                
                tagCloud.classList.toggle('collapsed');
                event.currentTarget.classList.toggle('active');
                
                game.user.setFlag(MODULE.ID, 'questTagCloudCollapsed', !isCollapsed);
            });
        }

        // Link clicks
        // v13: Use nativeHtml instead of html
        nativeHtml.querySelectorAll('.quest-entry-link').forEach(link => {
            const newLink = link.cloneNode(true);
            link.parentNode?.replaceChild(newLink, link);
            newLink.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const uuid = event.currentTarget.dataset.uuid;
                if (uuid) {
                    const doc = await fromUuid(uuid);
                    if (doc) {
                        doc.sheet.render(true);
                    }
                }
            });
        });

        // Participant portrait clicks
        // v13: Use nativeHtml instead of html
        nativeHtml.querySelectorAll('.participant-portrait').forEach(portrait => {
            const newPortrait = portrait.cloneNode(true);
            portrait.parentNode?.replaceChild(newPortrait, portrait);
            newPortrait.addEventListener('click', async (event) => {
                const uuid = event.currentTarget.dataset.uuid;
                if (uuid) {
                    const doc = await fromUuid(uuid);
                    if (doc) doc.sheet.render(true);
                }
            });
        });

        // Treasure UUID link clicks
        // v13: Use nativeHtml instead of html
        nativeHtml.querySelectorAll('.quest-entry-reward a[data-uuid]').forEach(link => {
            const newLink = link.cloneNode(true);
            link.parentNode?.replaceChild(newLink, link);
            newLink.addEventListener('click', async (event) => {
                event.preventDefault();
                const uuid = event.currentTarget.dataset.uuid;
                if (uuid) {
                    const doc = await fromUuid(uuid);
                    if (doc) doc.sheet.render(true);
                }
            });
        });

        // Objective number: GM = mousedown (left=complete, middle=hidden, right=failed); Player = click (toggle active)
        // v13: Use nativeHtml instead of html
        const objectiveNumbers = nativeHtml.querySelectorAll('.quest-entry-tasks .objective-number');
        
        objectiveNumbers.forEach(numEl => {
            // PLAYER: left-click = toggle active/not active
            numEl.addEventListener('click', async function(event) {
                event.preventDefault();
                event.stopPropagation();
                if (game.user.isGM) {
                    if (event.currentTarget._stateChangeHandled) event.currentTarget._stateChangeHandled = false;
                    return;
                }
                const li = event.currentTarget.closest('li');
                const questEntry = event.currentTarget.closest('.quest-entry');
                if (!li || !questEntry) return;
                const taskIndex = parseInt(li.dataset.taskIndex);
                const questUuid = questEntry.dataset.questUuid;
                if (isNaN(taskIndex) || !questUuid) return;
                const currentActiveIndex = await this._getActiveObjectiveIndex(questUuid);
                if (currentActiveIndex === taskIndex) {
                    await this._clearActiveObjective(questUuid);
                    ui.notifications.info('Active objective cleared.');
                } else {
                    await this._clearAllActiveObjectives();
                    await this._setActiveObjective(questUuid, taskIndex);
                    ui.notifications.info(`Objective ${taskIndex + 1} set as active.`);
                }
                this.render(this.element);
            }.bind(this));

            // GM: mousedown = left=complete, middle=hidden, right=failed
            numEl.addEventListener('mousedown', async function(event) {
                // Check for shift-left-click (same as middle-click for hidden toggle)
                const isShiftLeftClick = event.button === 0 && event.shiftKey;
                const isMiddleClick = event.button === 1;
                const isRightClick = event.button === 2;
                const isLeftClick = event.button === 0 && !event.shiftKey;
                if (!game.user.isGM) return;
                const li = event.currentTarget.closest('li');
                if (!li) return;
                const taskIndex = parseInt(li.dataset.taskIndex);
                const questEntry = event.currentTarget.closest('.quest-entry');
                if (!questEntry) return;
                const questUuid = questEntry.dataset.questUuid;
                if (!questUuid) return;
                const journalId = game.settings.get(MODULE.ID, 'questJournal');
                if (!journalId || journalId === 'none') return;
                const journal = game.journal.get(journalId);
                if (!journal) return;
                const page = journal.pages.find(p => p.uuid === questUuid);
                if (!page) return;
                let content = page.text.content;
                const tasksMatch = content.match(/<strong>Tasks:<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/);
                if (!tasksMatch) return;
                const tasksHtml = tasksMatch[1];
                const parser = new DOMParser();
                const ulDoc = parser.parseFromString(`<ul>${tasksHtml}</ul>`, 'text/html');
                const ul = ulDoc.querySelector('ul');
                const liList = ul ? Array.from(ul.children) : [];
                const taskLi = liList[taskIndex];
                if (!taskLi) return;

                if (isMiddleClick || isShiftLeftClick) { // Middle-click or Shift+Left-click: toggle hidden
                event.preventDefault();
                event.currentTarget._stateChangeHandled = true;
                const emTag = taskLi.querySelector('em');
                if (emTag) {
                    // Task is already hidden, unhide it - unwrap <em>
                    emTag.replaceWith(...emTag.childNodes);
                } else {
                    // Task is not hidden, hide it - wrap in <em> and remove other states
                    // First, unwrap any existing state tags to ensure clean state
                    const sTag = li.querySelector('s');
                    const codeTag = li.querySelector('code');
                    
                    if (sTag) {
                        // If completed, unwrap <s> first
                        taskLi.innerHTML = sTag.innerHTML;
                    } else if (codeTag) {
                        // If failed, unwrap <code> first
                        taskLi.innerHTML = codeTag.innerHTML;
                    }
                    
                    // Now wrap in <em>
                    taskLi.innerHTML = `<em>${taskLi.innerHTML}</em>`;
                }
                const newTasksHtml = ul.innerHTML;
                const newContent = content.replace(tasksMatch[1], newTasksHtml);
                try {
                    await page.update({ text: { content: newContent } });
                    
                    // Refresh the panel display to show the updated checkbox state
                    if (this.element) {
                        await this._refreshData();
                        this.render(this.element);
                    }
                } catch (error) {
                    console.error('Error updating journal page (hidden toggle):', error);
                }
                    return;
                }
                
                if (isRightClick) { // Right-click: toggle failed state
                    event.preventDefault();
                    event.currentTarget._stateChangeHandled = true;
                    const codeTag = taskLi.querySelector('code');
                    if (codeTag) {
                        // Task is already failed, unfail it - unwrap <code>
                        taskLi.innerHTML = codeTag.innerHTML;
                    } else {
                        // Task is not failed, fail it - wrap in <code> and remove other states
                        // First, unwrap any existing state tags to ensure clean state
                        const sTag = taskLi.querySelector('s');
                        const emTag = taskLi.querySelector('em');
                        
                        if (sTag) {
                            // If completed, unwrap <s> first
                            taskLi.innerHTML = sTag.innerHTML;
                        } else if (emTag) {
                            // If hidden, unwrap <em> first
                            taskLi.innerHTML = emTag.innerHTML;
                        }
                        
                        // Now wrap in <code>
                        taskLi.innerHTML = `<code>${taskLi.innerHTML}</code>`;
                    }
                    
                    const newTasksHtml = ul.innerHTML;
                    let newContent = content.replace(tasksMatch[1], newTasksHtml);
                    
                    try {
                        await page.update({ text: { content: newContent } });
                        
                        // Refresh the panel display to show the updated checkbox state
                        if (this.element) {
                            await this._refreshData();
                            this.render(this.element);
                        }
                    } catch (error) {
                        console.error('Error updating journal page (failed task toggle):', error);
                    }
                    return;
                }
                
                if (isLeftClick) { // Left-click: toggle completed
                event.preventDefault();
                event.currentTarget._stateChangeHandled = true;
                const sTag = taskLi.querySelector('s');
                if (sTag) {
                    // Task is already completed, uncomplete it - unwrap <s>
                    taskLi.innerHTML = sTag.innerHTML;
                } else {
                    // Task is not completed, complete it - wrap in <s> and remove other states
                    // First, unwrap any existing state tags to ensure clean state
                    const codeTag = taskLi.querySelector('code');
                    const emTag = taskLi.querySelector('em');
                    
                    if (codeTag) {
                        // If failed, unwrap <code> first
                        taskLi.innerHTML = codeTag.innerHTML;
                    } else if (emTag) {
                        // If hidden, unwrap <em> first
                        taskLi.innerHTML = emTag.innerHTML;
                    }
                    
                    // Now wrap in <s>
                    taskLi.innerHTML = `<s>${taskLi.innerHTML}</s>`;
                    
                    // Send objective completed notification
                    const objectiveText = taskLi.textContent.trim();
                    notifyObjectiveCompleted(objectiveText, questUuid, taskIndex);
                }
                const newTasksHtml = ul.innerHTML;
                let newContent = content.replace(tasksMatch[1], newTasksHtml);
                // After toggling, check if all tasks are completed
                const allLis = Array.from(ul.children);
                const allCompleted = allLis.length > 0 && allLis.every(l => l.querySelector('s'));
                // Find current status and category
                const statusMatch = newContent.match(/<strong>Status:<\/strong>\s*([^<]*)/);
                let currentStatus = statusMatch ? statusMatch[1].trim() : '';
                const categoryMatch = newContent.match(/<strong>Category:<\/strong>\s*([^<]*)/);
                const currentCategory = categoryMatch ? categoryMatch[1].trim() : '';
                
                if (allCompleted) {
                    // Change status to Complete
                    if (!['Complete', 'Succeeded'].includes(currentStatus)) {
                        if (statusMatch) {
                            newContent = newContent.replace(/(<strong>Status:<\/strong>\s*)[^<]*/, '$1Succeeded');
                        } else {
                            newContent += `<p><strong>Status:</strong> Succeeded</p>`;
                        }
                        
                        // Get or store original category
                        let originalCategory = await page.getFlag(MODULE.ID, 'originalCategory');
                        if (!originalCategory && currentCategory && currentCategory !== 'Completed') {
                            originalCategory = currentCategory;
                            await page.setFlag(MODULE.ID, 'originalCategory', originalCategory);
                        }
                        
                        // Send quest completed notification
                        const questName = page.name || 'Unknown Quest';
                        notifyQuestCompleted(questName, questUuid);
                        
                        // Remove automatic category change to Completed
                    }
                } else {
                    // If status is Complete and not all tasks are completed, set to In Progress
                    if (['Complete', 'Succeeded'].includes(currentStatus)) {
                        newContent = newContent.replace(/(<strong>Status:<\/strong>\s*)[^<]*/, '$1Active');
                        
                        // Restore original category if quest is in Completed
                        if (currentCategory === 'Completed') {
                            const originalCategory = await page.getFlag(MODULE.ID, 'originalCategory');
                            if (originalCategory && categoryMatch) {
                                newContent = newContent.replace(/(<strong>Category:<\/strong>\s*)[^<]*/, `$1${originalCategory}`);
                            }
                        }
                    }
                }
                try {
                    await page.update({ text: { content: newContent } });
                    
                    // Refresh the panel display to show the updated checkbox state
                    if (this.element) {
                        await this._refreshData();
                        this.render(this.element);
                    }
                } catch (error) {
                        console.error('Error updating journal page (completion toggle):', error);
                    }
                }
            }.bind(this));
        });

        // --- Quest Card Collapse/Expand ---
        // Always start collapsed unless remembered
        // v13: Use nativeHtml instead of html
        nativeHtml.querySelectorAll('.quest-entry').forEach(entry => {
            entry.classList.add('collapsed');
        });
        // Restore open/closed state from user flag
        const questCardCollapsed = game.user.getFlag(MODULE.ID, 'questCardCollapsed') || {};
        nativeHtml.querySelectorAll('.quest-entry').forEach(entry => {
            const uuid = entry.dataset.questUuid;
            if (uuid && questCardCollapsed[uuid] === false) {
                entry.classList.remove('collapsed');
            }
        });
        // v13: Use native DOM event delegation (with signal to avoid duplicates on re-render)
        // Toggle collapse on chevron click
        nativeHtml.addEventListener('click', async function(e) {
            // Check if the clicked element is the toggle or is inside the toggle
            const toggle = e.target.closest('.quest-entry-toggle');
            if (!toggle) return;
            
            // Prevent the header click handler from also firing
            e.stopPropagation();
            
            const card = toggle.closest('.quest-entry');
            if (!card) return;
            card.classList.toggle('collapsed');
            const uuid = card.dataset.questUuid;
            if (uuid) {
                const collapsed = card.classList.contains('collapsed');
                const flag = game.user.getFlag(MODULE.ID, 'questCardCollapsed') || {};
                flag[uuid] = collapsed;
                await game.user.setFlag(MODULE.ID, 'questCardCollapsed', flag);
            }
        }, { signal: listenerSignal });
        // Toggle collapse on header click (but not controls)
        nativeHtml.addEventListener('click', async function(e) {
            const header = e.target.closest('.quest-entry-header');
            if (!header) return;
            
            // Don't toggle if clicking on toolbar
            if (e.target.closest('.quest-toolbar')) return;
            
            const card = header.closest('.quest-entry');
            if (!card) return;
            card.classList.toggle('collapsed');
            const uuid = card.dataset.questUuid;
            if (uuid) {
                const collapsed = card.classList.contains('collapsed');
                const flag = game.user.getFlag(MODULE.ID, 'questCardCollapsed') || {};
                flag[uuid] = collapsed;
                await game.user.setFlag(MODULE.ID, 'questCardCollapsed', flag);
            }
        }, { signal: listenerSignal });

        // Pin quest handler
        // v13: Use nativeHtml instead of html
        nativeHtml.querySelectorAll('.quest-pin').forEach(pin => {
            const newPin = pin.cloneNode(true);
            pin.parentNode?.replaceChild(newPin, pin);
            newPin.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const uuid = event.currentTarget.dataset.uuid;
                const category = event.currentTarget.dataset.category;
                if (!uuid || !category) return;
                
                // Check if this quest is in "In Progress" status
                // Since we only show pins in In Progress section,
                // and we only process clicks on pins that exist,
                // this check is now redundant and can be removed
                
                // Get current pinned quests
                const pinnedQuests = await game.user.getFlag(MODULE.ID, 'pinnedQuests') || {};
                
                // Check if this quest is already pinned
                const isPinned = Object.values(pinnedQuests).includes(uuid);
                
                if (isPinned) {
                    // Unpin this quest
                    for (const cat in pinnedQuests) {
                        if (pinnedQuests[cat] === uuid) {
                            pinnedQuests[cat] = null;
                        }
                    }
                    
                    // Clear active objective when unpinning
                    await this._clearActiveObjective(uuid);
                    
                    // Clear quest notifications when unpinning
                    this.clearQuestNotifications();
                } else {
                    // Clear any existing pins
                    for (const cat in pinnedQuests) {
                        pinnedQuests[cat] = null;
                    }
                    // Pin this quest
                    pinnedQuests[category] = uuid;
                    
                    // Clear active objectives when pinning a new quest
                    await this._clearAllActiveObjectives();
                    
                    // Get quest name for notification
                    const questPage = await fromUuid(uuid);
                    const questName = questPage?.name || 'Unknown Quest';

                    // Deliberate pin: lift any ×-dismissal suppression and notify
                    QuestPanel.questNotificationDismissed = false;
                    this.notifyQuestPinned(questName, category);
                }
                
                await game.user.setFlag(MODULE.ID, 'pinnedQuests', pinnedQuests);
                await this._mirrorTrackerFlagToPlayers('pinnedQuests', pinnedQuests);
                this.render(this.element);

            });
        });

        // Pin to Scene (quest-level) - GM only; click dim = place, click not-dim = unplace (like Notes)
        nativeHtml.querySelectorAll('.quest-pin-to-scene').forEach(btn => {
            const newBtn = btn.cloneNode(true);
            btn.parentNode?.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const uuid = newBtn.dataset.uuid;
                const questNumber = newBtn.dataset.questNumber;
                const category = newBtn.dataset.category;
                const visible = newBtn.dataset.visible;
                const questStatus = newBtn.dataset.questStatus;
                const hasPinOnScene = !!findLiveQuestPin(uuid)?.sceneId;
                if (!uuid) return;
                if (hasPinOnScene) {
                    await this._unplaceQuestPin(uuid);
                } else {
                    await this._beginQuestPinPlacement(uuid, questNumber, category, questStatus, visible);
                }
            });
        });

        // Visibility toggle (quest-level) - GM only; direct eye/eye-slash icon in toolbar
        nativeHtml.querySelectorAll('.quest-visibility-toggle').forEach(btn => {
            const newBtn = btn.cloneNode(true);
            btn.parentNode?.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const uuid = newBtn.dataset.uuid;
                if (!uuid) return;
                await this._toggleQuestVisibility(uuid);
            });
        });

        // Pin to Scene (objective-level) - GM only; click dim = place, click not-dim = unplace (like Notes)
        nativeHtml.querySelectorAll('.objective-pin-to-scene').forEach(btn => {
            const newBtn = btn.cloneNode(true);
            btn.parentNode?.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const questUuid = newBtn.dataset.questUuid;
                const questNumber = newBtn.dataset.questNumber;
                const category = newBtn.dataset.category;
                const visible = newBtn.dataset.visible;
                const taskIndex = parseInt(newBtn.dataset.taskIndex, 10);
                const taskState = newBtn.dataset.taskState || 'active';
                const taskText = newBtn.dataset.taskText || '';
                const livePin = findLiveObjectivePin(questUuid, taskIndex);
                let hasPinOnScene = !!livePin?.sceneId;
                if (questUuid == null || isNaN(taskIndex)) return;

                if (hasPinOnScene) {
                    await this._unplaceObjectivePin(questUuid, taskIndex);
                } else {
                    await this._beginObjectivePinPlacement(
                        questUuid,
                        taskIndex,
                        questNumber,
                        category,
                        visible,
                        { state: taskState, text: taskText }
                    );
                }
            });
        });

        // Objective context menu (GM only) - Blacksmith Context Menu
        // Resolved per click, not per render — see the titlebar menu above.
        const objCtxMenu = {
            show: (...args) => {
                const menu = getBlacksmith()?.uiContextMenu;
                if (typeof menu?.show !== 'function') {
                    console.error(`${MODULE.TITLE} | uiContextMenu unavailable when opening the objective menu.`);
                    return null;
                }
                return menu.show(...args);
            }
        };
        if (objCtxMenu) {
            nativeHtml.querySelectorAll('.objective-context-menu').forEach(menuButton => {
                const newButton = menuButton.cloneNode(true);
                menuButton.parentNode?.replaceChild(newButton, menuButton);
                newButton.addEventListener('click', async (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!game.user.isGM) return;
                    const questUuid = newButton.dataset.questUuid;
                    const questNumber = newButton.dataset.questNumber;
                    const category = newButton.dataset.category;
                    const visible = newButton.dataset.visible;
                    const taskIndex = parseInt(newButton.dataset.taskIndex, 10);
                    const taskState = newButton.dataset.taskState || 'active';
                    const taskText = newButton.dataset.taskText || '';
                    const isActive = newButton.dataset.isActive === 'true';
                    let hasPinOnScene = !!findLiveObjectivePin(questUuid, taskIndex)?.sceneId;
                    if (!questUuid || isNaN(taskIndex)) return;

                    const pinMenuEntry = hasPinOnScene
                        ? {
                            name: 'Unpin from Canvas',
                            icon: 'fa-solid fa-location-dot-slash',
                            callback: async () => {
                                await this._unplaceObjectivePin(questUuid, taskIndex);
                            }
                        }
                        : {
                            name: 'Pin to Canvas',
                            icon: 'fa-solid fa-location-dot',
                            callback: async () => {
                                await this._beginObjectivePinPlacement(
                                    questUuid,
                                    taskIndex,
                                    questNumber,
                                    category,
                                    visible,
                                    { state: taskState, text: taskText }
                                );
                            }
                        };

                    const zones = {
                        gm: [
                            pinMenuEntry,
                            {
                                name: isActive ? 'Set Not Active' : 'Set Active',
                                icon: 'fa-solid fa-bullseye',
                                callback: async () => {
                                    const currentActiveIndex = await this._getActiveObjectiveIndex(questUuid);
                                    if (currentActiveIndex === taskIndex) {
                                        await this._clearActiveObjective(questUuid);
                                        ui.notifications.info('Active objective cleared.');
                                    } else {
                                        await this._clearAllActiveObjectives();
                                        await this._setActiveObjective(questUuid, taskIndex);
                                        ui.notifications.info(`Objective ${taskIndex + 1} set as active.`);
                                    }
                                    this.render(this.element);
                                }
                            },
                            {
                                name: 'Set Status',
                                icon: 'fa-solid fa-pen',
                                submenu: [
                                    { name: 'Complete', icon: 'fa-solid fa-check', callback: () => this._setObjectiveState(questUuid, taskIndex, 'completed') },
                                    { name: 'Incomplete', icon: 'fa-solid fa-square', callback: () => this._setObjectiveState(questUuid, taskIndex, 'active') },
                                    { name: 'Failed', icon: 'fa-solid fa-xmark', callback: () => this._setObjectiveState(questUuid, taskIndex, 'failed') },
                                    { name: 'Hidden', icon: 'fa-solid fa-eye-slash', callback: () => this._setObjectiveState(questUuid, taskIndex, 'hidden') }
                                ]
                            }
                        ]
                    };

                    objCtxMenu.show({
                        id: `${MODULE.ID}-objective-menu-${questUuid}-${taskIndex}`,
                        x: event.clientX,
                        y: event.clientY,
                        zones
                    });
                });
            });
        }

        // Quest options menu (GM only) - Blacksmith Context Menu
        // Resolved per click, not per render — see the titlebar menu above.
        const ctxMenu = {
            show: (...args) => {
                const menu = getBlacksmith()?.uiContextMenu;
                if (typeof menu?.show !== 'function') {
                    console.error(`${MODULE.TITLE} | uiContextMenu unavailable when opening the quest status menu.`);
                    return null;
                }
                return menu.show(...args);
            }
        };
        if (ctxMenu) {
            nativeHtml.querySelectorAll('.quest-status-menu').forEach(menuButton => {
                const newButton = menuButton.cloneNode(true);
                menuButton.parentNode?.replaceChild(newButton, menuButton);
                newButton.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!game.user.isGM) return;
                    const uuid = newButton.dataset.uuid;
                    if (!uuid) return;

                    const entryEl = newButton.closest('.quest-entry');
                    const visible = entryEl?.dataset?.visible === 'true';
                    const zones = {
                        gm: [
                            {
                                name: 'Edit Quest',
                                icon: 'fa-solid fa-pen-to-square',
                                callback: async () => {
                                    const page = await fromUuid(uuid);
                                    if (page) await openQuestWindow({ page });
                                }
                            },
                            {
                                name: 'Open Journal Page',
                                icon: 'fa-solid fa-feather',
                                callback: async () => {
                                    const doc = await fromUuid(uuid);
                                    if (doc) doc.sheet.render(true);
                                }
                            },
                            {
                                name: 'Configure Pin',
                                icon: 'fa-solid fa-palette',
                                callback: async () => {
                                    await this._configureQuestPin(uuid);
                                }
                            },
                            {
                                name: 'Clear Quest Pins',
                                icon: 'fa-solid fa-eraser',
                                callback: async () => {
                                    await this._clearQuestPins(uuid);
                                }
                            },
                            {
                                name: 'Change Status',
                                icon: 'fa-solid fa-pen',
                                submenu: [
                                    { name: 'Active', icon: 'fa-solid fa-spinner', callback: () => this._applyQuestStatus(uuid, 'Active') },
                                    { name: 'Available', icon: 'fa-solid fa-circle', callback: () => this._applyQuestStatus(uuid, 'Available') },
                                    { name: 'Succeeded', icon: 'fa-solid fa-check', callback: () => this._applyQuestStatus(uuid, 'Succeeded') },
                                    { name: 'Failed', icon: 'fa-solid fa-xmark', callback: () => this._applyQuestStatus(uuid, 'Failed') }
                                ]
                            }
                        ]
                    };

                    ctxMenu.show({
                        id: `${MODULE.ID}-quest-entry-menu`,
                        x: event.clientX,
                        y: event.clientY,
                        zones
                    });
                });
            });
        }

        // --- Drag and Drop for Quest Entries (GM only) ---
        if (game.user.isGM) {
            // v13: Use nativeHtml instead of html
            const questEntries = nativeHtml.querySelectorAll('.quest-entry');
            // v13: Cloning elements removes old listeners, so no need for .off()
            
            // v13: Use native DOM event listeners
            questEntries.forEach(entry => {
                entry.addEventListener('dragenter', function(event) {
                    event.preventDefault();
                    event.stopPropagation();
                    let isValid = false;
                    try {
                        const data = JSON.parse(event.dataTransfer.getData('text/plain'));
                        if (["Actor", "Item"].includes(data.type)) isValid = true;
                    } catch (e) {
                        // If we can't parse the data yet, assume it might be valid
                        isValid = true;
                    }
                    
                    if (isValid) {
                        event.currentTarget.classList.add('drop-target');
                    }
                });

                entry.addEventListener('dragleave', function(event) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.currentTarget.classList.remove('drop-target');
                });

                entry.addEventListener('dragover', function(event) {
                    event.preventDefault();
                    event.stopPropagation();
                    // Make sure the class stays applied during dragover
                    event.currentTarget.classList.add('drop-target');
                    event.dataTransfer.dropEffect = 'copy';
                });

                entry.addEventListener('drop', async (event) => {
                    event.preventDefault();
                    const entryEl = event.currentTarget;
                    entryEl.classList.remove('drop-target');
                    
                    try {
                        const dataTransfer = event.dataTransfer.getData('text/plain');
                        const data = JSON.parse(dataTransfer);
                        const blacksmith = getBlacksmith();
                        if (blacksmith) {
                            const sound = game.settings.get(MODULE.ID, 'dropSound');
                            blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH.SOUNDVOLUMESOFT, false, false);
                        }
                        const uuid = entryEl.dataset.questUuid;
                        if (!uuid) {
                            ui.notifications.warn("Could not find the quest entry.");
                            return;
                        }
                    const page = await fromUuid(uuid);
                    if (!page) {
                        ui.notifications.warn("Could not find the quest page.");
                        return;
                    }
                    
                    // Get the document content
                    let content = page.text.content;
                    let updated = false;
                    
                    if (data.type === 'Actor') {
                        const actor = await fromUuid(data.uuid || (data.id ? `Actor.${data.id}` : undefined));
                        if (actor) {
                            // Create the UUID link for the actor
                            const uuidLink = actor.uuid ? `@UUID[${actor.uuid}]{${actor.name}}` : `@UUID[Actor.${actor.id}]{${actor.name}}`;

                            // NEW APPROACH: More aggressive HTML parsing to fix duplicate sections
                            const tempDiv = document.createElement('div');
                            tempDiv.innerHTML = content;
                            
                            // Find all Participants sections
                            const participantHeadings = [...tempDiv.querySelectorAll('p')].filter(p => 
                                p.textContent.trim().startsWith('Participants:') || 
                                (p.querySelector('strong') && p.querySelector('strong').textContent.trim() === 'Participants:')
                            );
                            
                            if (participantHeadings.length > 0) {
                                // Get the first heading
                                const firstHeading = participantHeadings[0];
                                
                                // Find all participant lists following any heading
                                const allParticipantLists = [];
                                for (const heading of participantHeadings) {
                                    let nextElement = heading.nextElementSibling;
                                    while (nextElement && nextElement.tagName === 'UL') {
                                        allParticipantLists.push(nextElement);
                                        nextElement = nextElement.nextElementSibling;
                                    }
                                }
                                
                                // Collect all participant items
                                const allParticipants = [];
                                for (const list of allParticipantLists) {
                                    const items = list.querySelectorAll('li');
                                    for (const item of items) {
                                        allParticipants.push(item.innerHTML);
                                    }
                                }
                                
                                // Check if actor is already in participants
                                // We need to improve this check to handle various formats
                                const isActorAlreadyAdded = allParticipants.some(p => {
                                    // Check direct matches of the actor name or UUID
                                    if (p.includes(actor.name) || p.includes(actor.uuid)) return true;
                                    
                                    // Check for UUID pattern matches
                                    if (p.includes(`@UUID[${actor.uuid}]`) || p.includes(`@UUID[Actor.${actor.id}]`)) return true;
                                    
                                    // Parse the HTML to find data-uuid attributes
                                    const tempEl = document.createElement('div');
                                    tempEl.innerHTML = p;
                                    const links = tempEl.querySelectorAll('a[data-uuid]');
                                    for (const link of links) {
                                        const linkUuid = link.dataset.uuid;
                                        if (linkUuid === actor.uuid || linkUuid === `Actor.${actor.id}`) return true;
                                    }
                                    
                                    return false;
                                });
                                
                                if (isActorAlreadyAdded) {
                                    ui.notifications.warn(`${actor.name} is already a participant.`);
                                    return;
                                }
                                
                                // Add new actor
                                allParticipants.push(uuidLink);
                                
                                // Remove all existing participant lists
                                for (const list of allParticipantLists) {
                                    list.parentNode.removeChild(list);
                                }
                                
                                // Remove all participant headings except the first one
                                for (let i = 1; i < participantHeadings.length; i++) {
                                    participantHeadings[i].parentNode.removeChild(participantHeadings[i]);
                                }
                                
                                // Create new list after the first heading
                                const newList = document.createElement('ul');
                                newList.innerHTML = allParticipants.map(p => `<li class="quest-participant">${p}</li>`).join('');
                                
                                // Insert after the first heading
                                if (firstHeading.nextSibling) {
                                    firstHeading.parentNode.insertBefore(newList, firstHeading.nextSibling);
                                } else {
                                    firstHeading.parentNode.appendChild(newList);
                                }
                                
                                // Update the content
                                content = tempDiv.innerHTML;
                                updated = true;
                                ui.notifications.info(`Added ${actor.name} as a participant.`);
                                entryEl.classList.add('dropped-success');
                                trackModuleTimeout(() => entryEl.classList.remove('dropped-success'), 800);
                            } else {
                                // No participants section exists, create one at the end
                                const participantsSection = `
                                    <p><strong>Participants:</strong></p>
                                    <ul>
                                        <li class="quest-participant">${uuidLink}</li>
                                    </ul>
                                `;
                                content += participantsSection;
                                updated = true;
                                ui.notifications.info(`Added ${actor.name} as a participant.`);
                                entryEl.classList.add('dropped-success');
                                trackModuleTimeout(() => entryEl.classList.remove('dropped-success'), 800);
                            }
                        } else {
                            ui.notifications.error('Could not resolve actor from drop.');
                        }
                    } else if (data.type === 'Item') {
                        const item = await fromUuid(data.uuid || (data.id ? `Item.${data.id}` : undefined));
                        if (item) {
                            // Create the UUID link for the item
                            const uuidLink = item.uuid ? `@UUID[${item.uuid}]{${item.name}}` : `@UUID[Item.${item.id}]{${item.name}}`;

                            // Use DOM-based approach to fix duplicate sections
                            const tempDiv = document.createElement('div');
                            tempDiv.innerHTML = content;
                            
                            // Find all Treasure sections
                            const treasureHeadings = [...tempDiv.querySelectorAll('p')].filter(p => 
                                p.textContent.trim().startsWith('Treasure:') || 
                                (p.querySelector('strong') && p.querySelector('strong').textContent.trim() === 'Treasure:')
                            );
                            
                            if (treasureHeadings.length > 0) {
                                // Get the first heading
                                const firstHeading = treasureHeadings[0];
                                
                                // Find all treasure lists following any heading
                                const allTreasureLists = [];
                                for (const heading of treasureHeadings) {
                                    let nextElement = heading.nextElementSibling;
                                    while (nextElement && nextElement.tagName === 'UL') {
                                        allTreasureLists.push(nextElement);
                                        nextElement = nextElement.nextElementSibling;
                                    }
                                }
                                
                                // Collect all treasure items
                                const allTreasures = [];
                                for (const list of allTreasureLists) {
                                    const items = list.querySelectorAll('li');
                                    for (const item of items) {
                                        allTreasures.push(item.innerHTML);
                                    }
                                }
                                
                                // Check if item is already in treasures
                                const isItemAlreadyAdded = allTreasures.some(t => {
                                    // Check direct matches of the item name or UUID
                                    if (t.includes(item.name) || t.includes(item.uuid)) return true;
                                    
                                    // Check for UUID pattern matches
                                    if (t.includes(`@UUID[${item.uuid}]`) || t.includes(`@UUID[Item.${item.id}]`)) return true;
                                    
                                    // Parse the HTML to find data-uuid attributes
                                    const tempEl = document.createElement('div');
                                    tempEl.innerHTML = t;
                                    const links = tempEl.querySelectorAll('a[data-uuid]');
                                    for (const link of links) {
                                        const linkUuid = link.dataset.uuid;
                                        if (linkUuid === item.uuid || linkUuid === `Item.${item.id}`) return true;
                                    }
                                    
                                    return false;
                                });
                                
                                if (isItemAlreadyAdded) {
                                    ui.notifications.warn(`${item.name} is already listed as treasure.`);
                                    return;
                                }
                                
                                // Add new item
                                allTreasures.push(uuidLink);
                                
                                // Remove all existing treasure lists
                                for (const list of allTreasureLists) {
                                    list.parentNode.removeChild(list);
                                }
                                
                                // Remove all treasure headings except the first one
                                for (let i = 1; i < treasureHeadings.length; i++) {
                                    treasureHeadings[i].parentNode.removeChild(treasureHeadings[i]);
                                }
                                
                                // Create new list after the first heading
                                const newList = document.createElement('ul');
                                newList.innerHTML = allTreasures.map(t => `<li class="quest-treasure">${t}</li>`).join('');
                                
                                // Insert after the first heading
                                if (firstHeading.nextSibling) {
                                    firstHeading.parentNode.insertBefore(newList, firstHeading.nextSibling);
                                } else {
                                    firstHeading.parentNode.appendChild(newList);
                                }
                                
                                // Update the content
                                content = tempDiv.innerHTML;
                                updated = true;
                                ui.notifications.info(`Added ${item.name} as treasure.`);
                                entryEl.classList.add('dropped-success');
                                trackModuleTimeout(() => entryEl.classList.remove('dropped-success'), 800);
                            } else {
                                // No treasure section exists, create one at the end
                                const treasureSection = `
                                    <p><strong>Treasure:</strong></p>
                                    <ul>
                                        <li class="quest-treasure">${uuidLink}</li>
                                    </ul>
                                `;
                                content += treasureSection;
                                updated = true;
                                ui.notifications.info(`Added ${item.name} as treasure.`);
                                entryEl.classList.add('dropped-success');
                                trackModuleTimeout(() => entryEl.classList.remove('dropped-success'), 800);
                            }
                        } else {
                            ui.notifications.error('Could not resolve item from drop.');
                        }
                    }
                    if (updated) {
                        await page.update({ text: { content } });
                        this.render(this.element);
                    }
                } catch (error) {
                    console.error('Error handling quest entry drop:', error);
                    ui.notifications.error('Failed to add participant or treasure.');
                }
            });
            }); // Close forEach callback
        }

        // Participant portrait right-click to remove (GM only)
        // v13: Use nativeHtml instead of html
        nativeHtml.querySelectorAll('.participant-portrait').forEach(portrait => {
            portrait.addEventListener('contextmenu', async function(event) {
                event.preventDefault();
                if (!game.user.isGM) return;
                
                const participantUuid = event.currentTarget.dataset.uuid;
                const participantName = event.currentTarget.title;
                const questEntry = event.currentTarget.closest('.quest-entry');
                if (!questEntry) return;
                const questUuid = questEntry.dataset.questUuid;
                
                if (!questUuid) {
                    ui.notifications.warn("Could not find the quest entry.");
                    return;
                }
                
                try {
                    // Get the quest page
                    const page = await fromUuid(questUuid);
                    if (!page) {
                        ui.notifications.warn("Could not find the quest page.");
                        return;
                    }
                    
                    // Get current content
                    let content = page.text.content;
                    
                    // Parse the content to find and remove the participant
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(content, 'text/html');
                    
                    // Find the participants paragraph
                    const participantsP = Array.from(doc.querySelectorAll('p')).find(p => {
                        const strong = p.querySelector('strong');
                        if (!strong) return false;
                        const text = strong.textContent.trim();
                        return text === 'Participants' || text === 'Participants:';
                    });
                    
                    if (participantsP) {
                        // Remove the specific participant from the content
                        const participantRegex = new RegExp(`@UUID\\[${participantUuid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\{[^}]+\\}`, 'g');
                        const nameRegex = new RegExp(`\\b${participantName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
                        
                        // Replace the participant with empty string and clean up
                        let newContent = content.replace(participantRegex, '');
                        newContent = newContent.replace(nameRegex, '');
                        
                        // Clean up extra commas and spaces
                        newContent = newContent.replace(/,\s*,/g, ',');
                        newContent = newContent.replace(/,\s*$/g, '');
                        newContent = newContent.replace(/^\s*,/g, '');
                        
                        // If no participants left, remove the entire participants section
                        if (!newContent.includes('@UUID[') && !newContent.match(/Participants:\s*[^,\s]/)) {
                            newContent = newContent.replace(/<p><strong>Participants:<\/strong>\s*[^<]*<\/p>\s*\n?/g, '');
                        }
                        
                        // Update the page
                        await page.update({
                            text: { content: newContent }
                        });
                        
                        ui.notifications.info(`Removed ${participantName} from the quest.`);
                    } else {
                        ui.notifications.warn("Could not find participants section in the quest.");
                    }
                } catch (error) {
                    console.error('Error removing participant:', { participantName, error });
                    ui.notifications.error(`Failed to remove ${participantName} from the quest.`);
                }
            });
        });
    }


    /**
     * Render the quest panel
     * @param {jQuery} element - The element to render into
     */
    async render(element) {
        if (!element) return;
        // v13: Convert jQuery to native DOM if needed
        this.element = getNativeElement(element);

        const questContainer = this.element?.querySelector('[data-panel="panel-quest"]');
        if (!questContainer) return;

        // Always refresh data (safe even if no journal)
        await this._refreshData();

        // Check for pinned quests and show notification
        await this._checkAndNotifyPinnedQuest();

        // Get collapsed states
        const isTagCloudCollapsed = game.user.getFlag(MODULE.ID, 'questTagCloudCollapsed') || false;
        // Get pinned quests
        const pinnedQuests = await game.user.getFlag(MODULE.ID, 'pinnedQuests') || {};
        // Get the current pinned quest (only one allowed)
        const pinnedQuestUuid = Object.values(pinnedQuests).find(uuid => uuid !== null);
        
        // Get active objectives (only one can be active at a time)
        const activeObjectives = await game.user.getFlag(MODULE.ID, 'activeObjectives') || {};
        const activeData = activeObjectives.active;
        
        let activeQuestUuid = null;
        let activeObjectiveIndex = null;
        
        if (activeData && typeof activeData === 'string') {
            const [storedUuid, indexStr] = activeData.split('|');
            activeQuestUuid = storedUuid;
            activeObjectiveIndex = parseInt(indexStr);
        }
        
        // Show or clear the active objective notification
        await this._checkAndNotifyActiveObjective();

        // Prepare template data
        let allTags;
        if (game.user.isGM) {
            // GMs see tags from all quests
            allTags = new Set();
            for (const category of this.categories) {
                for (const entry of this.data[category] || []) {
                    // Add only explicit tags
                    if (entry.tags && Array.isArray(entry.tags)) {
                    entry.tags.forEach(tag => allTags.add(tag));
                    }
                }
            }
        } else {
            // Players see tags only from visible quests
            allTags = new Set();
            for (const category of this.categories) {
                for (const entry of this.data[category] || []) {
                    if (entry.visible !== false) {
                        // Add only explicit tags
                        if (entry.tags && Array.isArray(entry.tags)) {
                        entry.tags.forEach(tag => allTags.add(tag));
                        }
                    }
                }
            }
        }
        const templateData = {
            position: "left",
            hasJournal: !!this.selectedJournal,
            journalName: this.selectedJournal ? this.selectedJournal.name : "",
            isGM: game.user.isGM,
            categories: this.categories,
            statusGroups: {
                inProgress: [],
                notStarted: [],
                completed: [],
                failed: []
            },
            filters: {
                ...this.filters,
                search: this.filters.search || "",
                tags: this.filters.tags || [],
                statusFilter: this.filters.statusFilter || "active",
                hasActiveFilters: !!(this.filters.search || (this.filters.tags || []).length)
            },
            allTags: Array.from(allTags).sort(),
            isTagCloudCollapsed,
            pinnedQuests
        };

        // Process all quests from all categories
        for (const category of this.categories) {
            let entries = this._applyFilters(this.data[category] || []);
            // Process each entry to add status and pinning info
            for (const entry of entries) {
                // Ensure entry is valid
                if (!entry || typeof entry !== 'object') continue;
                
                // Add additional properties needed for the template
                entry.category = category; // Ensure category is included in the entry
                entry.isPinned = entry.uuid === pinnedQuestUuid;

                // Ensure all required properties exist
                entry.tasks = entry.tasks || [];
                entry.reward = entry.reward || { xp: 0, treasure: [] };
                entry.participants = entry.participants || [];
                entry.tags = entry.tags || [];
                entry.timeframe = entry.timeframe || { duration: '' };
                entry.progress = entry.progress || 0;
                entry.category = normalizeQuestCategory(entry.category);
                entry.status = normalizeQuestStatus(entry.status);
                entry.statusLabel = entry.status;

                // Add active objective data to tasks
                if (entry.tasks.length > 0) {
                    for (let index = 0; index < entry.tasks.length; index++) {
                        entry.tasks[index].isActive = (entry.uuid === activeQuestUuid && index === activeObjectiveIndex);
                    }
                }

                // --- UNLOCKED TREASURE LOGIC ---
                if (entry.reward && Array.isArray(entry.reward.treasure)) {
                    // Collect all treasure unlock names from all tasks
                    const allUnlockNames = (Array.isArray(entry.tasks) ? entry.tasks.flatMap(task => Array.isArray(task.treasureUnlocks) ? task.treasureUnlocks : []) : []).map(n => n && n.trim().toLowerCase());
                    entry.reward.treasure.forEach(treasure => {
                        if (!treasure) return;
                        // Get the treasure name or text
                        const treasureName = (treasure.name || treasure.text || '').trim().toLowerCase();
                        // Is this treasure referenced by any objective?
                        treasure.boundToObjective = allUnlockNames.includes(treasureName);
                        // Is this treasure unlocked by any completed task?
                        treasure.unlocked = treasure.boundToObjective && Array.isArray(entry.tasks) && entry.tasks.some(task =>
                            task.completed && Array.isArray(task.treasureUnlocks) &&
                            task.treasureUnlocks.some(unlockName => unlockName && treasureName && unlockName.trim().toLowerCase() === treasureName)
                        );
                    });
                }

                // Add to the appropriate status group
                if (entry.status === "Failed") {
                    templateData.statusGroups.failed.push(entry);
                } else if (entry.status === "Succeeded") {
                    templateData.statusGroups.completed.push(entry);
                } else if (entry.status === "Active") {
                    templateData.statusGroups.inProgress.push(entry);
                } else {
                    // Default to Not Started
                    templateData.statusGroups.notStarted.push(entry);
                }
            }
        }
        
        // Put pinned quests at the top of their respective groups
        for (const groupKey in templateData.statusGroups) {
            const group = templateData.statusGroups[groupKey];
            const pinnedIndex = group.findIndex(e => e.isPinned);
            if (pinnedIndex > 0) {
                const [pinned] = group.splice(pinnedIndex, 1);
                group.unshift(pinned);
            }
        }

        templateData.completeAndFailedCount = templateData.statusGroups.completed.length + templateData.statusGroups.failed.length;

        // Deep clone to break references and ensure only primitives are passed
        const safeTemplateData = JSON.parse(JSON.stringify(templateData));
        const html = await renderTemplate(TEMPLATES.PANEL_QUEST, safeTemplateData);
        // Preserve the scroll position across the re-render. Replacing innerHTML destroys
        // the .quest-content scroll container and recreates it at scrollTop 0, so actions
        // like placing/unplacing a pin or toggling visibility would otherwise jump the GM
        // back to the top and force them to scroll back down to find their place.
        const prevScrollTop = questContainer.querySelector('.quest-content')?.scrollTop ?? 0;
        // v13: Use native DOM innerHTML instead of jQuery html()
        questContainer.innerHTML = html;

        // Activate listeners
        this._activateListeners(questContainer);

        // Apply status filter to show/hide sections
        this._applyStatusFilter(questContainer);

        // After rendering, set initial states
        if (this.filters.search || (this.filters.tags || []).length > 0) {
            const clearSearch = questContainer.querySelector('.clear-search');
            if (clearSearch) clearSearch.classList.remove('disabled');
        }
        if (!isTagCloudCollapsed) {
            const toggleTagsButton = questContainer.querySelector('.toggle-tags-button');
            if (toggleTagsButton) toggleTagsButton.classList.add('active');
        }
        
        // Set initial state of pin visibility toggle for all users (Blacksmith getModuleVisibility)
        // Trigger hook for pin visibility updates
        Hooks.call('renderQuestPanel');
        
        // Auto-expand pinned quests
        if (pinnedQuestUuid) {
            // Make sure the In Progress section is expanded
            const inProgressSection = questContainer.querySelector('.quest-section[data-status="Active"]');
            if (inProgressSection) inProgressSection.classList.remove('collapsed');
            // Expand the pinned quest (v13: :has() selector not supported, manually filter)
            const questEntries = questContainer.querySelectorAll('.quest-entry');
            questEntries.forEach(entry => {
                const hasPinnedPin = entry.querySelector('.quest-pin.pinned');
                if (hasPinnedPin) entry.classList.remove('collapsed');
            });
        }

        // NOTE: quest sections have no per-category collapse. Every section the
        // template renders carries `quest-section--no-titlebar`, and each of the four
        // sites that used to apply `questCollapsedCategories` skipped exactly those --
        // so the feature could never fire. The click handler that wrote the flag was
        // bound to `.quest-category`, which the template does not render either. All
        // of it came across from Squire that way and has never worked here. Removed;
        // the user flag is left in place, inert. See TODO M2.

        // Restore the scroll position captured before the innerHTML swap, now that all
        // collapse/expand states have been reapplied and the content height is final.
        if (prevScrollTop > 0) {
            const scrollContent = questContainer.querySelector('.quest-content');
            if (scrollContent) scrollContent.scrollTop = prevScrollTop;
        }
    }

    /**
     * Merge imported quest data with existing journal content, preserving state
     * @param {string} existingContent - Current journal content
     * @param {Object} importedQuest - Quest data from import
     * @returns {string} Merged content with state preserved
     */
    async _mergeJournalContent(existingContent, importedQuest) {
        // Parse existing content to extract current state
        const existingState = this._extractExistingState(existingContent);
        
        // Generate new content with preserved state
        let content = "";
        
        // Basic quest info (always update these)
        if (importedQuest.img) {
            content += `<img src="${importedQuest.img}" alt="${importedQuest.name}">\n\n`;
        }
        if (importedQuest.category) {
            content += `<p><strong>Category:</strong> ${importedQuest.category}</p>\n\n`;
        }
        if (importedQuest.description) {
            content += `<p><strong>Description:</strong> ${importedQuest.description}</p>\n\n`;
        }
        if (importedQuest.location) {
            content += `<p><strong>Location:</strong> ${importedQuest.location}</p>\n\n`;
        }
        if (importedQuest.plotHook) {
            content += `<p><strong>Plot Hook:</strong> ${importedQuest.plotHook}</p>\n\n`;
        }
        
        // Tasks - PRESERVE EXISTING STATE
        if (importedQuest.tasks && importedQuest.tasks.length) {
            content += `<p><strong>Tasks:</strong></p>\n<ul>\n`;
            importedQuest.tasks.forEach((t, index) => {
                let taskText = typeof t === 'string' ? t : t.text;
                
                // Add GM hint if present (check both field names)
                if (t.gmHint || t.gmnotes) {
                    const hint = t.gmHint || t.gmnotes;
                    taskText += ` ||${hint}||`;
                }
                
                // Add treasure unlocks if present (check both field names and convert format)
                const treasures = t.treasureUnlocks || t.tasktreasure || [];
                if (treasures.length > 0) {
                    treasures.forEach(treasure => {
                        taskText += ` ((${treasure}))`;
                    });
                }
                
                // PRESERVE EXISTING TASK STATE, falling back to what the import supplies.
                // The fallback matters: without it a task with no counterpart on the page
                // — a newly added one — silently landed as `active` however the payload
                // described it. Existing state still wins, because a GM ticking a task off
                // must not be undone by a re-import. Shared with the create path so the
                // two encodings cannot drift. See TODO C7.
                const existingTaskState = existingState.tasks[index];
                taskText = this._wrapTaskState(taskText, existingTaskState?.state ?? t.state);

                content += `<li>${taskText}</li>\n`;
            });
            content += `</ul>\n\n`;
        }
        
        // Rewards
        if (importedQuest.reward) {
            if (importedQuest.reward.xp) content += `<p><strong>XP:</strong> ${importedQuest.reward.xp}</p>\n\n`;
            if (Array.isArray(importedQuest.reward.treasure) && importedQuest.reward.treasure.length > 0) {
                content += `<p><strong>Treasure:</strong></p>\n<ul>\n`;
                // The import decides WHICH treasure; the existing journal keeps the
                // LINK for anything it already had. A uuid the GM dropped in by hand
                // outranks whatever the resolver would pick for the same name.
                const preserved = new Map(
                    existingState.treasure
                        .filter(t => t.uuid && t.name)
                        .map(t => [t.name.toLowerCase(), t.uuid])
                );
                const merged = importedQuest.reward.treasure.map(t => {
                    if (t.uuid || !t.name) return t;
                    const uuid = preserved.get(String(t.name).toLowerCase());
                    return uuid ? { ...t, uuid } : t;
                });
                const { links, report } = await resolveEntries(merged, 'item');
                this._resolveReports?.push(report);
                importedQuest.reward.treasure.forEach((t, index) => {
                    if (links[index]) {
                        content += `<li>${links[index]}</li>\n`;
                    } else if (t.text) {
                        content += `<li>${t.text}</li>\n`;
                    }
                });
                content += `</ul>\n\n`;
            } else if (importedQuest.reward.treasure) {
                content += `<p><strong>Treasure:</strong> ${importedQuest.reward.treasure}</p>\n\n`;
            }
        }
        
        // Timeframe
        if (importedQuest.timeframe && importedQuest.timeframe.duration) {
            content += `<p><strong>Duration:</strong> ${importedQuest.timeframe.duration}</p>\n\n`;
        }
        
        // Status - PRESERVE EXISTING STATUS
        //
        // Normalized, and defaulting to a value the reader actually produces. This wrote
        // the raw literal `Not Started`, which `normalizeQuestStatus` maps to `Available`
        // — so a value this writer emitted was one our own reader immediately renamed,
        // and the create path a few hundred lines below normalized while this one did
        // not. Two writers, two different markup outputs for the same quest, decided by
        // whether the page already existed.
        const statusToUse = normalizeQuestStatus(existingState.status || importedQuest.status || 'Available');
        content += `<p><strong>Status:</strong> ${statusToUse}</p>\n\n`;
        // The reader parses Progress and neither writer emitted it. See TODO C7.
        const progressToUse = Number(existingState.progress ?? importedQuest.progress ?? 0);
        if (progressToUse > 0) {
            content += `<p><strong>Progress:</strong> ${progressToUse}%</p>\n\n`;
        }
        
        // Participants - PRESERVE EXISTING PARTICIPANTS
        const participantsToUse = existingState.participants.length > 0 ? existingState.participants : importedQuest.participants;
        
        // Auto-add party members if setting is enabled
        if (game.settings.get(MODULE.ID, 'autoAddPartyMembers')) {
            const partyActors = getPartyActors();
            for (const actor of partyActors) {
                // `isSameParticipant`, not a raw compare: participants are stored as
                // enriched link strings, so `p === actor.name` was always false and
                // every party member was re-added on every import. See TODO C6.
                const alreadyPresent = participantsToUse.some(p => isSameParticipant(p, actor));
                if (!alreadyPresent) {
                    participantsToUse.push({
                        uuid: actor.uuid,
                        name: actor.name,
                        img: actor.img || actor.thumbnail || 'icons/svg/mystery-man.svg'
                    });
                }
            }
        }
        
        if (participantsToUse && participantsToUse.length) {
            const normalized = participantsToUse.map(p => (typeof p === 'string' ? { name: p } : p));
            const { links, report } = await resolveEntries(normalized, 'actor');
            this._resolveReports?.push(report);
            const participantList = links.filter(p => p).join(', ');
            content += `<p><strong>Participants:</strong> ${participantList}</p>\n\n`;
        }
        
        // Tags
        if (importedQuest.tags && importedQuest.tags.length) {
            content += `<p><strong>Tags:</strong> ${importedQuest.tags.join(', ')}</p>\n\n`;
        }
        
        return content;
    }

    /**
     * Extract existing state from journal content
     * @param {string} content - Journal content
     * @returns {Object} Extracted state information
     */
    _extractExistingState(content) {
        // `status` and `progress` start EMPTY, not at a default.
        //
        // `status` used to default to the literal `'Not Started'`, which is truthy — so
        // `existingState.status || importedQuest.status` always took the existing branch
        // and **a re-import could never change a quest's status**, even on a page that
        // had none to preserve. An absent value has to be falsy for a preserve-then-fall-
        // back chain to work at all. This is the blank-versus-absent shape again, in a
        // third place: a default is indistinguishable from a real reading.
        const state = {
            tasks: [],
            status: '',
            progress: null,
            participants: [],
            treasure: []
        };

        try {
            // Extract treasure links. A link the GM dropped in by hand is not
            // recoverable from the import JSON, so it has to survive re-import.
            const treasureMatch = content.match(/<strong>Treasure:<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/);
            if (treasureMatch) {
                const treasureDoc = new DOMParser().parseFromString(`<ul>${treasureMatch[1]}</ul>`, 'text/html');
                treasureDoc.querySelectorAll('li').forEach(li => {
                    // Stored content is raw, so @UUID[...] is the common case;
                    // <a data-uuid> shows up if enriched HTML was ever saved back.
                    const inline = li.innerHTML.match(/@UUID\[([^\]]+)\]\{([^}]+)\}/);
                    if (inline) {
                        state.treasure.push({ uuid: inline[1], name: inline[2].trim() });
                        return;
                    }
                    const anchor = li.querySelector('a[data-uuid]');
                    if (anchor) {
                        state.treasure.push({
                            uuid: anchor.getAttribute('data-uuid'),
                            name: anchor.textContent.trim()
                        });
                    }
                });
            }

            // Extract task states
            const tasksMatch = content.match(/<strong>Tasks:<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/);
            if (tasksMatch) {
                const tasksHtml = tasksMatch[1];
                const parser = new DOMParser();
                const ulDoc = parser.parseFromString(`<ul>${tasksHtml}</ul>`, 'text/html');
                const ul = ulDoc.querySelector('ul');
                if (ul) {
                    const liList = Array.from(ul.children);
                    liList.forEach(li => {
                        let taskState = 'active';
                        if (li.querySelector('s')) {
                            taskState = 'completed';
                        } else if (li.querySelector('code')) {
                            taskState = 'failed';
                        } else if (li.querySelector('em')) {
                            taskState = 'hidden';
                        }
                        
                        // Extract task text (remove state tags)
                        let taskText = li.innerHTML;
                        taskText = taskText.replace(/<\/?[sema]>/g, ''); // Remove state tags
                        taskText = taskText.replace(/\|\|[^|]*\|\|/g, ''); // Remove GM hints
                        taskText = taskText.replace(/\[\[[^\]]*\]\]/g, ''); // Remove treasure unlocks
                        taskText = taskText.trim();
                        
                        state.tasks.push({
                            text: taskText,
                            state: taskState
                        });
                    });
                }
            }
            
            // Extract status
            const statusMatch = content.match(/<strong>Status:<\/strong>\s*([^<]*)/);
            if (statusMatch) {
                state.status = statusMatch[1].trim();
            }

            // Extract progress, so a re-import preserves it rather than resetting to 0.
            const progressMatch = content.match(/<strong>Progress:<\/strong>\s*([0-9]+)\s*%?/);
            if (progressMatch) {
                state.progress = Number(progressMatch[1]);
            }
            
            // Extract participants
            const participantsMatch = content.match(/<strong>Participants:<\/strong>\s*([^<]*)/);
            if (participantsMatch) {
                const participantsText = participantsMatch[1].trim();
                if (participantsText) {
                    // Parse participant references
                    const participantRefs = participantsText.match(/@UUID\[([^\]]+)\]\{([^}]+)\}/g);
                    if (participantRefs) {
                        participantRefs.forEach(ref => {
                            const uuidMatch = ref.match(/@UUID\[([^\]]+)\]\{([^}]+)\}/);
                            if (uuidMatch) {
                                state.participants.push({
                                    uuid: uuidMatch[1],
                                    name: uuidMatch[2]
                                });
                            }
                        });
                    } else {
                        // Simple comma-separated names
                        const names = participantsText.split(',').map(n => n.trim()).filter(n => n);
                        names.forEach(name => {
                            state.participants.push({ name });
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Error extracting existing state:', error);
        }
        
        return state;
    }

    /**
     * Generate journal content from imported quest object (for new quests only)
     */
    /**
     * Wrap task text in the tag the parser decodes state from.
     *
     * The reader (`utility-quest-parser.js`) detects `<s>` as completed, `<code>` as
     * failed and `<em>` as hidden, defaulting to active. Both writers emitted a bare
     * `<li>` for every task, so **the writer could not express what the reader could
     * read**, and every task round-tripped back to `active`. That was TODO C7, measured
     * across all 30 production quests before it was fixed.
     *
     * Markup-as-storage, and A1 deletes the whole encoding. Until then the two halves
     * have to agree, or an import cannot set task state at all.
     *
     * @param {string} text
     * @param {string} state active | completed | failed | hidden
     */
    _wrapTaskState(text, state) {
        switch (state) {
            case 'completed': return `<s>${text}</s>`;
            case 'failed':    return `<code>${text}</code>`;
            case 'hidden':    return `<em>${text}</em>`;
            default:          return text;
        }
    }

    async _generateJournalContentFromImport(quest) {
        let content = "";
        if (quest.img) {
            content += `<img src="${quest.img}" alt="${quest.name}">\n\n`;
        }
        if (quest.category) {
            content += `<p><strong>Category:</strong> ${quest.category}</p>\n\n`;
        }
        // `!== undefined`, not truthiness. A blank description used to be skipped
        // exactly as an absent one was, and the reader then attributed the FOLLOWING
        // fields to Description — `description: ""` parsed back as
        // "Category: Side Quest\n\nParticipants: …". Writing the empty field keeps
        // blank and absent distinguishable, which is the whole of TODO H13.
        if (quest.description !== undefined && quest.description !== null) {
            content += `<p><strong>Description:</strong> ${quest.description}</p>\n\n`;
        }
        if (quest.location) {
            content += `<p><strong>Location:</strong> ${quest.location}</p>\n\n`;
        }
        if (quest.plotHook) {
            content += `<p><strong>Plot Hook:</strong> ${quest.plotHook}</p>\n\n`;
        }
        if (quest.tasks && quest.tasks.length) {
            content += `<p><strong>Tasks:</strong></p>\n<ul>\n`;
            quest.tasks.forEach(t => {
                let taskText = typeof t === 'string' ? t : t.text;
                
                // Add GM hint if present (check both field names)
                if (t.gmHint || t.gmnotes) {
                    const hint = t.gmHint || t.gmnotes;
                    taskText += ` ||${hint}||`;
                }
                
                // Add treasure unlocks if present (check both field names and convert format)
                const treasures = t.treasureUnlocks || t.tasktreasure || [];
                if (treasures.length > 0) {
                    treasures.forEach(treasure => {
                        taskText += ` ((${treasure}))`;
                    });
                }
                
                content += `<li>${this._wrapTaskState(taskText, t.state)}</li>\n`;
            });
            content += `</ul>\n\n`;
        }
        if (quest.reward) {
            if (quest.reward.xp) content += `<p><strong>XP:</strong> ${quest.reward.xp}</p>\n\n`;
            if (Array.isArray(quest.reward.treasure) && quest.reward.treasure.length > 0) {
                content += `<p><strong>Treasure:</strong></p>\n<ul>\n`;
                const { links, report } = await resolveEntries(quest.reward.treasure, 'item');
                this._resolveReports?.push(report);
                quest.reward.treasure.forEach((t, index) => {
                    if (links[index]) {
                        content += `<li>${links[index]}</li>\n`;
                    } else if (t.text) {
                        content += `<li>${t.text}</li>\n`;
                    }
                });
                content += `</ul>\n\n`;
            } else if (quest.reward.treasure) {
                content += `<p><strong>Treasure:</strong> ${quest.reward.treasure}</p>\n\n`;
            }
        }
        if (quest.timeframe && quest.timeframe.duration) {
            content += `<p><strong>Duration:</strong> ${quest.timeframe.duration}</p>\n\n`;
        }
        if (quest.status) {
            content += `<p><strong>Status:</strong> ${normalizeQuestStatus(quest.status)}</p>\n\n`;
        }
        // The reader parses a Progress field and the writer never emitted one, so every
        // round trip reset progress to 0. See TODO C7.
        if (Number(quest.progress) > 0) {
            content += `<p><strong>Progress:</strong> ${Number(quest.progress)}%</p>\n\n`;
        }

        // --- AUTO ADD PARTY MEMBERS (JSON Import Only) ---
        const autoAddParty = game.settings.get(MODULE.ID, 'autoAddPartyMembers');
        if (autoAddParty) {
            // Ensure participants is an array
            if (!quest.participants) quest.participants = [];
            if (!Array.isArray(quest.participants)) quest.participants = [quest.participants];
            
            // Get all party members (actors of type 'character' with a player owner)
            const partyActors = getPartyActors();
            for (const actor of partyActors) {
                // Only add if not already present by uuid or name
                // Same fix as the merge path above — see TODO C6.
                const alreadyPresent = quest.participants.some(p => isSameParticipant(p, actor));
                if (!alreadyPresent) {
                    quest.participants.push({
                        uuid: actor.uuid,
                        name: actor.name,
                        img: actor.img || actor.thumbnail || 'icons/svg/mystery-man.svg'
                    });
                }
            }
        }
        
        if (quest.participants && quest.participants.length) {
            const normalized = quest.participants.map(p => (typeof p === 'string' ? { name: p } : p));
            const { links, report } = await resolveEntries(normalized, 'actor');
            this._resolveReports?.push(report);
            const participantList = links.filter(p => p).join(', ');
            content += `<p><strong>Participants:</strong> ${participantList}</p>\n\n`;
        }
        if (quest.tags && quest.tags.length) {
            content += `<p><strong>Tags:</strong> ${quest.tags.join(', ')}</p>\n\n`;
        }
        return content;
    }

    /**
     * Export scene pins data for all scenes that have quest pins
     * @returns {Object} Object containing scene pin data
     */
    /**
     * Export quest and objective pin PLACEMENTS, read through the Pins API.
     *
     * **This used to read `scene.getFlag(MODULE.ID, 'questPins')`, which nothing has
     * written since pins moved to Blacksmith's Pins API** — the only writer left was
     * `_importScenePins` itself. So the export emitted `{}` in any world whose pins
     * were placed after that migration, the summary reported `Scenes with Pins: 0`,
     * and the file looked complete. That was TODO **C4**, the same silent-partial
     * failure class as the codex export (**M11**).
     *
     * **Only identity and placement travel.** Design, ownership, icon, visibility and
     * objective text are all re-derived from the live quest page by `createQuestPin` /
     * `createObjectivePin` at import, so carrying them here would mean two sources for
     * the same values and a stale copy winning. This is the "stable core" the
     * `testing/fixture-import-quest-envelope.json` fixture documents:
     * `questUuid`, `questIndex`, `questCategory`, `objectiveIndex`, `x`, `y`.
     *
     * @returns {Promise<{scenePins: object, gathered: number, total: number, unplaced: number}>}
     * @private
     */
    async _exportScenePins() {
        const empty = { scenePins: {}, gathered: 0, total: 0, unplaced: 0 };
        const pins = getPinsApi();
        if (!isPinsApiAvailable(pins)) {
            console.warn(`${MODULE.TITLE} | Pins API unavailable; no pins exported.`);
            return empty;
        }

        try {
            const all = listAllQuestPins(pins);
            const scenePins = {};
            let gathered = 0;
            let unplaced = 0;

            for (const pin of all) {
                // An unplaced pin has no scene and no coordinates. It is real state,
                // but it is not a placement and there is nothing to restore it onto —
                // counted so the totals reconcile rather than silently discarded.
                const hasPlacement = pin.sceneId
                    && Number.isFinite(pin.x)
                    && Number.isFinite(pin.y);
                if (!hasPlacement) { unplaced++; continue; }

                const scene = game.scenes.get(pin.sceneId);
                if (!scene) { unplaced++; continue; }

                const config = pin.config ?? {};
                const record = {
                    questUuid: config.questUuid,
                    questIndex: config.questIndex,
                    questCategory: config.questCategory ?? 'Side Quest',
                    x: pin.x,
                    y: pin.y
                };
                // Objective pins carry an index; quest-level pins must not, because
                // the import matches on `questUuid` + `objectiveIndex` and an
                // undefined index is what distinguishes the quest-level pin.
                if (Number.isInteger(config.objectiveIndex)) {
                    record.objectiveIndex = config.objectiveIndex;
                }

                scenePins[scene.id] ??= {
                    sceneName: scene.name,
                    sceneId: scene.id,
                    questPins: []
                };
                scenePins[scene.id].questPins.push(record);
                gathered++;
            }

            return { scenePins, gathered, total: all.length, unplaced };
        } catch (error) {
            console.error(`${MODULE.TITLE} | Error exporting scene pins:`, error);
            // Rethrow: a caught-and-ignored failure here is exactly how the previous
            // version wrote a file that looked complete. The caller refuses instead.
            throw error;
        }
    }

    /**
     * Restore pin placements through the Pins API.
     *
     * **This used to write `scene.setFlag(MODULE.ID, 'questPins', …)`**, a flag the
     * Pins API never reads — so imported pins were stored somewhere nothing renders
     * from and never appeared on the canvas. Both halves of C4 were broken, not just
     * the export.
     *
     * Scenes are matched **by name**, not id, because ids differ between worlds and
     * moving quests between worlds is the case this feature exists for.
     *
     * @param {object} scenePins - Scene pin data from an export envelope
     * @private
     */
    async _importScenePins(scenePins) {
        const pins = getPinsApi();
        if (!isPinsApiAvailable(pins)) {
            ui.notifications.warn('Pins API unavailable; scene pins were not imported.');
            return;
        }

        const entries = Object.values(scenePins ?? {});
        if (!entries.length) {
            ui.notifications.info('No scene pins to import.');
            return;
        }

        let created = 0, skippedExisting = 0, skippedScenes = 0;
        const orphaned = [];

        try {
            for (const sceneData of entries) {
                const scene = game.scenes.find(s => s.name === sceneData?.sceneName);
                if (!scene) { skippedScenes++; continue; }

                // Read the live pins for this scene ONCE, then track what we add, so a
                // payload containing the same pin twice does not create it twice.
                const live = listAllQuestPins(pins, { sceneId: scene.id });
                const seen = new Set(live.map(p => `${p.config?.questUuid}|${p.config?.objectiveIndex ?? 'quest'}`));

                for (const record of sceneData.questPins ?? []) {
                    if (!record?.questUuid
                        || !Number.isFinite(record.x)
                        || !Number.isFinite(record.y)) continue;

                    const isObjective = Number.isInteger(record.objectiveIndex);
                    const key = `${record.questUuid}|${isObjective ? record.objectiveIndex : 'quest'}`;
                    if (seen.has(key)) { skippedExisting++; continue; }

                    // The quest must exist before its pin can. A pin naming a quest
                    // that failed to import, or one absent from the payload entirely,
                    // is reported rather than logged — it is a hole in the restore.
                    const page = await fromUuid(record.questUuid);
                    if (!page) { orphaned.push(record.questUuid); continue; }

                    const common = {
                        questUuid: record.questUuid,
                        questIndex: record.questIndex,
                        questCategory: record.questCategory ?? 'Side Quest',
                        x: record.x,
                        y: record.y,
                        sceneId: scene.id
                    };
                    // Ownership, design, icon and objective text are derived from the
                    // live page inside these — deliberately not carried in the export.
                    const pin = isObjective
                        ? await createObjectivePin({ ...common, objectiveIndex: record.objectiveIndex })
                        : await createQuestPin(common);

                    if (pin) { created++; seen.add(key); }
                    else orphaned.push(record.questUuid);
                }
            }

            if (created > 0) {
                ui.notifications.info(`Scene pins imported: ${created} placed.`);
                await reloadAllQuestPins();
            }
            if (skippedExisting > 0) {
                ui.notifications.info(`${skippedExisting} pins already existed and were left as they are.`);
            }
            if (skippedScenes > 0) {
                ui.notifications.warn(`${skippedScenes} scenes from the import were not found in this world and were skipped.`);
            }
            if (orphaned.length > 0) {
                const unique = [...new Set(orphaned)];
                console.warn(`${MODULE.TITLE} | Pins referencing quests that do not exist:`, unique);
                ui.notifications.warn(
                    `${orphaned.length} ${orphaned.length === 1 ? 'pin' : 'pins'} could not be placed because the quest does not exist. See the console for which.`
                );
            }
            if (!created && !skippedExisting && !skippedScenes && !orphaned.length) {
                ui.notifications.info('No scene pins to import.');
            }
        } catch (error) {
            console.error(`${MODULE.TITLE} | Error importing scene pins:`, error);
            ui.notifications.error('Error importing scene pins. Check console for details.');
        }
    }

    /**
     * Show the global progress bar for quest imports
     * @private
     */
    _showProgressBar() {
        // v13: Use native DOM instead of jQuery
        const nativeElement = getNativeElement(this.element);
        const progressArea = nativeElement?.querySelector('.tray-progress-bar-wrapper');
        const progressFill = nativeElement?.querySelector('.tray-progress-bar-inner');
        const progressText = nativeElement?.querySelector('.tray-progress-bar-text');
        
        if (progressArea && progressFill && progressText) {
            progressArea.style.display = '';
            progressFill.style.width = '0%';
            progressText.textContent = 'Starting quest import...';
        }
    }

    /**
     * Update the global progress bar
     * @private
     */
    _updateProgressBar(percent, text) {
        // v13: Use native DOM instead of jQuery
        const nativeElement = getNativeElement(this.element);
        const progressFill = nativeElement?.querySelector('.tray-progress-bar-inner');
        const progressText = nativeElement?.querySelector('.tray-progress-bar-text');
        
        if (progressFill && progressText) {
            progressFill.style.width = `${percent}%`;
            progressText.textContent = text;
        }
    }

    /**
     * Hide the global progress bar
     * @private
     */
    _hideProgressBar() {
        // v13: Use native DOM instead of jQuery
        const nativeElement = getNativeElement(this.element);
        const progressArea = nativeElement?.querySelector('.tray-progress-bar-wrapper');
        if (progressArea) {
            progressArea.style.display = 'none';
        }
    }
} 
