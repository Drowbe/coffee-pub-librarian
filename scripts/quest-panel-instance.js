import { QuestPanel } from './panel-quest.js';

/**
 * The module's single QuestPanel.
 *
 * In Squire this came off `PanelManager.instance`, because the tray owned every
 * panel and rebuilt them whenever the selected token changed. Librarian has no
 * tray and no selected token: the quest list is the same list regardless of who
 * is selected, so one lazily-created instance is the whole lifecycle.
 */
let questPanel = null;

export function getQuestPanel() {
    if (!questPanel) questPanel = new QuestPanel();
    return questPanel;
}

export function destroyQuestPanel() {
    questPanel?.destroy?.();
    questPanel = null;
}
