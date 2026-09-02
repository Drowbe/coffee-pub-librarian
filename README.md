# Coffee Pub Librarian

![Latest Release](https://img.shields.io/github/v/release/Drowbe/coffee-pub-librarian)
![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/Drowbe/coffee-pub-librarian/release.yml)
![GitHub all releases](https://img.shields.io/github/downloads/Drowbe/coffee-pub-librarian/total)
![MIT License](https://img.shields.io/badge/license-MIT-blue)
![Foundry v13](https://img.shields.io/badge/foundry-v13-green)

Keep your campaign's people, places and factions somewhere you can actually find them, and
track the quests that run through them.

Librarian gives a campaign two things: a **codex** of everything in your world, and
**quests** tracked by objective and pinned to the map. Write your notes wherever you
already write them and import them; look anything up mid-session without leaving the
canvas; reveal an entry to your players the moment they earn it.

## What it does

- **A searchable codex** of characters, locations, factions and artifacts, grouped by
  category and filtered by tag.
- **Import from your own notes.** Entries come in as JSON, so whatever you write in --
  Obsidian, a text file, an AI assistant -- can become a codex without retyping it.
- **Entries link to each other by name**, so a reference to a place you have not written
  yet becomes a link the moment you write it.
- **Reveal on your schedule.** Every entry starts hidden. Players see what you have shown
  them and nothing else, and a GM-only plot hook stays yours.
- **Quests with objectives**, tracked by status, with hints and treasure attached to
  individual steps.
- **Canvas pins** for quests and objectives, so the map shows where things are. Double-click
  a pin to open the quest.
- **Entries are real documents.** A codex entry is its own Foundry page subtype with its own
  data model and sheet, not text formatted inside a journal.

## Requirements

- **Foundry VTT v13.**
- **D&D 5e** game system.
- **[Coffee Pub Blacksmith](https://github.com/Drowbe/coffee-pub-blacksmith) 13.20.0 or
  later** -- required. Librarian uses its window framework, canvas pins, tags, compendium
  resolver, party roster, menubar and dialogs, and will not start without it.

## Install

**Manifest URL** -- paste this into Foundry:

```
https://github.com/Drowbe/coffee-pub-librarian/releases/latest/download/module.json
```

1. Inside Foundry VTT, select the **Game Modules** tab in the Configuration and Setup menu.
2. Click **Install Module** and paste the manifest URL above.
3. Click **Install** and wait for installation to complete.

Prefer to install by hand? Download
[coffee-pub-librarian.zip](https://github.com/Drowbe/coffee-pub-librarian/releases/latest/download/coffee-pub-librarian.zip)
and unpack it into your Foundry `Data/modules/` directory, so that `module.json` sits at
`Data/modules/coffee-pub-librarian/module.json`.

## Read more

- [Getting started](https://github.com/Drowbe/coffee-pub-librarian/wiki/userguide-getting-started)
  -- what appears on screen and the first things to do.
- [Codex architecture](https://github.com/Drowbe/coffee-pub-librarian/wiki/architecture-codex)
  and [Quest architecture](https://github.com/Drowbe/coffee-pub-librarian/wiki/architecture-quests)
  -- how it is built, for anyone changing it.
- [Known issues](https://github.com/Drowbe/coffee-pub-librarian/wiki/known-issues).

## Why not Squire

Squire runs a character: the token you have selected, its items, its spells, its health.
Codex and quests describe the world instead -- they do not care which token is selected,
and they were the larger half of a module named for the smaller one.

The dividing line the suite settled on: **owning a document subtype means owning a
domain.** Codex declares one. That is what makes this a module rather than a panel.

<!-- global:ai-assistance -->
## AI Assistance and the Illusion of Good Code

I started writing Foundry modules for use at my own table back in 2020. There were already a ton of amazing modules out there, but they either didn't quite do what I wanted or didn't deliver the kind of user experience I was looking for.

I've been a design leader for more than 20 years, but I spent the first half of my career as a developer, so building my own modules seemed like a fun way to kill some time. I'm a pretty good designer. I'm a decent developer. But, over time, my hand-written code and hacks got a little messy (and memory-leaky, and a little buggy. Feels good to say it out loud.).

Today, the Coffee Pub suite of modules is developed with AI assistance, primarily Claude and Cursor, for documentation, refactoring, debugging, and other development work. Every change is reviewed and committed by me, and nothing reaches a release that I haven't crawled and run at my own table. I can't seem to give up my IDE. The UX design, architecture, and ideas still come from my own fever dreams and chronic lack of sleep.

Testing and verifying a change means running it in Foundry so I can watch the console, break things, fix them, and hone the experience. The repositories carry a set of tools for testing the things that are difficult to catch through review and manual testing alone. They help ensure styles don't conflict, shared coding and documentation standards stay consistent, and the suite of modules continues to work well as a system without silently breaking.

Those checks are there because AI-assisted development can move very quickly, and without oversight, engagement, and planning, it can also go confidently off the rails and deliver the illusion of good code. The AI helps me build faster. It doesn't decide what gets built, its architecture, or how it should work. You can blame this human for that.

If the idea of AI-assisted development keeps you up at night or just isn't your jam, no worries at all. I get it. You do you.
<!-- /global:ai-assistance -->

## Coffee Pub Module Suite

Descriptions taken from each module's own manifest.

- **[Blacksmith](https://github.com/Drowbe/coffee-pub-blacksmith)** -- quality of life, gameplay frameworks, automation and aesthetic improvements. The hub every other module builds on.
- **[Artificer](https://github.com/Drowbe/coffee-pub-artificer)** -- a crafting, recipe and blueprint system.
- **[Bibliosoph](https://github.com/Drowbe/coffee-pub-bibliosoph)** -- in-game player messaging with journal-backed conversations, plus injuries, quick encounter building, inspiration and critical hit announcements.
- **[Cartographer](https://github.com/Drowbe/coffee-pub-cartographer)** -- party strategic planning and sketching.
- **[Crier](https://github.com/Drowbe/coffee-pub-crier)** -- combat turn announcements with customisable turn cards, round announcements and combat status tracking.
- **[Curator](https://github.com/Drowbe/coffee-pub-curator)** -- image management: token replacement, portrait replacement, and tile and map image placement.
- **[Herald](https://github.com/Drowbe/coffee-pub-herald)** -- a streaming and broadcast view, with a designated cameraman user for a clean UI-free picture.
- **[Merchant](https://github.com/Drowbe/coffee-pub-merchant)** -- shops and merchants: mark an actor as a merchant and let players browse and buy from their stock.
- **[Minstrel](https://github.com/Drowbe/coffee-pub-minstrel)** -- a music, environment and one-shot manager.
- **[Monarch](https://github.com/Drowbe/coffee-pub-monarch)** -- save and load sets of enabled modules.
- **[Regent](https://github.com/Drowbe/coffee-pub-regent)** -- optional AI tools: Consult the Regent, and worksheets for lookup, characters, assistance, encounters and narrative.
- **[Scribe](https://github.com/Drowbe/coffee-pub-scribe)** -- enhanced journal and chat card formatting for sharing snippets of narrative.
- **[Squire](https://github.com/Drowbe/coffee-pub-squire)** -- a character tray for the selected token: abilities, items, spells and conditions, with party tools.
- **[Vault](https://github.com/Drowbe/coffee-pub-vault)** -- optional assets for the Coffee Pub suite.

## Licence

MIT. See [LICENSE](LICENSE).
