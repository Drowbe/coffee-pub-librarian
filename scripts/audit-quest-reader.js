// ==================================================================
// ===== AUDIT-QUEST-READER – round-trip fidelity, H12 ==============
// ==================================================================
// Reads nothing but production data and writes nothing at all.
//
// WHY THIS EXISTS. Blacksmith's rule, arrived at while sequencing
// Artificer's recipe migration:
//
//   A conversion inherits every defect of the reader that feeds it.
//   Converting untyped pages to a declared subtype means reading them
//   with the existing reader and writing the result into the new
//   schema. Any bug in that reader stops being a bug and becomes DATA
//   at the moment of conversion -- permanently, because the source it
//   was derived from is gone and no later reader fix can reach it.
//
// So the quest reader has to be audited before A1 converts anything,
// not merely before a profile is declared.
//
// WHY IT ROUND-TRIPS INSTEAD OF ASSERTING. Reading the parser is not
// the audit. Every defect this suite has found in a year was readable
// in source the whole time and surfaced only when something exercised
// it. A round trip needs no expectations written in advance: it asks
// whether the reader and the writer agree, and any disagreement is a
// defect in one of them regardless of which.
//
// TWO TRIPS, because they fail differently:
//
//   A. page -> parse -> write -> parse
//      Reader/writer fidelity over real world content. A field that
//      does not survive is one that will not survive conversion.
//
//   B. import JSON -> write -> parse
//      The import path. This is where a value the writer invents and
//      the reader renames shows up -- the known `Not Started` /
//      `Available` disagreement lives here and NOT in trip A, because
//      trip A starts from an already-normalized value.
//
// Delete this file when A1 has converted and the parser is gone.
// ==================================================================

import { MODULE } from './const.js';
import { QuestParser, normalizeQuestStatus, normalizeQuestCategory } from './utility-quest-parser.js';
import { getQuestPanel } from './quest-panel-instance.js';

/** Fields worth comparing. `uuid` and `name` come from the page, not the markup. */
const SCALARS = ['category', 'originalCategory', 'description', 'plotHook', 'status', 'progress', 'img'];

function questPages() {
    const journalId = game.settings.get(MODULE.ID, 'questJournal');
    if (!journalId || journalId === 'none') return { journal: null, pages: [] };
    const journal = game.journal.get(journalId);
    return { journal, pages: journal ? journal.pages.contents : [] };
}

async function readContent(page) {
    const raw = page.text?.content;
    return typeof raw === 'string' ? raw : (raw ? await raw : '');
}

/** Compare two parsed entries, returning a list of human-readable differences. */
function diffEntries(a, b) {
    const out = [];
    for (const key of SCALARS) {
        if ((a[key] ?? '') !== (b[key] ?? '')) out.push(`${key}: "${a[key]}" -> "${b[key]}"`);
    }
    if ((a.timeframe?.duration ?? '') !== (b.timeframe?.duration ?? '')) {
        out.push(`timeframe.duration: "${a.timeframe?.duration}" -> "${b.timeframe?.duration}"`);
    }
    if ((a.reward?.xp ?? 0) !== (b.reward?.xp ?? 0)) {
        out.push(`reward.xp: ${a.reward?.xp} -> ${b.reward?.xp}`);
    }
    const names = (list) => (list ?? []).map(x => (typeof x === 'string' ? x : x?.name ?? '')).join('|');
    for (const key of ['tags', 'participants']) {
        if (names(a[key]) !== names(b[key])) out.push(`${key}: [${names(a[key])}] -> [${names(b[key])}]`);
    }
    if (names(a.reward?.treasure) !== names(b.reward?.treasure)) {
        out.push(`reward.treasure: [${names(a.reward?.treasure)}] -> [${names(b.reward?.treasure)}]`);
    }
    if ((a.tasks?.length ?? 0) !== (b.tasks?.length ?? 0)) {
        out.push(`tasks: ${a.tasks?.length} -> ${b.tasks?.length}`);
    } else {
        (a.tasks ?? []).forEach((task, i) => {
            const other = b.tasks[i] ?? {};
            if ((task.text ?? '') !== (other.text ?? '')) out.push(`tasks[${i}].text: "${task.text}" -> "${other.text}"`);
            if ((task.state ?? '') !== (other.state ?? '')) out.push(`tasks[${i}].state: "${task.state}" -> "${other.state}"`);
            const hint = (t) => (t.gmHint ?? '');
            if (hint(task) !== hint(other)) out.push(`tasks[${i}].gmHint: "${hint(task)}" -> "${hint(other)}"`);
            const treas = (t) => (t.treasureUnlocks ?? []).join('|');
            if (treas(task) !== treas(other)) out.push(`tasks[${i}].treasure: [${treas(task)}] -> [${treas(other)}]`);
        });
    }
    return out;
}

