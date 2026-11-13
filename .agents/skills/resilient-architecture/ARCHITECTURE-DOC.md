# docs/architecture.md

How to write and keep up a project's `docs/architecture.md`. Assumes the vocabulary in [SKILL.md](SKILL.md).

## What it is for

A new engineer or agent reads it to find their way around. More importantly, anyone about to change the code reads it to learn what must stay true. Code shows what exists. It can't show what is forbidden, which seams are deliberate, or what was left open on purpose. Recording that is this document's main job.

So it is a design document, not a tour of the implementation. If an ordinary refactor behind a seam could make a sentence false, that sentence doesn't belong here. Keep it short enough to read in one sitting and for an agent to load at the start of any task; point to it from `AGENTS.md` / `CLAUDE.md` in one line rather than copying from it.

## A shape it often takes

An outline to start from, not a form to fill in. Sections can merge, move, or be left out.

```markdown
# Architecture
## Overview
## Between modules
### Cross-cutting concerns
## Modules
## Conventions
## Deferred decisions
```

Invariants have no section of their own; each sits where it applies, with one line of why. An invariant about one module (what it promises, what it never knows) goes with that module. One about the shape of the whole goes under **Between modules**. The global ones come first because they bind every change; a module's own bind only changes to that module.

**Overview.** What the system does, what goes in and comes out, and where its essential complexity lies. A small text diagram (ASCII or Mermaid) of the main modules, dependency direction, and where the outside world comes in orients the reader and changes in the same diffs as the code.

**Between modules.** The shape of the architecture: which way dependencies point, and what only one module may touch. Most of these are absences, exactly what a reader can't infer from code.

```markdown
- Dependencies point one way: api → domain → store. Domain never imports the HTTP framework or the database driver.
  (Business rules stay testable without I/O.)
- Only `billing` talks to the payment provider.
  (A second provider should mean one new adapter, not edits across orders and refunds.)
```

**Cross-cutting concerns.** The between-module invariants most easily broken. Auth, telemetry, feature flags, error reporting, testing: every module touches them and none owns them, so each new module is a fresh chance to bypass the seam, and each bypass gets copied. For each, the seam it enters through and what nothing else may do; also invariants that span every seam, such as how errors cross one.

```markdown
- Telemetry enters through the `telemetry` seam; nothing else imports the vendor SDK.
- Errors cross a seam as the module's own typed errors, never a dependency's raw exceptions.
- Tests go through module interfaces and never touch the network.
```

**Modules.** The part closest to a codemap, so stay at the level of seams. For the modules a reader needs in order to place everything else: the essential complexity each is home to, what its interface promises, what it must never know. Use names from the code; skip links and line numbers. Give a path only where the location is itself a decision.

```markdown
### billing
Home of pricing rules, discounts, and proration.
- A quote is immutable; charging the same quote twice is a no-op.
  (Retries after a network failure must never double-charge.)
- Never knows which payment provider sits behind its payment seam.
```

**Conventions.** Project-wide taste invariants. If a linter config already lists them, name the config.

**Deferred decisions.** What was left open on purpose, and the signal that would reopen it, so no agent helpfully builds the speculative seam and no one re-argues a settled choice: "One payment provider, no abstraction beyond the test adapter. Reopen when a second is on the roadmap."

## Keeping it true

- Write only what is true of the code today; mark a target as a target. A partly false document teaches readers to distrust all of it.
- It records decisions, it doesn't make them. A pattern noticed in the code is a candidate invariant: propose it to the user rather than writing it in silently.
- Update it when an invariant, a seam, or a deferred decision changes, or when a review comment keeps recurring. Otherwise leave it alone.
- Checked against the code, drift goes to the user: whether to fix the document or the code is a design question.
