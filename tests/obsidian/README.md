# 实际 Obsidian 原生工具栏测试

这些脚本独立于 `npm test`，只能运行于独立配置、可丢弃 vault 的 Obsidian 实例。它们会创建和修改场景笔记，绝不能连接真实工作仓库或 `obsidian_test-vault/`。

## 准备

1. `npm run build`。
2. 新建 `quill-host-<唯一标识>/vault` 及同级 `userdata`。
3. 把 dist 的 main.js、manifest.json、styles.css 安装至该临时 vault 的 `.obsidian/plugins/quill/`，启用插件，预先创建 `test.md`。
4. 启动独立 Obsidian 实例，例如 Windows PowerShell：

   ```powershell
   & 'D:\Obsidian\Obsidian.exe' '--user-data-dir=C:\临时目录\quill-host-唯一标识\userdata' '--remote-debugging-port=19343'
   ```

使用新的 userdata，不能复用正在使用的配置；需要时可复制宿主升级归档至独立 userdata，不改原文件。调试端口仅本机使用。

WSL 调试 Windows Obsidian 时，用 Windows `node.exe` 运行脚本，连接 Windows localhost。脚本核对实际 vault 路径后才创建笔记。同一实例必须串行执行；每次完成只断开 CDP，实例由启动者关闭。

## 八个原生命令烟雾矩阵（高亮独立验证）

```sh
node tests/obsidian/native-formatting.mjs <CDP地址> <临时vault路径> '' smoke
```

每个原生命令两个场景，共 16。覆盖普通正文以及已有样式取消／清除格式／标题中的链接；同时检查文字颜色按钮不存在、下划线入口保留（其行为由专门的下划线矩阵验证）、原生切换态、命令恰好一次、调用前仍包含预期选中文字、文档输出与直接调用宿主命令一致、撤销重做；不统一断言各命令执行后的完整选区一致性。建议为整个烟雾矩阵提供至少 300 秒。

结果：`test-results/obsidian-native-formatting-smoke.json`。

## 分项完整场景

```sh
node tests/obsidian/native-formatting.mjs <CDP地址> <临时vault路径> bold
```

格式参数支持 `bold`、`italic`、`strikethrough`、`clear`、`code`、`math`、`internalLink`、`externalLink`。不传格式参数和 smoke 时运行整个矩阵。分项覆盖七种正文／结构／已格式化选区，删除线和清除格式各有第八个取消／清除场景。每项建议至少 100 秒；完整矩阵需要更长时间。

结果：`test-results/obsidian-native-formatting-<格式>.json`。被外部超时中断的运行不能算全部通过。

## 七项原生高亮菜单

```sh
node tests/obsidian/highlight-menu.mjs <CDP地址> <临时vault路径>
```

高亮不再使用直接切换命令。矩阵共 17 项：七项普通应用、已有颜色改为默认、换色、同色切换、已有加粗、反向及混合选区，以及 Esc、外部编辑、外部点击、停用插件。每项修改检查宿主方法恰好一次、菜单打开前不修改、撤销／重做；对照宿主自身构建的格式子菜单，在相同源码端点上比较内容与选区。

工具栏选区及选项点击用真实鼠标。对照菜单通过原生 `contextmenu` 事件入口生成，避免 Electron 系统右击／剪贴板 IPC 干扰自动化；不重写菜单回调。右击可能归一化格式标记端点，因此选择前恢复记录的相同原生选区，避免比较不同输入。

脚本会恢复路径核验过的临时 Electron 窗口，并创建新的编辑视图，避免最小化阻塞 CDP 输入或前一次被外部中断的探针污染编辑器。不要最小化运行中的测试窗口，也不要并行运行同一实例的其他输入测试。

可传第三个参数 `colors`、`transitions`、`lifecycle` 分组验证。完整结果：`test-results/obsidian-highlight-menu.json`；分组结果带组名后缀。最低版本声明 1.14.0，当前真实验收基于 1.15.0。

## 原生链接工作流

```sh
node tests/obsidian/native-links.mjs <CDP地址> <临时vault路径>
```