/**
 * Trip A — page -> parse -> write -> parse, over every quest page in the world.
 *
 * @param {object} panel a QuestPanel instance, for its content writer
 */
export async function roundTripPages(panel) {
    const { journal, pages } = questPages();
    if (!journal) {
        ui.notifications.error('No quest journal configured.');
        return [];
    }
    if (typeof panel?._generateJournalContentFromImport !== 'function') {
        ui.notifications.error('Pass the quest panel: api.auditQuestReader.run().');
        return [];
    }

    const findings = [];
    for (const page of pages) {
        try {
            const html = await readContent(page);
            const first = await QuestParser.parseSinglePage(page, html);
            // Called on the real panel, not a stub `{}`. The first version passed an
            // empty object to avoid accumulating resolve reports -- harmless while the
            // writer only touched `this._resolveReports?`, and broken the moment it
            // gained a `this._wrapTaskState` helper. Optional chaining already handles
            // the reports; a stub was never buying anything.
            const rewritten = await panel._generateJournalContentFromImport.call(panel, first);
            const second = await QuestParser.parseSinglePage(page, rewritten);
            const differences = diffEntries(first, second);
            if (differences.length) findings.push({ page: page.name, differences });
        } catch (error) {
            findings.push({ page: page.name, differences: [`THREW: ${error?.message ?? error}`] });
        }
    }
    return findings;
}

/**
 * Trip B — import JSON -> write -> parse, over synthetic payloads.
 *
 * Deliberately includes blank-versus-absent pairs for every optional field. Testing a
 * parsed value cannot tell you whether the thing was there; presence has to be tracked
 * separately at read time or the two collapse and one silently takes the other's
 * behaviour. That is the shared cause behind our own `expandedDetails` rule,
 * Blacksmith's `absentMeans`, and Artificer's apparatus label -- three independent
 * instances, so assume this reader has one too.
 */
