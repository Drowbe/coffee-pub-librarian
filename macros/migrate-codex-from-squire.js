/**
 * One-time migration: hand codex data over from Squire to Librarian.
 *
 * Paste into a Script Macro and run as GM, with BOTH modules enabled.
 *
 * This is a different animal from the quest migration. Quest pages were plain
 * `text` pages, so that migration only copied flags and re-stamped pins — it
 * changed nothing that could not simply be run again. Codex pages carry a
 * declared document subtype (`coffee-pub-squire.codex`) with a data model behind
 * it, so this one rewrites `type` on live documents. Three consequences shape
 * everything below:
 *
 *   1. **Page ids must survive.** Codex pins reference their page by
 *      `codexUuid`, so the type is updated IN PLACE. Never delete and recreate:
 *      a new page means a new id, a new uuid, and every pin orphaned.
 *
 *   2. **`type` and `system` are written together, and `system` is FORCE-REPLACED.**
 *      Changing a document's subtype re-initialises `system` against the new
 *      model, so a subtype change alone would leave every entry's summary,
 *      category, links and tags at the new model's defaults. Foundry will not
 *      even let you try: it rejects a type change unless `system` is written
 *      with the `==` force-replace prefix (or `{recursive: false}`). Hence
 *      `'==system'` below — a plain `system` key throws.
 *
 *   3. **It is reversible.** Before touching anything, each page's original
 *      `type` and `system` are stashed in a flag. `REVERT = true` puts them
 *      back. The quest migration did not need this; this one does, because a
 *      bad type change is not something you can fix by re-running.
 *
 * ORDER MATTERS, and it is not the order quests used:
 *
 *   a. Librarian ships declaring the subtype (it does, in module.json).
 *   b. Run this with BOTH modules enabled.
 *   c. THEN verify with Squire disabled.
 *   d. THEN Squire drops its declaration in a later release.
 *
 * Verifying with Squire disabled *before* migrating tells you nothing: pages
 * still typed `coffee-pub-squire.codex` fail validation when nothing declares
 * that subtype, so the codex would appear broken for a reason unrelated to
 * whether Librarian works.
 *
 * DRY_RUN is on by default. Read the report, then set it to false and re-run.
 *
 * NOTE: this is per-world. A world that has not run it still has codex pages
 * addressed to Squire, and must run it BEFORE that world updates Squire past
 * the release that drops the subtype.
 */

const DRY_RUN = true;
const REVERT = false;

const SQUIRE = 'coffee-pub-squire';
const LIBRARIAN = 'coffee-pub-librarian';
const SQUIRE_TYPE = `${SQUIRE}.codex`;
const LIBRARIAN_TYPE = `${LIBRARIAN}.codex`;
const BACKUP_FLAG = 'squireMigrationBackup';

