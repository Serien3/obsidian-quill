# 测试说明

本页说明当前测试入口与验证边界，不是测试通过报告。架构约束见 [架构规范](../architecture.md)，版本 tag、CI 与草稿发布操作见 [发布说明](../releasing.md)。

## 日常开发验证

需要 Node.js 22 或更高版本。首次准备与常规验证：

```sh
npm ci
npx playwright install chromium
npm run typecheck
npm test
npm run build
```

`npm test` 由 `vitest.config.ts` 定义两个项目：

| 层次 | 文件 | 验证范围与限制 |
| --- | --- | --- |
| 单元测试 | `tests/native-formatting.test.ts`、`tests/native-highlight.test.ts` | 使用宿主替身验证命令参数、调用次数、来源编辑器检查与失败处理，不验证 Obsidian 实际格式语义 |
| 选区查询单测 | `tests/native-selection.test.ts` | 真实 CodeMirror 状态与人工宿主 token 树，验证展示态及格式标记显隐后的选区身份；不证明宿主 token 契约仍然有效 |
| 插入宿主接入单测 | `tests/native-insertion.test.ts` | 宿主边界替身与人工语法快照验证来源身份、区域查询和原生命令调用；不证明真实 Obsidian 协议已通过 |
| 插入交互集成 | `tests/insert-menu.browser.test.ts` | 真实 Chromium 与 CodeMirror 验证完整菜单、格式／禁用展示、搜索／键盘与打开命令、布局／列表滚动、所属窗口坐标、上下文退出、光标／焦点、来源失效、清理及与旧工具栏共存；宿主能力由替身提供 |
| 浏览器集成 | `tests/toolbar.browser.test.ts` | 真实 Chromium、CodeMirror 与 CSS，验证工具栏、选区、内容修改、布局和生命周期；多数选区使用合成事件与直接设置状态，宿主能力由替身提供 |

类型检查、测试、构建分别执行；构建成功不代表测试通过。

## 安装与用户体验

生产构建输出到 `dist/`；Obsidian 与 CodeMirror 运行时由宿主提供。

获授权安装后，将 `dist/main.js`、`dist/manifest.json`、`dist/styles.css` 放入目标 vault 的 `.obsidian/plugins/quill/`，启用或重新加载 **Quill**。更新已有安装前备份，仅替换本插件这三个文件，不覆盖其他插件或用户文件。

`obsidian_test-vault/` 用于用户真实体验与反馈，不作为可随时清空的临时目录。测试笔记与附件隔离存放，不重置 vault 或修改无关配置。交付体验时，在回复中简述操作步骤、预期效果、已验证与未验证事项，无需另建阶段报告。

## 真实 Obsidian 验收

详细准备、命令与矩阵见 [宿主测试说明](../../tests/obsidian/README.md)。这些脚本不包含在 `npm test` 中。

- `tests/obsidian/native-formatting.mjs`：八个原生命令的完整场景或烟雾矩阵。
- `tests/obsidian/highlight-menu.mjs`：高亮颜色、切换、宿主对照及菜单生命周期。
- `tests/obsidian/native-links.mjs`：链接设置、右键菜单对照、输入、导航及撤销重做。
- `tests/obsidian/underline.mjs`：真实拖选、渲染内容映射、结构安全、保存重开及停用后的可读性。

必须使用独立 userdata、可丢弃的 `quill-host-*/vault`，不得连接 `obsidian_test-vault/` 或用户工作库。脚本核对实际 vault 路径后才写入；同一宿主实例串行执行。安装本次构建、启用插件和启动宿主仍需要人工准备。

浏览器测试不能代替原生命令与 Live Preview 的宿主验收；宿主单版本通过也不能推断其他版本、主题或输入法均通过。

## 测试产物与结果

- 仓库保留可复用的测试源码、夹具和运行说明，不保留逐阶段验收报告、TDD 日志或历史结果归档。
- `test-results/`、`.vitest/` 是忽略的本地输出，可在不再需要诊断时删除；后续运行可能重新生成。
- 固定名称的结果文件可能来自旧运行；失败或中断时不能用旧 JSON 宣称本次通过。测试通过状态以实际运行及其退出结果为准。
- 链接完整工作流曾出现宿主建议浮层干扰和撤销／重做断言失败，尚无后续完整通过证据；命令烟雾通过不能代替 `native-links.mjs` 完整回归。