两个链接入口各在 `useMarkdownLinks` 两种状态下，与实际右键菜单对照文档及光标。验证外部 URL 继续输入、内部链接真实导航和撤销重做，结束恢复临时 vault 设置，不修改系统剪贴板、不访问外部 URL。

结果：`test-results/obsidian-native-links.json`。内部入口完全跟随宿主，不承诺强制 Markdown 链接输出。

## HTML 下划线端到端

```sh
node tests/obsidian/underline.mjs <CDP地址> <临时vault路径>
```

必须是独立的 `quill-host-*/vault`，有 `test.md`，已安装最新 dist 并启用插件。脚本核对路径后才创建场景笔记；不要并行运行同一宿主的测试。

完整矩阵包含 9 项场景：普通添加与连续切换、渲染块内局部取消、重复文字＋HTML 实体＋Emoji 精确定位、跨段落及任务列表、跨代码块整次禁用、普通文字拖入渲染块、原生加粗／斜体与阅读模式（各一项）、保存重开及停用插件后的原生可读性。每次实际切换检查独立撤销／重做。实时预览允许原样显示 HTML 内的 Markdown 标记，不要求自制渲染。

可传第三个参数单项复测：`basic`、`rendered`、`duplicate`、`paragraphs`、`safety`、`mixedRendered`、`native`、`persistence`。`native` 产生加粗、斜体两项结果。

结果：`test-results/obsidian-underline.json`（单项结果带对应后缀）。建议完整矩阵至少预留 180 秒；被超时中断的运行不能算完整通过。

## 斜杠块菜单

```sh
node tests/obsidian/slash-menu.mjs <CDP地址> <临时vault路径>
```

准备条件与前文相同：独立 userdata、路径可核验的可丢弃 `quill-host-*/vault`，安装本次构建并启用插件。同一实例串行运行，不连接真实体验库。

脚本分别在源码模式与 Live Preview 中通过真实键盘输入 `/关键词`，对全部 16 个现有动作比较原生命令的文档和选区结果，逐项验证一次撤销恢复查询与选区、一次重做恢复结果且不重新弹出。另覆盖标题／列表／引用正文起点、路径和代码／公式／属性区域不触发、Esc 保留文字、无结果正常换行、Enter 确认和切换笔记失效。通过状态由本次脚本退出结果与控制台输出判断，不依赖旧结果文件。

系统中文输入法需补充人工检查：菜单打开后组词，方向键与 Enter 仅供输入法选字，提交后搜索结果刷新，再次按 Enter 才执行动作；同时检查取消组词不误执行。浏览器集成的合成 composition 事件不等同于该项验收。未启动宿主或未实际操作输入法时，必须明确报告未验证。

## 插入按钮与正文布局

```sh
node tests/obsidian/insertion-layout.mjs <CDP地址> <临时vault路径>
```

同样要求独立 userdata、可核验的 `quill-host-*/vault`，并预先安装、启用当前构建。脚本在源码模式和 Live Preview 中分别以 1400px、700px 视口对比插件开关前后的正文位置、宽度、换行和源码，检查宽窗口的「＋」位于正文栏左侧 16px 并与第一条可视行居中。结束恢复视口及插件启用状态。窄窗口空间不足时允许隐藏按钮；行号、折叠控件及其他主题需另行人工检查。

## 测试边界

Chromium＋CodeMirror 单测中的命令替身不是 Obsidian 语义验收。真实宿主测试也不等于覆盖所有宿主版本、主题、输入法或编辑结构。最低支持版本的声明不能代替该版本的实际验证。

链接完整工作流曾出现宿主建议浮层干扰和撤销／重做断言失败，尚无后续完整通过证据；16 项命令烟雾矩阵不能替代链接输入／导航矩阵。下划线仅支持能安全分析及准确映射的结构；实时预览不提供自制 HTML 内 Markdown 渲染。

这里只保留可重复执行的脚本与说明，不维护历史通过报告。脚本会重新生成 `test-results/` 下的本地结果；失败或中断时不得把遗留 JSON 当作本次通过证据。
