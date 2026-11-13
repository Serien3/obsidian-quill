# 发布版本

`.github/workflows/release.yml` 在推送 `v*` tag 时运行。它执行版本检查、类型检查、自动化测试和构建，并创建 **GitHub Draft Release（草稿）**；不会自动公开发布，也不会修改用户 vault。

## 1. 准备版本

1. 更新 `manifest.json` 和 `package.json` 的 `version`，使其一致，例如 `0.1.0`。同步锁文件：

   ```sh
   npm install --package-lock-only
   ```

2. 按 [测试说明](testing/README.md) 执行开发验证；涉及宿主行为的改动，还应按 [宿主测试说明](../tests/obsidian/README.md) 在可丢弃 vault 中验收。
3. 提交代码与版本文件，确保工作区干净，再推送提交与 tag：

   ```sh
   git push origin HEAD
   git tag -a v0.1.0 -m "Quill 0.1.0"
   git push origin v0.1.0
   ```

将示例版本替换为本次版本。tag 必须是 `v<version>`，与两个 JSON 文件的版本一致；支持 `v0.2.0-beta.1` 等预发布版本，这类草稿会自动标记为 prerelease。不接受 `v` 后没有版本号或附带构建元数据的 tag。

tag 指向的提交必须已经包含发布工作流。仅推送普通提交不会触发该工作流。

## 2. 等待 Actions 完成

在 GitHub 仓库的 **Actions → Release** 查看运行情况。流程依次执行：

1. 校验版本号。
2. `npm ci` 并安装 Chromium 测试环境。
3. `npm run typecheck`。
4. `npm test`，包括单元和浏览器测试。
5. `npm run build`。
6. 打包并创建 Draft Release，上传 `quill-<version>.zip`，不单独上传三个插件文件。

ZIP 只包含 `quill/` 文件夹及其中的三个插件文件，不包含源码、依赖或 source map。解压后可以将 `quill/` 放入 vault 的 `.obsidian/plugins/`。

工作流使用 GitHub 自带的 `GITHUB_TOKEN`，不需要额外配置个人访问令牌。仓库或组织的 Actions 策略需要允许工作流使用 `contents: write` 创建 Release。

## 3. 人工确认并公开发布

Draft Release 是尚未公开发布的草稿，普通用户不能将它作为公开下载入口；你需要用有仓库写入权限的账号访问。

1. 打开仓库 **Releases**，找到本次版本的 **Draft**，进入编辑页面。
2. 检查 tag、版本号以及 ZIP 附件是否正确。需要安装包时下载 `quill-<version>.zip`，不是 GitHub 自动生成的 `Source code`。
3. 编辑自动生成的发布说明，说明用户可感知的变更、已知问题，以及实际完成的兼容性和宿主验证范围。自动生成的内容只是提交／PR 摘要，不是测试报告。
4. 确认本次构建在真实 Obsidian 中的必要验证已完成。GitHub 上的 Chromium 测试不能代替宿主验收，未验证项应明确注明。
5. 预发布版本保留 **pre-release** 标记；稳定版确认版本与说明无误后，点击 **Publish release**。

正式发布后，用户才可以通过公开 Releases 页面下载附件。创建草稿本身不会自动安装或更新用户的插件。

## 失败与重试

- 任一步骤失败，后续步骤不会继续；先查看 Actions 的失败日志。
- 若只是网络等临时问题且尚未创建草稿，可在 Actions 页面选择 **Re-run failed jobs**。
- 工作流不会覆盖已有同 tag 的 Release。若草稿已经存在，重新执行会在创建 Release 时失败；需要重建时，只删除未发布草稿后重跑，不要删除已公开版本来覆盖安装包。
- 需要修复源码时，修复、提交并使用新的版本号和 tag 发布；不要移动已经公开发布的 tag。
