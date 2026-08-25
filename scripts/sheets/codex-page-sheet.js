import { MODULE } from '../const.js';
import { renderTemplate, getTextEditor, escapeHtml } from '../helpers.js';
import { codexLinkKey, normalizeCodexLink } from '../utility-resolver.js';
import { buildCodexPageIndex, renderCodexRef } from '../utility-codex-index.js';
import { getCodexTags, setCodexTags } from '../utility-tags.js';

// The CONCRETE text page sheet. (JournalEntryPageTextSheet is abstract and defines
// NO parts — extending it renders neither the view content nor the lore editor.)
const JournalEntryPageProseMirrorSheet = foundry.applications.sheets.journal.JournalEntryPageProseMirrorSheet;

/**
 * Sheet for codex journal pages (type "coffee-pub-librarian.codex").
 *
 * Extends the standard ProseMirror text page sheet so the page's native
 * text.content — the Expanded Details — keeps stock editing and view rendering.
 *
 * - EDIT mode: a codex field part is inserted between the standard header
 *   (title controls) and the ProseMirror content editor.
 * - VIEW mode: the core view content part is `root: true`, so sibling parts are
 *   not an option; instead the rendered field block is prepended to the enriched
 *   content in _prepareContentContext.
 */
export class CodexPageSheet extends JournalEntryPageProseMirrorSheet {
    static DEFAULT_OPTIONS = {
        classes: ['librarian-codex-page']
    };

    static EDIT_PARTS = {
        header: JournalEntryPageProseMirrorSheet.EDIT_PARTS.header,
        codexFields: {
            template: `modules/${MODULE.ID}/templates/page-codex-fields-edit.hbs`
        },
        content: JournalEntryPageProseMirrorSheet.EDIT_PARTS.content,
        footer: JournalEntryPageProseMirrorSheet.EDIT_PARTS.footer
    };

    /** @inheritDoc */
    async _preparePartContext(partId, context, options) {
        context = await super._preparePartContext(partId, context, options);
        if (partId === 'codexFields') {
            context.document = this.document;
            context.system = this.document.system;
            // One read, two shapes: `tagsString` for the edit form's <string-tags>,
            // `tagList` for the view template's chips.
            const tags = getCodexTags(this.document.uuid);
            context.tagsString = tags.join(', ');
            context.tagList = tags;
            context.relatedString = (this.document.system.related || []).join(', ');
            context.linkChips = this.document.system.linkList;
        }
        return context;
    }

