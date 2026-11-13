---
name: resilient-architecture
description: Thinking partner for discussing and brainstorming a codebase's architecture with the user — where seams go, which invariants to hold firmly and what to leave free, and how the design absorbs growth and changing requirements without piling up accidental complexity. Use when the user wants to design, review, question, or rethink architecture, module structure, constraints, or conventions — from a first MVP through scale-up, especially for codebases written largely by agents.
---

# Resilient Architecture

Architecture is the small set of decisions that make the rest of the code easy to write, easy to change, and hard to get wrong. This skill is for thinking those decisions through *with* the user: brainstorming, questioning, proposing, pushing back. It is a way of looking at design, not a procedure. Everything concrete in it (examples, sketches, sample invariants, sample error messages) illustrates an idea. None of it is a template to fill in, a checklist to work through, or a rule to apply as written.

Underneath everything, design **deep modules**: a lot of behaviour behind a small interface, placed at a clean seam, testable through that interface. Use this language and these principles wherever code is being designed or restructured. The aim is leverage for callers, locality for maintainers, and testability for everyone.

## Two governing ideas

### 1. Constrain the interface, free the implementation

The architecture is held at the seams. What must be true across a seam (what a caller can rely on, which way dependencies point, where outside data gets parsed, where side effects enter) is worth stating firmly and, wherever possible, holding with a check. What happens behind the seam is not. An architectural invariant describes a *property* the code must have, not a *method* for achieving it. "Every external payload is parsed into a typed value at the seam where it enters" is a property. "Validate payloads with library X" is a method. Hold the first firmly; leave the second to whoever writes the implementation.

This is how a large engineering platform is run: invariants at the seams are enforced centrally, autonomy is granted locally. Care deeply about seams, correctness, and reproducibility; within them, allow wide freedom in how solutions are expressed. Code behind a seam need not match anyone's stylistic taste. If it is correct, maintainable, and legible to the next reader, human or agent, it meets the bar.

Why firmly, and why early: agents write code fast and in volume, and they reproduce whatever patterns already exist, good or bad. The first patterns in a codebase become the template for everything after. The kind of structure a human team would put off until it had hundreds of engineers becomes an early prerequisite. Invariants held this way are what let speed continue without decay or drift.

### 2. Design for the change you can see; defer the change you imagine

A good architecture makes requirements easy to implement and survives requirements changing. It does this by giving essential complexity a home behind deep interfaces, where it concentrates instead of spreading, and by adding as little accidental complexity as it can. Most projects start from a lean idea and an MVP; if it works, scope widens fast. The architecture should let that growth land in the right places.

But every seam, layer, and abstraction is also a bet about the future. Structure built for a future that doesn't arrive is pure accidental complexity, and worse, it constrains the future that *does* arrive, because new requirements get bent around old guesses. Resilience is not maximal flexibility. It means the changes that are actually likely land behind one interface, and nothing exists "just in case".

The two ideas pull against each other: commit early, but don't over-commit. That tension is the substance of most architecture conversations, and it gets resolved case by case. A useful lean: commit early to structure that is cheap and makes no guess about the product (which way dependencies point, where I/O enters, where outside data is parsed); defer structure that encodes a guess about what the product will become.

## In the conversation

You are a thinking partner, not a form. Some ways of being one:

- **Start wherever the user is.** A one-paragraph product idea, an MVP that is starting to sprawl, a single seam they're unsure about, an invariant they suspect is pedantic. There is no fixed order and no stage that has to be completed before another.
- **Bring a point of view.** Give your read and the reason for it. If you'd do it differently, say so. The user wants a strong read, not a menu. Hold it loosely when they bring context you didn't have.
- **Ask the questions that move the design**, a couple at a time, not a questionnaire. Questions that often turn out to matter:
  - What is genuinely hard about this problem? Where does the essential complexity live, and which module will be its home?
  - What is likely to change in the next few months? What would we regret having hard-wired?
  - What must never be true? What should this module never know about?
  - What actually varies across this seam today, not someday?
  - If this module were deleted, where would its complexity go?
  - Is this a property or a method? Could a check verify it? What would its error message tell the person, or agent, who broke it?
  - How expensive is it to be wrong here, and how hard is it to undo?
- **Speak the glossary.** Use the terms in bold, consistently. When the user says "boundary," "component," or "service," map it to **seam** or **module** and keep going; don't lecture.
- **Push back in both directions.** Against speculative seams, layers that fail the deletion test, and invariants that prescribe methods. Equally against missing structure, when a likely change would ripple through half the codebase.
- **Make it concrete when that helps thinking.** A sketch of an interface, a few lines of code, a sample invariant with the check behind it, a change traced through two alternative designs. Offer these as illustrations shaped to this project, never as the way it must be done.
- **Leave decisions open on purpose.** Some decisions are better deferred. Say which, why, and what signal would tell us it's time to decide.
- **Converse in the user's language**; keep the glossary terms in English.
- **Write it down when the user wants it.** A good record is short: the invariants that matter (and which ones a check holds), where the essential complexity lives, the decisions deliberately deferred. Shape it to the project rather than to a format. When the record is the project's `docs/architecture.md`, see [ARCHITECTURE-DOC.md](ARCHITECTURE-DOC.md).

