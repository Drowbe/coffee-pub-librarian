# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Module scaffold: manifest, entry point, constants, and the Blacksmith readiness contract.
- **Quests, moved from Coffee Pub Squire.** The quest browser, the single-quest editor, the parser, and quest/objective canvas pins, with a menubar launcher. Quest pages are ordinary journal pages — no document subtype — so nothing about existing quests needs migrating to be read here.
  - The quest panel keeps its own window rather than a tray tab. Squire's `PanelManager` owned the panel because the tray rebuilt it whenever the selected token changed; the quest list is the same list regardless of selection, so one lazily-created instance is the whole lifecycle.
  - **Only the quest slice of Squire's pin manager came across** — 741 lines of the 2,325, covering quest and objective pins and the shared API plumbing they need. The codex half follows codex; the note half is Blacksmith's. It was deliberately not ported wholesale: Blacksmith is designing a general annotation model in which a pin is one view of a relationship, and most of a wrapper like this stops existing under it.
  - Quest and objective pin types, their taxonomy, and the canvas double-click that reveals a quest in the browser are registered on ready. Squire did this inside one initialiser covering quests, objectives, notes and codex entries; only the quest half belongs here.
  - `macros/migrate-quests-from-squire.js` hands existing data over: quest settings, page flags, per-user quest state, and the `moduleId` on every quest and objective pin — which is what makes pins placed under Squire visible here. It copies rather than moves, so it is safe to re-run and changes nothing about Squire.
  - Helpers were taken as a subset rather than copied for symmetry — sixteen functions quests actually call, not the whole of Squire's helpers file.