    /** @inheritDoc */
    _onRender(context, options) {
        super._onRender?.(context, options);

        // Edit mode: the links zone accepts document drops and chip removal,
        // writing system.links directly (the document update re-renders the sheet)
        const zone = this.element?.querySelector('.codex-page-links-edit');
        if (!zone || zone.dataset.linksBound) return;
        zone.dataset.linksBound = 'true';

        // Preserve name/type: they are what let the auto-link scan retry an
        // unresolved link later. Rebuilding the array without them destroys that.
        const currentLinks = () => Array.from(this.document.system.links || []).map(normalizeCodexLink);

        zone.addEventListener('click', async (event) => {
            const removeBtn = event.target.closest('.codex-link-chip-remove');
            if (!removeBtn) return;
            event.preventDefault();
            const key = removeBtn.closest('.codex-link-chip')?.dataset?.key;
            if (!key) return;
            await this.document.update({
                'system.links': currentLinks().filter(l => codexLinkKey(l) !== key)
            });
        });

        zone.addEventListener('dragover', (event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'link';
            zone.classList.add('drag-active');
        });
        zone.addEventListener('dragleave', () => zone.classList.remove('drag-active'));
        zone.addEventListener('drop', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            zone.classList.remove('drag-active');
            try {
                const TextEditor = getTextEditor();
                const data = TextEditor?.getDragEventData?.(event)
                    || JSON.parse(event.dataTransfer.getData('text/plain'));
                const doc = data?.uuid ? await fromUuid(data.uuid) : null;
                if (!doc) return;
                const links = currentLinks();
                if (links.some(l => l.uuid === doc.uuid)) return;
                links.push({
                    uuid: doc.uuid,
                    label: doc.name || doc.uuid,
                    name: doc.name || '',
                    type: String(doc.documentName || '').toLowerCase()
                });
                await this.document.update({ 'system.links': links });
                ui.notifications.info(`Linked: ${doc.name}`);
            } catch (error) {
                console.error('Coffee Pub Librarian | Error linking dropped document:', error);
            }
        });
    }

    /** @inheritDoc */
    async _prepareContentContext(context, options) {
        await super._prepareContentContext(context, options);

        // View mode: prepend the styled codex field block above the enriched lore
        if (this.isView) {
            const system = this.document.system;

            const linksHtml = [];
            for (const link of system.linkList) {
                // Unresolved links have no uuid — render the plain name rather than
                // an empty @UUID[]{} enricher. The auto-link scan can fill it in later.
                if (!link.resolved) {
                    linksHtml.push(`<span class="codex-link-unresolved">${escapeHtml(link.label)}</span>`);
                    continue;
                }
                try {
                    const TextEditor = getTextEditor();
                    linksHtml.push(await TextEditor.enrichHTML(`@UUID[${link.uuid}]{${link.label}}`, { async: true }));
                } catch (_) {
                    linksHtml.push(link.label);
                }
            }

            // Related entries resolve against the pages of this page's own journal,
            // through the same index and the same markup the browser card uses — so a
            // name renders identically in both places and the two cannot drift.
            // Unresolved names render as plain text, which is correct rather than an
            // error: the entry may simply not exist yet.
            const pageIndex = buildCodexPageIndex(this.document.parent);
            const relatedHtml = (system.related || [])
                .map(name => renderCodexRef(name, pageIndex))
                .filter(Boolean);

            const fieldsHtml = await renderTemplate(
                `modules/${MODULE.ID}/templates/page-codex-fields-view.hbs`,
                {
                    document: this.document,
                    system,
                    isGM: game.user.isGM,
                    discoveredByString: (system.discoveredBy || []).join(', '),
                    // View mode does NOT pass through _preparePartContext -- the core
                    // view content part is `root: true`, so this block is rendered here
                    // and prepended instead (see the class header). Anything the view
                    // template needs has to be supplied HERE as well as there.
                    tagList: getCodexTags(this.document.uuid),
                    linksHtml,
                    relatedHtml
                }
            );

            context.text.enriched = fieldsHtml + (context.text.enriched || '');
        }
    }

    /** @inheritDoc */
    _prepareSubmitData(event, form, formData, updateData) {
        const data = super._prepareSubmitData(event, form, formData, updateData);

        // `<string-tags>` submits a comma-separated string in some Foundry builds and
        // an array in others, so both are normalized the same way rather than
        // trusting one shape.
        const normalize = (raw) => {
            if (typeof raw === 'string') return raw.split(',').map(t => t.trim()).filter(Boolean);
            if (Array.isArray(raw)) return raw.map(t => String(t).trim()).filter(Boolean);
            return null;
        };

        const related = normalize(foundry.utils.getProperty(data, 'system.related'));
        if (related) foundry.utils.setProperty(data, 'system.related', related);

        // Tags do NOT go onto the document. They belong to Blacksmith's central store,
        // so the field is removed from the update and written separately -- leaving it
        // in would re-populate `system.tags` and recreate the second source of truth
        // the migration just removed.
        //
        // Fire-and-forget with a caught rejection: `_prepareSubmitData` is synchronous
        // by contract, so this cannot be awaited. The store write is independent of the
        // document write, so a failure here leaves the document correct and the tags
        // unchanged rather than half-applied.
        const tags = normalize(foundry.utils.getProperty(data, 'system.tags'));
        if (tags) {
            delete data.system?.tags;
            setCodexTags(this.document.uuid, tags).catch(error =>
                console.error('Coffee Pub Librarian | Failed to save codex tags:', error));
        }

        return data;
    }
}
