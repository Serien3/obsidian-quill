---
name: to-spec
description: 根据用户的 intent，生成一份需求与设计规范，用于将其集成到我们现有的代码库中
disable-model-invocation: true

---

Starting from the user's intent, develop a shared understanding that can become a spec the engineering team can plan against. A spec states what the software must satisfy, including the solution decisions that have been agreed upon so far. It defines the current boundary of acceptable implementations while leaving unconstrained local design decisions to emerge during implementation. 最后产出一份需求与设计规范，用于将其集成到我们现有的代码库中，澄清任何需要关注的问题，尤其是在您无法同时满足相互矛盾的政策时，一份好的 spec 对于开发团队而言，不应存在任何模糊或矛盾的地方。

使用 `grill-me` 技能，与用户在理解上对齐，挖掘出用户在前期没有想到的问题

When "how should it look" or "how should it behave" is the key question，或者仅通过 grill 获得的信息是低保真度的， Raise the fidelity of the discussion by making a cheap, rough, concrete artifact to react to (an outline, a rough take, a stub, or UI/logic code，一个低成本的实验验证，或者快速地数据分析与可视化等) 

Interview until that understanding is clear enough to support implementation planning. Let the task determine the depth of discussion.

Do not act on it until the user confirms you have reached a shared understanding.

最终将 spec 输出到 `docs/spec` 目录下