export async function roundTripImports(panel) {
    const cases = [
        { label: 'minimal (everything absent)', quest: { name: 'AUDIT Minimal' } },
        { label: 'status absent', quest: { name: 'AUDIT NoStatus', category: 'Side Quest', description: 'x' } },
        { label: 'status blank', quest: { name: 'AUDIT BlankStatus', status: '', description: 'x' } },
        { label: 'status Not Started', quest: { name: 'AUDIT NotStarted', status: 'Not Started', description: 'x' } },
        { label: 'status Complete (legacy live value)', quest: { name: 'AUDIT Complete', status: 'Complete', description: 'x' } },
        { label: 'category absent', quest: { name: 'AUDIT NoCategory', description: 'x' } },
        { label: 'category unknown', quest: { name: 'AUDIT OddCategory', category: 'Epic Quest', description: 'x' } },
        { label: 'description blank', quest: { name: 'AUDIT BlankDesc', description: '', category: 'Side Quest' } },
        { label: 'task with GM hint', quest: { name: 'AUDIT Hint', tasks: [{ text: 'Find it ||ask the barman|| now', state: 'active' }] } },
        { label: 'task with treasure', quest: { name: 'AUDIT Treasure', tasks: [{ text: 'Open it ((Gem Ring))', state: 'active' }] } },
        { label: 'task with both', quest: { name: 'AUDIT Both', tasks: [{ text: 'Do ||hint|| and ((Loot))', state: 'completed' }] } },
        { label: 'task text containing pipes', quest: { name: 'AUDIT Pipes', tasks: [{ text: 'A || B || C', state: 'active' }] } },
        { label: 'task text containing parens', quest: { name: 'AUDIT Parens', tasks: [{ text: 'Ask (politely) twice', state: 'active' }] } },
        { label: 'unterminated hint marker', quest: { name: 'AUDIT BadHint', tasks: [{ text: 'Find it ||never closed', state: 'active' }] } },
        { label: 'every task state', quest: { name: 'AUDIT States', tasks: ['active', 'completed', 'failed', 'hidden'].map(s => ({ text: `task ${s}`, state: s })) } },
        { label: 'xp zero', quest: { name: 'AUDIT ZeroXP', reward: { xp: 0, treasure: [] } } },
        { label: 'duration blank', quest: { name: 'AUDIT BlankDuration', timeframe: { duration: '' } } },
        { label: 'html in description', quest: { name: 'AUDIT Html', description: 'Meet <em>Gruff</em> & co. <b>early</b>' } },
        { label: 'strong in description', quest: { name: 'AUDIT Strong', description: 'The <strong>Status:</strong> is a lie' } }
    ];

    const findings = [];
    for (const { label, quest } of cases) {
        try {
            const html = await panel._generateJournalContentFromImport.call(panel, quest);
            const parsed = await QuestParser.parseSinglePage({ name: quest.name, uuid: 'audit' }, html);
            const notes = [];

            // Status: what the author supplied, versus what a reader gets back.
            const supplied = quest.status;
            const expected = supplied === undefined ? undefined : normalizeQuestStatus(supplied);
            if (supplied !== undefined && parsed.status !== expected) {
                notes.push(`status: supplied "${supplied}", read back "${parsed.status}", normalizes to "${expected}"`);
            }
            if (supplied === undefined && parsed.status !== 'Available') {
                notes.push(`status: none supplied, read back "${parsed.status}" -- the writer invented a value`);
            }
            if (quest.category !== undefined && parsed.category !== normalizeQuestCategory(quest.category)) {
                notes.push(`category: supplied "${quest.category}", read back "${parsed.category}"`);
            }
            if (quest.description !== undefined && (parsed.description ?? '') !== quest.description) {
                notes.push(`description: supplied "${quest.description}", read back "${parsed.description}"`);
            }
            (quest.tasks ?? []).forEach((task, i) => {
                const back = parsed.tasks?.[i];
                if (!back) { notes.push(`tasks[${i}] vanished`); return; }
                if (back.state !== task.state) notes.push(`tasks[${i}].state: "${task.state}" -> "${back.state}"`);
            });
            if ((quest.tasks?.length ?? 0) !== (parsed.tasks?.length ?? 0)) {
                notes.push(`task count: ${quest.tasks?.length ?? 0} -> ${parsed.tasks?.length ?? 0}`);
            }

            findings.push({ case: label, issues: notes.length ? notes : null, parsed });
        } catch (error) {
            findings.push({ case: label, issues: [`THREW: ${error?.message ?? error}`], parsed: null });
        }
    }
    return findings;
}

/** Run both trips and report. Writes nothing. */
export async function run(panel = getQuestPanel()) {
    console.log(`${MODULE.TITLE} | H12 quest reader audit — nothing is written`);

    const pageFindings = await roundTripPages(panel);
    console.log(`--- Trip A: production pages, parse -> write -> parse ---`);
    if (!pageFindings.length) console.log('No differences. Every field survived the round trip.');
    else {
        console.warn(`${pageFindings.length} pages did not round-trip cleanly:`);
        for (const f of pageFindings) console.warn(f.page, f.differences);
    }

    const importFindings = await roundTripImports(panel);
    const failed = importFindings.filter(f => f.issues);
    console.log(`--- Trip B: import payloads, write -> parse ---`);
    if (!failed.length) console.log('No issues across the synthetic cases.');
    else {
        console.warn(`${failed.length} of ${importFindings.length} cases have issues:`);
        for (const f of failed) console.warn(f.case, f.issues);
    }
    console.log('Full trip B detail:', importFindings);

    ui.notifications.info(
        `Reader audit: ${pageFindings.length} pages differ, ${failed.length}/${importFindings.length} import cases have issues. See the console.`
    );
    return { pageFindings, importFindings };
}
