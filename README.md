# Quill

[简体中文](README.zh-CN.md) | English

**Native Markdown, smoother writing.**

## Overview

Quill brings convenient formatting and insertion tools to Obsidian, so you can spend less time reaching for commands and more time writing.

Inspired by the ease of interactions in Notion, Quill enhances Obsidian's existing editor rather than replacing it. Your notes remain Markdown files—no proprietary content model, no separate editor, and no dependency on Quill to read them.

## Key Features

- **Selection toolbar** — Select text with the mouse in Live Preview to access bold, italic, strikethrough, inline code, inline math, clear formatting, and internal or external links.
- **Native highlight colors** — Choose the default highlight or one of six colors through Obsidian's native highlighting capability.
- **Underline** — Add or remove underlining, including part of an existing underline. Content is stored as standard HTML `<u>` tags; unsupported structures are disabled rather than partially edited.
- **Line-side insertion menu** — Open the `+` menu beside the current line for text, headings 1–6, lists, tasks, code blocks, quotes, callouts, math blocks, tables, and dividers.
- **Search and keyboard navigation** — Find insertion actions with Chinese or English search terms, navigate with arrow keys, confirm with Enter, and dismiss with Escape.
- **Native editing behavior** — Formatting and insertion use Obsidian's native commands where available. Quill does not impose its own block conversion rules or content storage format.

## Requirements

Tested with **Obsidian 1.15.0 on Windows desktop**. Other versions and platforms have not been verified. Mobile is not supported at this time.

## Installation

### Option 1: Download a release (recommended)

No Node.js or build tools are required.

1. Open [GitHub Releases](https://github.com/Serien3/obsidian-quill/releases) and choose a published version.
2. Under **Assets**, download `quill-<version>.zip`. Do not download the automatically generated **Source code** archives; they do not contain the built plugin.
3. Extract the ZIP and copy its `quill` folder into `<vault>/.obsidian/plugins/`. Create the `plugins` directory if it does not exist.

The installed files should be:

```text
<vault>/.obsidian/plugins/quill/
├── main.js
├── manifest.json
└── styles.css
```

If no published release is available yet, use the source build below.

### Option 2: Clone and build from source

Install **Git** and **Node.js 22 or later**, then run:

```sh
git clone https://github.com/Serien3/obsidian-quill.git
cd obsidian-quill
npm ci
npm run build
```

The default branch may contain unreleased changes. To build a specific release, run `git checkout v<version>` after entering the repository and before `npm ci`, replacing `<version>` with the desired version.

Create `<vault>/.obsidian/plugins/quill/` and copy these three files from `dist/` into it: `main.js`, `manifest.json`, and `styles.css`.

### Enable or update Quill

After either installation method, open **Settings → Community plugins** in Obsidian. Enable community plugins if necessary, then enable **Quill**. If Quill does not appear, restart Obsidian.

To update, back up the existing plugin directory and disable Quill first. Replace only `main.js`, `manifest.json`, and `styles.css` using either method above, then re-enable the plugin or restart Obsidian. Do not delete the entire plugin directory or overwrite other files; they may contain plugin settings.

## Usage

### Format selected text

1. Open a Markdown note in **Live Preview**.
2. Select text with the mouse to show the floating toolbar.
3. Choose a format, open the highlight color menu, or insert a link.

Click outside the toolbar or press Escape to dismiss it. Use Obsidian's normal undo and redo commands to revert edits.

Underline is saved as `<u>text</u>`. Quill does not add a custom renderer for Markdown inside HTML; its appearance follows Obsidian's rendering behavior.

### Insert or change line content

1. Place a single caret in an editable prose line without selecting text.
2. Click the `+` button beside the line.
3. Search for an action, or use ↑ / ↓ to choose one and Enter to run it.

You can also open the menu from the command palette with **打开插入菜单** (Open insert menu). No default hotkey is assigned; you can assign one in Obsidian's hotkey settings. The current interface labels are in Chinese, while insertion search supports Chinese and English aliases.

The line-side entry is hidden in unsupported contexts such as code blocks, math blocks, tables, and properties. Unavailable actions remain disabled. Actions follow Obsidian's native semantics—for example, **Text** removes heading formatting rather than clearing every block style, and task operations can toggle completion state.

### Development and regression testing

See the [testing guide](docs/testing/README.md) for automated tests and the [host testing guide](tests/obsidian/README.md) for real Obsidian regression tests. The [architecture document](docs/architecture.md) describes the design and constraints.

## TODO List

Planned maintenance areas; not a commitment to a release date or feature scope:

- [ ] Add English interface labels and localization support.
- [ ] Expand compatibility testing across Obsidian versions, operating systems, themes, and pop-out windows.
- [ ] Resolve and revalidate the full native link workflow, including suggestions, navigation, and undo/redo.
- [ ] Streamline release packaging and installation.
