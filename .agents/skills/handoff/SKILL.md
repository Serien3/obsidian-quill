---
name: handoff
description: Compact the current conversation into a handoff document for another agent to pick up.
argument-hint: "What will the next session be used for?"
disable-model-invocation: true
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save to the current workspace.

The document should cover:
- Task goal
- Work completed so far
- Current blockers or open questions
- Planned next steps
- Pitfalls encountered

Write for a fresh agent or colleague with zero prior context.

Include a "Suggested operations" section listing commands or actions the next agent should run to quickly understand the current state.

Do not duplicate content already captured in other artifacts (specs, plans, issues, commits, diffs, etc). Reference them by path or URL instead.

Redact any sensitive information, such as API keys, passwords, or personally identifiable information.

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.