# Testing

## `preflight.py`

Run from the module root, before every commit:

```
python testing/preflight.py
```

Seven checks, each of which exists because something got past a reviewer once:

1. **Every script parses as a module.** `node --check` parses as CommonJS, which
   accepts things ESM rejects — it once passed a genuine `SyntaxError` that broke the
   world at load. Each file is copied to `.mjs` and checked there instead.
2. **Manifest-declared paths exist.**
3. **Static and dynamic import targets resolve.**
4. **Each named binding is actually exported by its target.**
5. **CSS `@import` targets exist.** A stylesheet missing from the `default.css` chain
   is silently unstyled.
6. **Module-absolute asset paths referenced from scripts or templates exist.**
7. **Every Handlebars helper a template calls has a registered provider**, reading
   Blacksmith's set from its source rather than assuming it.

Check 7 is the newest and the most easily under-estimated. **Handlebars fails at
render time, not at load**, so a helper used on one screen can go missing while every
other screen still looks perfect. That is exactly what happened: an audit trimmed
Librarian's helper registrations, matched only `{{helper`, and missed
`{{#if (isArray x)}}` — the sole form `isArray` appears in. Both editor windows would
have thrown `Missing helper` on open, and the browsers, which were what got tested,
were fine. Subexpressions are counted for that reason, and the check looks only
inside `{{ }}` so prose like "(GM only)" is not reported.

`preflight.py` cannot open Foundry. It catches wiring, not behaviour.

## `fixture-link-resolution.json`

A codex import fixture for testing name→document resolution, with **deliberate
controls in both directions**. Import it into a scratch journal, not a real codex.

Name resolution silently did nothing for years in Squire and nobody noticed, because
"it linked" alone cannot distinguish a working resolver from an indiscriminate one.
A fixture that only contains names that *should* resolve proves nothing — you need
names that must NOT resolve, and must fail in specific, different ways.

Before importing, rename **FIXTURE Known Good Actor** to the exact name of an Actor
that exists in your world or in a mapped compendium. The four cases then assert:

| Case | Asserts |
|---|---|
| A — Known Good Actor | A self-link to a real document resolves |
| B — Guaranteed Miss Zzzqx | A self-link miss is **speculative** and stays out of the GM's "did not resolve" count |
| C — Asserted Miss | An explicit link miss **is** counted, is retained with `name`/`type`, and renders as plain text |
| D — Related Resolves | `related` links to an entry that exists and keeps one that does not, on all three surfaces |

Case B is the one people get wrong. Most Locations and Factions legitimately have no
document sharing their name, so counting those misses would drown the real signal —
that is why the resolver separates speculative from asserted, and why a fixture needs
both.

Case C's retention is what makes **Auto-Link Unresolved Links** possible: the name
survives on the page so it can be retried once the document exists.

**Caveat that is not a bug.** Resolution needs the GM's Blacksmith Compendium Mapping
to include the *world* for the type. PCs and NPCs live in the world, so an Actor
mapping with world search off resolves nothing and looks like a Librarian failure.
Nothing in Librarian can detect this — check the mapping before concluding the
resolver is broken.
