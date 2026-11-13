# 项目方向与总体目标

本项目开发面向 Obsidian 的插件，提供更好的 Markdown 编写与交互体验。

- 借鉴 Notion 在编辑操作和便捷交互方面的成熟体验，但不以复制 Notion 为目标，不模仿其数据库等产品体系。
- 以原生 Markdown 文件作为内容的事实来源，优先增强 Obsidian 的原生编辑体验，而不是另造一套编辑器或私有内容格式。
- 保持笔记的可移植性：插件停用后，核心内容仍应可以正常阅读与编辑。

# 测试与体验环境

- `obsidian_test-vault/` 是受保护的真实体验库：测试内容隔离存放，不擅自覆盖用户内容、重置配置或更新插件；破坏性测试使用可丢弃的临时 vault。
- 代码改动须验证类型、自动化测试与构建；涉及宿主行为时补充真实 Obsidian 验证。浏览器测试不等于宿主验收，未执行或未通过的验证须明确说明。
- 保留可复用的测试代码与运行说明，不保留阶段测试报告或历史产物归档；本地输出不作为当前通过证据。
- 开发验证、安装或用户体验时，按需阅读 [测试说明](docs/testing/README.md)；运行真实宿主测试前，阅读 [宿主测试说明](tests/obsidian/README.md)。

# 架构规范

涉及功能开发、模块划分或依赖调整前，阅读并遵守 [架构规范](docs/architecture.md)。该文档规定逻辑边界与不变式，不代表现有源码已完成符合性审查。

# 开发原则

以下原则中的向后兼容指项目自身旧实现与过时路径的兼容，不意味着可以破坏用户内容或放弃 Markdown 的可移植性。

- Do not preserve backward compatibility. Remove obsolete paths instead of adding compatibility layers, fallbacks, or migrations.
- Choose the simplest implementation that fully meets the current requirements. Avoid speculative abstractions, configuration, and indirection.
- Grow the system in layers. Start from the smallest version that works end to end, and add each new capability on top of a product that already works. Never trade a working product for unfinished complexity.
- Keep components modular and concerns clearly separated.
- Prefer established, well-maintained libraries when they reduce overall complexity or improve reliability. Do not reimplement common functionality without a clear reason.
- Lean on the dependencies already in the project before writing your own implementation or adding packages. Do not assume a library lacks a capability without checking its documentation and types.
- Make architectural decisions for the long term. Do not accept a stopgap that only works for now and is meant to be replaced later.
- Study how established products solve the problem before designing a solution. Adopt their proven patterns and conventions rather than inventing an approach from scratch.
- Avoid unnecessary defensive checks, speculative fallbacks, and unrelated changes. Validate untrusted inputs at boundaries and trust established internal contracts.
