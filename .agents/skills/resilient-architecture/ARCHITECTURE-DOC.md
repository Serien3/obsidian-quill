# Writing docs/architecture.md

How to turn an architecture discussed with the user into the project's `docs/architecture.md`, and how to keep that document true. Assumes the vocabulary in [SKILL.md](SKILL.md).

## Invariants

When a design is written down, it is stated as invariants. An **invariant** is a fact that must stay true no matter how the code changes. If it ever turns false, something is broken, not merely untidy. Two kinds:

- **On an interface**: a promise callers can rely on without checking. "This call is safe to retry." "What it returns is plain data, with no handle back into the module's internals."
- **Between modules**: which modules may depend on, or know about, which. "Nothing in the domain logic imports the HTTP framework." "Only the payment module talks to the payment provider."

Architecture is stated as invariants: facts the code must keep, not instructions for how to write it. _Avoid_: guideline, best practice (those name preferences that can be bent; an invariant can't be).

The document records what the discussion decided; writing it doesn't decide anything new. If the discussion settled on a method ("use the repository pattern"), the property it protects may still be unstated. Name that property and confirm it with the user rather than inventing it while writing.

- **Say what's absent.** Many of the most important invariants are about what is deliberately *not* there: pricing never reads the system clock; nothing outside persistence knows a table name. Code shows what exists, never what is forbidden, so a reader pattern-matching on nearby code (an agent above all) cannot infer these. They have to be stated.
- **Few invariants, held firmly.** A handful that are always true beats a long list that is mostly true. When everything is an invariant, nothing is.

### Architecture, not specification

An architecture invariant constrains the shape of the code: what a module exposes and hides, how it fails, what it may depend on or know about, where data and effects cross a seam. It never states what the product computes. "An order's total equals the sum of its line items", "a refund can't exceed the amount charged", "the scheduler finds the shortest route": these are requirements, business rules, or algorithm specs. They belong to the analysis of the problem and live in its own specs and tests, not here. The document says *where* such rules live (billing is home of pricing and proration), never what they are.

A quick test: could a change in product requirements make the statement false without anyone touching the design? Then it isn't architecture.

### Property, not method

An invariant says what must be true and leaves open how it becomes true. A quick test: could two very different implementations both satisfy it? If only one could, it's a method in disguise, and it belongs behind the seam.

| Method (behind the seam) | Property (at the seam) |
|---|---|
| "Model order status with a state-machine library" | An order's status only changes through transitions defined in one module. |
| "Inject the payment gateway through the constructor" | Order logic can be exercised with a substitute payment adapter. |
| "Use the repository pattern" | Modules holding domain logic don't import the database driver. |
| "Log with library Y" | Logs are structured: an event name plus fields, never interpolated strings. |

A property can be about centralisation: "concurrency limits go through one shared module, not hand-rolled helpers" keeps one kind of knowledge in one place, and still says nothing about how that module works inside.

## The document

A new engineer or agent reads it to find their way around. More importantly, anyone about to change the code reads it to learn what must stay true. Code can't show what is forbidden, which seams are deliberate, or what was left open on purpose. Recording that is this document's main job.

So it is an architecture design document: not a tour of the implementation, and not a specification of what the product does. Write only what is unlikely to change often. If an ordinary refactor behind a seam could make a sentence false, that sentence doesn't belong here. Keep it short enough to read in one sitting and for an agent to load at the start of any task; point to it from `AGENTS.md` / `CLAUDE.md` in one line rather than copying from it.

### A shape it often takes

An outline to start from, not a form to fill in. Sections can merge, move, or be left out.

```markdown
# Architecture
## Overview
## Entry Points
## Modules
### <module>
## Between Modules
## Cross-Cutting Concerns
## Deferred Decisions
```

Invariants have no section of their own; each sits where it applies, marked **Architecture Invariant:** and followed by a sentence or two of why. The label is easy to scan for; the why lets a later reader tell whether the invariant still matters.

**Overview.** What the system does, what goes in and comes out, and where its essential complexity lies. Then the architecture as a whole, in one diagram (ASCII or Mermaid, so it changes in the same diffs as the code): the main modules, which way dependencies point, where the outside world comes in, where cross-cutting concerns enter. If the design has a recognisable shape (a pipeline, layers, a core with adapters around it), name it in a sentence.

```
client ──HTTP──▶ api ──▶ orders ──▶ store ──▶ Postgres
                           │
                           ▼
                        billing ──▶ payment seam ──▶ payment provider

auth, telemetry, and flags enter every module through one seam each
```

**Entry Points.** Optional. Where to start reading: the main binary, the request handlers, the type that is the system's main interface.

**Modules.** The part closest to a codemap, kept at the level of seams: a map of the country, not an atlas of its states. One subsection for each coarse-grained module a reader needs in order to place everything else. Each says what the module is and which essential complexity it is home to; the decisions that shaped it, each with its reason; what its interface promises, when other modules or outside consumers build on it; and its architecture invariants. How it works inside belongs in its own documentation. Name important modules, files, and types so a reader can find them by symbol search; skip links and line numbers, which go stale.

```markdown
### billing
Home of pricing, discounts, and proration. Orders and refunds build on its interface; no other module computes a price.
A charge is made from a quote, an immutable snapshot of the order, rather than from live order state, so a retried charge sees exactly what the first attempt saw.

**Architecture Invariant:** charging the same quote twice is a no-op.
Retries after a network failure must never double-charge.

**Architecture Invariant:** billing never knows which payment provider sits behind its payment seam.
A second provider should mean one new adapter, not edits across orders and refunds.
```

**Between Modules.** The shape of the architecture: which way dependencies point, who may know about whom, and what only one module may touch. Most of these are absences, exactly what a reader can't infer from code.

```markdown
**Architecture Invariant:** dependencies point one way: api → domain → store. Domain never imports the HTTP framework or the database driver.
Business rules stay testable without I/O.

**Architecture Invariant:** only `billing` talks to the payment provider.
```

**Cross-Cutting Concerns.** Things that are everywhere and nowhere in particular: auth, telemetry, feature flags, error handling, testing. Every module touches them and none owns them, so each new module is a fresh chance to bypass the seam, and each bypass gets copied. For each, the seam it enters through and what nothing else may do. Project-wide conventions that keep the code uniform enough to imitate safely belong here too, such as how errors cross a seam or what a log line looks like.

```markdown
### Telemetry
Enters through the `telemetry` seam, handed to each module like any other dependency.

**Architecture Invariant:** nothing outside the telemetry adapter imports the vendor SDK.
Switching vendors should touch one adapter.

### Errors
**Architecture Invariant:** errors cross a seam as the module's own typed errors, never a dependency's raw exceptions.
Callers handle what the interface promises, not whatever happens to sit behind it.
```

**Deferred Decisions.** What was left open on purpose, and the signal that would reopen it, so no agent helpfully builds the speculative seam and no one re-argues a settled choice: "One payment provider, no abstraction beyond the test adapter. Reopen when a second is on the roadmap."

### Keeping it true

- Write only what is true of the code today; mark a target as a target. A partly false document teaches readers to distrust all of it.
- It records what rarely changes, so it doesn't follow the code. Update it when a design decision changes (an invariant, a seam, a deferred decision); otherwise revisit it now and then.
- A pattern noticed in the code, or a review comment that keeps recurring, is a candidate invariant: propose it to the user rather than writing it in silently.
- Where the document and the code disagree, take it to the user: whether to fix the document or the code is a design question.
