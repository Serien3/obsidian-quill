---
name: to-tasks
description: Break a plan, spec, or the current conversation into a set of tracer-bullet tasks, each declaring its blocking edges.
disable-model-invocation: true

---

# To Tasks

Break a plan, spec, or conversation into a set of **tasks** — tracer-bullet vertical slices, each declaring the tasks that **block** it.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes a reference (a spec path, an issue number or URL) as an argument, fetch it and read its full body and comments.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Task titles and descriptions should respect the project's specs in the area you're touching.

Look for opportunities to prefactor the code to make the implementation easier. "Make the change easy, then make the easy change."

### 3. Draft vertical slices

Break the work into **tracer bullet** tasks.

<vertical-slice-rules>

- Each slice cuts a narrow but COMPLETE path through every layer (schema, API, UI, tests) — vertical, NOT a horizontal slice of one layer
- Each task must be independently verifiable and incrementally implement the overall goal of the execution plan.
- Each slice is sized to fit in a single fresh context window
- Any prefactoring should be done first

</vertical-slice-rules>

Give each task its **blocking edges** — the other taskss that must complete before it can start. A task with no blockers can start immediately.

**Wide refactors are the exception to vertical slicing.** A **wide refactor** is one mechanical change — rename a column, retype a shared symbol — whose **blast radius** fans across the whole codebase, so a single edit breaks thousands of call sites at once and no vertical slice can land green. Don't force it into a tracer bullet; sequence it as **expand–contract**. First expand: add the new form beside the old so nothing breaks. Then migrate the call sites over in batches sized by blast radius (per package, per directory), each batch its own task blocked by the expand, keeping CI green batch to batch because the old form still exists. Finally contract: delete the old form once no caller remains, in a task blocked by every migrate batch. When even the batches can't stay green alone, keep the sequence but let them share an integration branch that all block a final integrate-and-verify task — green is promised only there.

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each task, show:

- **Title**: short descriptive name
- **Blocked by**: which other tasks (if any) must complete first
- **What it delivers**: the end-to-end behaviour this task makes work

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the blocking edges correct — does each task only depend on tasks that genuinely gate it?
- Should any tasks be merged or split further?

Iterate until the user approves the breakdown.

### 5. Publish the tasks

Publish the approved tasks.Write one file per task under .scratch/<feature-slug>/issues/<NN>-<slug>.md, numbered from 01 in dependency order (blockers first). Each file's "Blocked by" lists the numbers/titles it depends on. Use the per-task file template below: one task per file, never a single combined file.

<task-template>

## What to build

The end-to-end behaviour this task makes work, from the user's perspective — not layer-by-layer implementation.

Keep it readable as a story: goal, work, result, proof.

## Acceptance criteria

给出spec文档中本次任务对应的 Testable Acceptance Criteria ，并给出每一条标准的具体验收方式

## Blocked by

- A reference to each blocking task, or "None — can start immediately".

<task-template>