if (!game.user.isGM) {
    ui.notifications.error('This migration must be run by a GM.');
} else {
    const report = {
        mode: REVERT ? 'revert' : 'migrate',
        settings: [],
        userFlags: [],
        typed: 0,
        alreadyTyped: 0,
        flagGroups: 0,
        pins: 0,
        reverted: 0,
        skipped: [],
        failed: []
    };

    // --- Preconditions -------------------------------------------------------
    // Both modules must be active. With Squire off, its pages are unvalidated
    // and `page.system` may not be the model instance this reads from.
    const squireOn = game.modules.get(SQUIRE)?.active;
    const librarianOn = game.modules.get(LIBRARIAN)?.active;
    if (!librarianOn) {
        report.skipped.push('Librarian is not active — it must be, to declare the target subtype.');
    }
    if (!squireOn && !REVERT) {
        report.skipped.push('Squire is not active. Migrating with it off is possible but unverified: its pages are not validated, so system data may read back empty. Enable Squire and re-run.');
    }

    // The target subtype must actually be REGISTERED WITH FOUNDRY, which is a
    // different thing from Librarian declaring it in module.json. Manifests are
    // read when the Foundry server loads modules; a browser refresh re-runs the
    // client against cached manifest data, so a freshly added `documentTypes`
    // entry is invisible until the world is re-entered from Setup.
    //
    // Checked up front because the failure mode is otherwise 342 identical
    // validation errors, one per page, with the real cause named nowhere.
    const registered = game.documentTypes?.JournalEntryPage ?? [];
    const targetKnown = registered.includes(REVERT ? SQUIRE_TYPE : LIBRARIAN_TYPE);
    if (!targetKnown) {
        report.skipped.push(
            `Foundry does not recognise "${REVERT ? SQUIRE_TYPE : LIBRARIAN_TYPE}" as a JournalEntryPage subtype. `
            + `Registered subtypes: ${registered.join(', ') || '(none)'}. `
            + `A browser refresh is not enough — return to Setup and re-enter the world so Foundry re-reads the module manifests, then run this again.`
        );
    }

    const canProceed = librarianOn && (squireOn || REVERT) && targetKnown;

    // --- 1. Settings ---------------------------------------------------------
    if (canProceed && !REVERT) {
        try {
            const value = game.settings.get(SQUIRE, 'codexJournal');
            if (value && value !== 'none') {
                report.settings.push(`codexJournal = ${JSON.stringify(value)}`);
                if (!DRY_RUN) await game.settings.set(LIBRARIAN, 'codexJournal', value);
            } else {
                report.skipped.push('setting codexJournal: unset in Squire');
            }
        } catch (error) {
            report.skipped.push(`setting codexJournal: ${error.message}`);
        }
    }

    // --- 2. Per-user flags ---------------------------------------------------
    // Client-side view state: which categories the user had collapsed and
    // whether the tag cloud was folded away. Cosmetic, but it lives on the User
    // document rather than on any page, so a page-and-pin sweep never sees it.
    if (canProceed && !REVERT) {
        for (const key of ['codexCollapsedCategories', 'codexTagCloudCollapsed']) {
            const value = game.user.getFlag(SQUIRE, key);
            if (value === undefined) continue;
            report.userFlags.push(key);
            if (!DRY_RUN) await game.user.setFlag(LIBRARIAN, key, foundry.utils.deepClone(value));
        }
    }

    // --- Locate the codex pages ---------------------------------------------
    // Scoped to the configured journal rather than every journal in the world,
    // but falling back to a world-wide sweep by type, because the subtype is the
    // real identity here and a page moved to another journal is still a codex
    // page that would be orphaned.
    const pages = [];
    const wanted = REVERT ? LIBRARIAN_TYPE : SQUIRE_TYPE;
    for (const journal of game.journal ?? []) {
        for (const page of journal.pages ?? []) {
            if (page?.type === wanted) pages.push(page);
            else if (!REVERT && page?.type === LIBRARIAN_TYPE) report.alreadyTyped++;
        }
    }

    if (canProceed) {
        for (const page of pages) {
            try {
                if (REVERT) {
                    // --- Undo ----------------------------------------------------
                    const backup = page.getFlag(LIBRARIAN, BACKUP_FLAG);
                    if (!backup?.type) {
                        report.skipped.push(`revert ${page.name}: no backup flag`);
                        continue;
                    }
                    report.reverted++;
                    if (!DRY_RUN) {
                        await page.update({ type: backup.type, '==system': backup.system ?? {} });
                        await page.unsetFlag(LIBRARIAN, BACKUP_FLAG);
                    }
                    continue;
                }

                // --- Read the current system data BEFORE changing type --------
                // toObject() gives plain data rather than the live model, which
                // is what update() wants and what survives the type swap.
                const system = page.system?.toObject
                    ? page.system.toObject()
                    : foundry.utils.deepClone(page.system ?? {});

                // --- Stash for reversibility, in its own update ----------------
                // Separate and first on purpose: if the type change below fails,
                // the backup still exists and REVERT can still put things right.
                if (!DRY_RUN) {
                    await page.setFlag(LIBRARIAN, BACKUP_FLAG, {
                        type: page.type,
                        system: foundry.utils.deepClone(system)
                    });
                }

                // --- Copy Squire's flags across --------------------------------
                const flags = page.flags?.[SQUIRE];
                if (flags && Object.keys(flags).length) {
                    report.flagGroups += Object.keys(flags).length;
                    if (!DRY_RUN) {
                        await page.update({ [`flags.${LIBRARIAN}`]: foundry.utils.deepClone(flags) });
                    }
                }

                // --- The type change itself ------------------------------------
                report.typed++;
                if (!DRY_RUN) {
                    // `==system` force-replaces rather than merges. Foundry REFUSES a
                    // type change with a merged system — 'The type of a Document can be
                    // changed only if the system field is force-replaced (==) or updated
                    // with {recursive: false}' — precisely so a subtype swap cannot
                    // half-apply and leave fields at the new model's defaults.
                    await page.update({ type: LIBRARIAN_TYPE, '==system': system });

                    // Verify rather than assume: a silently-defaulted system is
                    // the failure this whole macro is shaped around, and it does
                    // not throw.
                    const after = page.system?.toObject ? page.system.toObject() : page.system;
                    const lostSummary = !!system.summary && !after?.summary;
                    const lostCategory = !!system.category && !after?.category;
                    const lostLinks = (system.links?.length ?? 0) > 0 && (after?.links?.length ?? 0) === 0;
                    if (lostSummary || lostCategory || lostLinks) {
                        report.failed.push(`${page.name}: system data did not survive the type change — REVERT and stop`);
                    }
                }
            } catch (error) {
                report.failed.push(`${page.name}: ${error.message}`);
            }
        }
    }

    // --- Pins ----------------------------------------------------------------
    // A pin's moduleId is what every list query filters on, so this is the step
    // that makes existing codex pins visible to Librarian.
    if (canProceed && !REVERT) {
        const pins = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
        if (!pins?.list) {
            report.skipped.push('pins: Blacksmith pins API unavailable');
        } else {
            // includeHiddenByFilter is essential, not defensive: a pin hidden by
            // a layer filter is omitted from a default listing, and those are
            // exactly the pins most likely to exist unnoticed.
            const collect = (options) => {
                try {
                    return pins.list({ ...options, moduleId: SQUIRE, includeHiddenByFilter: true }) || [];
                } catch (error) {
                    report.skipped.push(`pins ${JSON.stringify(options)}: ${error.message}`);
                    return [];
                }
            };

            const candidates = [];
            for (const scene of game.scenes) {
                for (const pin of collect({ sceneId: scene.id })) candidates.push([pin, scene.name]);
            }
            // Unplaced pins live in a world setting, not on a scene, so a
            // per-scene sweep never sees them — and they carry a moduleId too.
            for (const pin of collect({ unplacedOnly: true })) candidates.push([pin, '(unplaced)']);

            const seen = new Set();
            for (const [pin, where] of candidates) {
                // Matched on codexUuid rather than type: the type strings are
                // shared between the two modules, and codexUuid is what actually
                // identifies a pin as codex content.
                if (!pin?.config?.codexUuid || seen.has(pin.id)) continue;
                seen.add(pin.id);
                report.pins++;
                if (!DRY_RUN) {
                    try {
                        await pins.update(pin.id, { moduleId: LIBRARIAN });
                    } catch (error) {
                        report.failed.push(`pin ${pin.id} on ${where}: ${error.message}`);
                    }
                }
            }
        }
    }

    // --- Report --------------------------------------------------------------
    const title = REVERT
        ? (DRY_RUN ? 'Codex migration — REVERT dry run' : 'Codex migration — REVERTED')
        : (DRY_RUN ? 'Codex migration — DRY RUN' : 'Codex migration — applied');

    const lines = [`<h3>${title}</h3>`];
    if (REVERT) {
        lines.push(`<p><strong>Pages restored to Squire's subtype:</strong> ${report.reverted}</p>`);
    } else {
        lines.push(`<p><strong>Settings:</strong> ${report.settings.length ? report.settings.join('<br>') : 'none'}</p>`);
        lines.push(`<p><strong>Pages retyped:</strong> ${report.typed}${report.alreadyTyped ? ` (${report.alreadyTyped} already Librarian's)` : ''}</p>`);
        lines.push(`<p><strong>Page flag keys copied:</strong> ${report.flagGroups}</p>`);
        lines.push(`<p><strong>User flags:</strong> ${report.userFlags.length ? report.userFlags.join(', ') : 'none'}</p>`);
        lines.push(`<p><strong>Pins re-stamped:</strong> ${report.pins}</p>`);
    }
    if (report.skipped.length) {
        lines.push(`<p><strong>Skipped:</strong><br>${report.skipped.join('<br>')}</p>`);
    }
    if (report.failed.length) {
        lines.push(`<p style="color:#c00"><strong>FAILED — read these:</strong><br>${report.failed.join('<br>')}</p>`);
    }
    if (DRY_RUN) {
        lines.push('<p><em>Nothing was changed. Set DRY_RUN to false and re-run to apply.</em></p>');
    } else if (!REVERT) {
        lines.push('<p><em>Each page keeps its original type and system data in a backup flag. Set REVERT to true and re-run to undo.</em></p>');
    }

    ChatMessage.create({
        content: lines.join(''),
        whisper: [game.user.id],
        speaker: { alias: 'Librarian Migration' }
    });
    console.log('Librarian | Codex migration report', report);
}
