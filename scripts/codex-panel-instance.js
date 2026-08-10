import { CodexPanel } from './panel-codex.js';

/**
 * The module's single CodexPanel.
 *
 * Same reasoning as the quest panel: in Squire this hung off
 * `PanelManager.instance`, because the tray owned every panel and rebuilt them
 * when the selected token changed. Librarian has no tray and no selected token
 * — the codex is the same codex whoever is selected — so one lazily-created
 * instance is the entire lifecycle.
 *
 * It matters that this is a *single* instance: a panel holds one AbortController
 * and aborts it on every render, so two hosts rendering the same instance kill
 * each other's listeners. That bug shipped in Squire 13.6.0.
 */
let codexPanel = null;

export function getCodexPanel() {
    if (!codexPanel) codexPanel = new CodexPanel();
    return codexPanel;
}

export function destroyCodexPanel() {
    codexPanel?.destroy?.();
    codexPanel = null;
}
