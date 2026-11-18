# Change

How to think about a design's resilience: making likely changes cheap without paying for unlikely ones. Assumes the vocabulary in [SKILL.md](SKILL.md): **module**, **interface**, **seam**, **adapter**, **locality**, **essential complexity**, **accidental complexity**.

## Where complexity lives

Essential complexity can't be designed away. Pricing rules are as complicated as the business makes them; a sync protocol has to handle the conflicts that really happen. What design decides is *where* that complexity lives. A resilient design gives each kind of essential complexity one home, behind an interface much simpler than what it hides. When the rules change, and they will, the change happens in that home.

Accidental complexity is whatever the design adds on top. It's usually easy to recognise once you look for it:

- modules that fail the deletion test: they forward calls and add nothing;
- seams with a single adapter and no test adapter: indirection waiting for a second case that hasn't come;
- interfaces wider than their callers need, so every caller learns things it doesn't use;
- layers that exist because a diagram had them, not because anything varies there;
- names that describe a hoped-for future ("generic", "pluggable", "engine") rather than what the module does today;
- configuration for options no one sets.

A useful question about any piece of structure: is this here because of the problem, or because of the solution?

## Change scenarios

The most productive part of an architecture conversation is often just listing concrete changes that could plausibly happen, together with the user, and then asking where each one would land. Kinds of change worth thinking through:

- **A second instance of something that exists once**: a second payment provider, another tenant type, a new client platform.
- **A new capability** that touches existing data: reporting, audit, undo, export.
- **A policy change**: pricing, permissions, retention, regional rules.
- **A change of scale**: ten times the data, the users, or the throughput.
- **A change underneath**: a different datastore, a hosted service replaced by an in-house one, or the reverse.

For each, two rough judgements: how likely is it in a horizon the user cares about, and how painful would it be if the design weren't ready for it.

Then trace it. Take "we add a second payment provider". If payment is a deep module with an interface at its seam and two adapters already behind it (production and test), the change is one new adapter and nothing else moves. If the first provider's types leaked into orders, invoices, and refunds, the same change ripples across every one of those modules. Same requirement, very different cost, decided long before the requirement showed up.

The change test doesn't say "build a seam for every scenario". It says where the design is brittle, so the brittleness can be a decision rather than a surprise. Often the right answer for a plausible but unproven change is:

> Keep the code direct, with no new seam yet. But make sure everything that would change together lives together, in one module.

Locality doesn't need a seam to exist yet. If all knowledge of the payment provider sits in one module, cutting a seam there later is a small, contained job. If that knowledge is scattered, no seam added later will gather it back up cheaply. **Keep together now what would change together; cut the seam when the second adapter actually shows up.**

## Committing early, deferring on purpose

Some structure is cheap to commit to early and pays off whatever the product turns into, because it makes no guess about the product:

- which way dependencies point;
- where I/O and each cross-cutting concern enter: one seam each;
- where outside data is parsed into typed values;
- a small set of conventions that keep the code uniform enough to imitate safely.

Other structure is a bet on what the product will become, and is usually better deferred until there's evidence:

- seams for variation nobody has seen yet;
- splitting into separately deployed parts;
- generic frameworks extracted before a second real use;
- domain hierarchies and taxonomies built from a single example;
- plugin or extension systems with no plugins.

Removing a wrong abstraction usually costs more than adding the right one late, because by then callers have grown around it. So when unsure, prefer the design that is easier to change over the one that anticipates more; duplicating a little while the right shape is still unclear is cheaper than committing to the wrong shape early.

Between these, weigh two things: how costly it is to be wrong, and how hard it is to undo. Reversible decisions can be made quickly and revisited. Decisions that are hard to undo (data that's been persisted in a shape, interfaces that other teams or customers depend on, how the system is split for deployment) deserve the slow, careful version of the conversation.

When a decision is deferred, say so explicitly and name the signal that would reopen it: "when a second provider is on the roadmap", "when one module's tests take minutes to run", "when two teams keep editing the same module".

## From MVP to growth

An MVP should be small, direct, and deep: few modules, little ceremony, the early commitments above held firmly, and plain code everywhere else. Its features may be thrown away. Its patterns usually aren't, because everything built afterwards copies them. So getting those few commitments right in the MVP matters more than how complete its features are.

As scope widens, second examples arrive, and that's when hypothetical seams become real ones. Signals that it's time to restructure:

- the same kind of change keeps rippling across several modules;
- a module's interface grows with every feature: it's becoming shallow;
- the same bug gets fixed in several callers: locality has been lost;
- modules fail the deletion test, because the structure outgrew the logic or never had any;
- people (or agents) keep asking where something should go, and getting different answers.