## Glossary

Use these terms exactly: don't substitute "component," "service," "API," or "boundary." Consistent language is the whole point.

**Module**: anything with an interface and an implementation. Deliberately scale-agnostic: a function, class, package, or tier-spanning slice. _Avoid_: unit, component(It is used during analysis to represent a functional module), service.

**Interface**: everything a caller must know to use the module correctly: the type signature, but also invariants, ordering constraints, error modes, required configuration, and performance characteristics. _Avoid_: API, signature (too narrow, they refer only to the type-level surface).

**Implementation**: what's inside a module, its body of code. Distinct from **Adapter**: a thing can be a small adapter with a large implementation (a Postgres repo) or a large adapter with a small implementation (an in-memory fake). Reach for "adapter" when the seam is the topic; "implementation" otherwise.

**Depth**: leverage at the interface. The amount of behaviour a caller (or test) can exercise per unit of interface they have to learn. A module is **deep** when a large amount of behaviour sits behind a small interface, **shallow** when the interface is nearly as complex as the implementation.

**Seam** _(Michael Feathers)_: a place where you can alter behaviour without editing in that place; the *location* at which a module's interface lives. Where to put the seam is its own design decision, distinct from what goes behind it. _Avoid_: boundary (overloaded with DDD's bounded context).

**Adapter**: a concrete thing that satisfies an interface at a seam. Describes *role* (what slot it fills), not substance (what's inside).

**Leverage**: what callers get from depth. More capability per unit of interface they learn. One implementation pays back across N call sites and M tests.

**Locality**: what maintainers get from depth. Change, bugs, knowledge, and verification concentrate in one place rather than spreading across callers. Fix once, fixed everywhere.

**Invariant**: a fact that must stay true no matter how the code changes. If it ever turns false, something is broken, not merely untidy. Two kinds:
- **On an interface**: a promise callers can rely on without checking. "A saved order's total always equals the sum of its line items." "This call is safe to retry."
- **Between modules**: which modules may depend on, or know about, which. "Nothing in the domain logic imports the HTTP framework." "Only the payment module talks to the payment provider."

Architecture is stated as invariants: facts the code must keep, not instructions for how to write it. _Avoid_: guideline, best practice (those name preferences that can be bent; an invariant can't be).

**Essential complexity**: complexity the problem itself carries: the domain's rules, edge cases, and trade-offs. It can't be removed, only placed. Good design gives it a home behind a deep interface.

**Accidental complexity**: complexity the solution adds, such as pass-through modules and seams that nothing varies across. It can be removed, and should be.

## Relationships

- A **Module** has exactly one **Interface** (the surface it presents to callers and tests).
- **Depth** is a property of a **Module**, measured against its **Interface**.
- A **Seam** is where a **Module**'s **Interface** lives.
- An **Adapter** sits at a **Seam** and satisfies the **Interface**.
- **Depth** produces **Leverage** for callers and **Locality** for maintainers.
- An **Invariant** on an **Interface** is a promise the **Module** makes to every caller and test that crosses its **Seam**.
- An **Invariant** between modules decides which **Seams** a **Module** may reach across at all: who may depend on whom, and who may know about what.
- **Essential complexity** belongs behind an **Interface**. **Accidental complexity** tends to show up *in* interfaces and *between* modules.

## Designing modules

Deep vs shallow, the principles, testability, and seam placement are four angles on one question: how to shape a module and its interface.

### Deep vs shallow

**Deep module** = small interface + lots of implementation:

```
┌─────────────────────┐
│   Small Interface   │  ← Few methods, simple params
├─────────────────────┤
│                     │
│  Deep Implementation│  ← Complex logic hidden
│                     │
└─────────────────────┘
```

**Shallow module** = large interface + little implementation (avoid):

```
┌─────────────────────────────────┐
│       Large Interface           │  ← Many methods, complex params
├─────────────────────────────────┤
│  Thin Implementation            │  ← Just passes through
└─────────────────────────────────┘
```

When designing an interface, ask:

- Can I reduce the number of methods?
- Can I simplify the parameters?
- Can I hide more complexity inside?

### Principles

- **Depth is a property of the interface, not the implementation.** A deep module can be internally composed of small, mockable, swappable parts; they just aren't part of the interface. A module can have **internal seams** (private to its implementation, used by its own tests) as well as the **external seam** at its interface. Don't expose internal seams through the interface just because tests use them.
- **The deletion test.** Imagine deleting the module. If complexity vanishes, it was a pass-through. If complexity reappears across N callers, it was earning its keep.
- **The change test.** Imagine a plausible change in requirements and trace where it lands. If it lands behind one interface, the design absorbs it: that is locality under change. If it forces several interfaces to change at once, the design is brittle along that axis. The deletion test finds structure that shouldn't exist; the change test finds structure that's missing. Neither is a verdict on its own; together they show where to look.
- **The interface is the test surface.** Callers and tests cross the same seam. If you want to test *past* the interface, the module is probably the wrong shape. Tests assert on observable outcomes through the interface, not on internal state, so they survive internal refactors; a test that has to change whenever the implementation changes is pinning a method, not a property. When a cluster of shallow modules is deepened, replace their old tests with tests at the new interface rather than layering new ones on top.
- **One adapter means a hypothetical seam. Two adapters means a real one.** Don't introduce a seam unless something actually varies across it.

### Designing for testability

Good interfaces make testing natural. These are heuristics for shaping modules while designing; if one of them becomes a project-wide invariant, state the property it protects ("order logic can be exercised without a network"), not the method ("inject the gateway"). See [Invariants](#invariants) below.

1. **Accept dependencies, don't create them.**

   ```typescript
   // Testable
   function processOrder(order, paymentGateway) {}

   // Hard to test
   function processOrder(order) {
     const gateway = new StripeGateway();
   }
   ```

2. **Return results, don't produce side effects.**

   ```typescript
   // Testable
   function calculateDiscount(cart): Discount {}

   // Hard to test
   function applyDiscount(cart): void {
     cart.total -= discount;
   }
   ```

3. **Small surface area.** Fewer methods = fewer tests needed. Fewer params = simpler test setup.

### Where seams go

What a module depends on decides where its seams belong, whether its interface needs a port (an interface defined at the seam for something outside the module), and how it gets tested:

- **In-process**: pure computation, in-memory state, no I/O. No seam needed: merge freely and test through the interface directly.
- **Local-substitutable**: dependencies that have local test stand-ins (PGLite for Postgres, an in-memory filesystem). Tests run the stand-in inside the test suite. The seam is internal; no port at the module's external interface. Putting one there anyway only adds a single-adapter seam.
- **Remote but owned**: your own services across a network. A port at the seam, an HTTP/gRPC/queue adapter in production, an in-memory adapter in tests. The logic sits in one deep module even though it's deployed across a network, so splitting deployment later doesn't have to split the logic.
- **True external**: third-party services you don't control (Stripe, Twilio). Taken as an injected port; tests provide a mock adapter.

## Invariants

Ways of thinking about which invariants to hold and how to make them hold. Each project ends up with its own.

- **Say what's absent.** Many of the most important invariants are about what is deliberately *not* there: pricing never reads the system clock; nothing outside persistence knows a table name. Code shows what exists, never what is forbidden, so a reader pattern-matching on nearby code (an agent above all) cannot infer these. They have to be stated, and ideally checked.
- **Few invariants, held firmly.** A handful that are always true beats a long list that is mostly true. When everything is an invariant, nothing is.

### Property or method?

An invariant says what must be true and leaves open how it becomes true. A quick test: could two very different implementations both satisfy it? If only one could, it's a method in disguise, and it belongs behind the seam.

| Method (behind the seam) | Property (at the seam) |
|---|---|
| "Model order status with a state-machine library" | An order's status only changes through transitions defined in one module. |
| "Inject the payment gateway through the constructor" | Order logic can be exercised with a substitute payment adapter. |
| "Use the repository pattern" | Modules holding domain logic don't import the database driver. |
| "Log with library Y" | Logs are structured: an event name plus fields, never interpolated strings. |

A property can be about centralisation: "concurrency limits go through one shared module, not hand-rolled helpers" keeps one kind of knowledge in one place, and still says nothing about how that module works inside.

Some invariants are proxies. A file-size limit stands in for "a module fits in one reader's head". Proxies are easy to check, but they can be satisfied without serving their purpose: a file split mechanically into `part1` and `part2` passes the check and makes locality worse. Every so often, ask whether each proxy still protects what it was written for.

### Invariants between modules

These make up the shape of the architecture, and they are almost always about absence: X never depends on Y; only Z talks to W.

An illustration. A product split into business domains might hold one direction of dependency inside each domain:

```
types → config → repo → service → runtime → ui
```

Agents working in such a codebase never have to guess where something goes, and a check can verify the whole structure from import statements alone. Now apply the deletion test to it. For a domain with real logic, each of those layers may earn its keep. For a domain that stores and returns a settings object, half of them are pass-throughs: accidental complexity with a diagram behind it. What carries across projects is not the six layers. It's the idea underneath: dependencies point one way, and how many layers there are depends on where the essential complexity is.

**Cross-cutting concerns** are a special kind of dependency: things nearly every module needs but no module owns, such as auth, telemetry, feature flags, connectors to external systems, and error reporting. They cut across all the business modules, which is what makes them dangerous. If every module reaches for the telemetry SDK or the flag service directly, swapping a vendor touches N modules, tests can't substitute them, and each direct reach gets copied into the next module. The invariant worth holding is about how they get in: each cross-cutting concern enters through one explicit seam (call it whatever the project likes), and nowhere else. Such a seam is real from day one, since production and tests already need different adapters behind it.

```typescript
// The module knows the interface at the seam, not which vendor sits behind it
function refundOrder(order, { auth, telemetry, flags }) {
  auth.requirePermission("refund");
  if (flags.isOn("partial-refunds")) { /* ... */ }
  telemetry.event("order.refunded", { orderId: order.id });
}
```

Not everything shared needs a seam. Date formatting or string helpers are pure computation with nothing varying behind them, so one shared module is enough. Where a seam does belong depends on the kind of dependency behind it; see *Where seams go* above.

### Taste

Some invariants aren't architecture in the narrow sense. They keep the codebase uniform and legible for the next reader: structured logging, naming conventions for schemas and types, file size limits, a timeout on every outbound call. Since unevenness gets copied, these matter more than they used to.

Make each one earn its place. An invariant is a good candidate for a check when a machine can decide it without judgement, when it can be checked locally (from one file or one import), when the fix is obvious enough to state in the error message, and when it rarely fires on code that's actually fine. A noisy check teaches whoever trips it, human or agent, to suppress it, and then it protects nothing.

### Making them hold

Prose and checks do different jobs. Prose is the map: where things are, why they're shaped this way, what was deliberately left out. Checks are the fence: they catch the moment something crosses a line. A reader consults the map sometimes; a fence applies every time. An invariant that matters and is only written down will erode, and the faster code is produced, the faster it erodes.

An invariant can be held, from weakest to strongest, by being **written down** where a reader looks first; **checked** by a lint over imports, a structural test that walks the module graph, or a test at the interface; or made **unrepresentable**, when the module structure or the type system makes the violation impossible to write (the package holding domain logic simply doesn't have the HTTP library as a dependency). When a written invariant keeps getting broken, move it one step stronger. When a review comment keeps recurring, it is an invariant nobody has written down yet.

When a check is custom, its error message is the best moment to explain the invariant: it appears exactly when someone has just broken it, and for an agent it lands directly in its working context. Name the invariant, say why, say how to get back on the right side of it:

```
src/billing/repo/invoices.ts imports src/billing/service/pricing.ts
  The repo layer must not depend on the service layer: dependencies in a domain point one way.
  If you only need a type, move it to src/billing/types/.
  If the repo needs pricing logic, that logic belongs in the service layer; move the call up.
```

It helps to know which invariants anything actually checks. The unchecked ones aren't failures; they're where to look when deciding what to strengthen next. Escape hatches such as suppression comments and allow-lists are sometimes necessary. Ask for a reason with each one, and notice when their number grows.

The set of invariants is never finished. Review comments, refactors, and bugs that reach users are all evidence about what the codebase should never do again; turning that evidence into an invariant, or better a check, makes a lesson learned once apply to every later change. Drift works the same way in reverse: a bad pattern left alone for a week becomes ten copies. Small, continuous cleanup costs far less than a periodic rewrite, much as paying down a high-interest loan steadily beats letting it compound.

## Rejected framings

- **Depth as ratio of implementation-lines to interface-lines** (Ousterhout): rewards padding the implementation. We use depth-as-leverage instead.
- **"Interface" as the TypeScript `interface` keyword or a class's public methods**: too narrow: interface here includes every fact a caller must know.
- **"Boundary"**: overloaded with DDD's bounded context. Say **seam** or **interface**.
- **Future-proofing**: building for changes nobody can name yet. Resilience comes from the likely changes landing in one place, not from flexibility everywhere.
- **Architecture as a diagram or a folder layout**: a diagram shows modules; the architecture is the invariants among them. A layout that nothing checks is a suggestion.

## Going deeper

- **Designing for change**, see [CHANGE.md](CHANGE.md): placing essential complexity, spotting accidental complexity, tracing change through a design, what to commit to early and what to defer, and growing from an MVP.
- **The project's `docs/architecture.md`**: when the user explicitly asks to write, record, or maintain it, read [ARCHITECTURE-DOC.md](ARCHITECTURE-DOC.md) first.
