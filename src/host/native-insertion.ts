import type { NativeInsertion, InsertionAction } from '../insertion/contracts';
import type { EditorView } from '@codemirror/view';
import type { EditorState, StateField } from '@codemirror/state';
import { ensureSyntaxTree } from '@codemirror/language';
import type { App, Command, Editor, MarkdownFileInfo } from 'obsidian';

type InsertionContext = MarkdownFileInfo & { getMode(): 'source' | 'preview' };

type CommandHost = App & { commands?: { commands: Record<string, Command>; executeCommandById(id: string): boolean } };

const commands = {
  text: 'editor:set-heading-0',
  heading1: 'editor:set-heading-1', heading2: 'editor:set-heading-2',
  heading3: 'editor:set-heading-3', heading4: 'editor:set-heading-4',
  heading5: 'editor:set-heading-5', heading6: 'editor:set-heading-6',
  bulletList: 'editor:toggle-bullet-list', orderedList: 'editor:toggle-numbered-list',
  task: 'editor:toggle-checklist-status', code: 'editor:insert-codeblock',
  quote: 'editor:toggle-blockquote', callout: 'editor:insert-callout',
  math: 'editor:insert-mathblock', table: 'editor:insert-table', divider: 'editor:insert-horizontal-rule'
} as const satisfies Record<InsertionAction, string>;
/** Obsidian's version-sensitive command manager stays at the host boundary. */
export function createNativeInsertion(app: App, info: StateField<MarkdownFileInfo>): NativeInsertion {
  function isActiveSource(editor: Editor): boolean {
    const context = app.workspace.activeEditor as InsertionContext | null;
    return context?.editor === editor && typeof context.getMode === 'function' && context.getMode() === 'source';
  }
  function available(action: InsertionAction, editor: Editor): boolean {
    try {
      const context = app.workspace.activeEditor;
      if (!isActiveSource(editor) || (editor as Editor & { inTableCell: boolean }).inTableCell) return false;
      const manager = (app as CommandHost).commands;
      if (typeof manager?.executeCommandById !== 'function') return false;
      const command = manager.commands?.[commands[action]];
      if (!command) return false;
      if (command.checkCallback && !command.checkCallback(true)) return false;
      if (command.editorCheckCallback && !command.editorCheckCallback(true, editor, context!)) return false;
      return true;
    } catch {
      return false;
    }
  }
  return {
    watchContext(onChange) {
      let active = true;
      const notify = () => { if (active) onChange(); };
      const editor = app.workspace.activeEditor?.editor;
      const file = app.workspace.activeEditor?.file;
      const checkLayout = () => {
        const context = app.workspace.activeEditor as InsertionContext | null;
        if (!editor || !isActiveSource(editor) || context?.file !== file) notify();
      };
      const refs = [
        app.workspace.on('active-leaf-change', notify), app.workspace.on('file-open', notify),
        app.workspace.on('layout-change', checkLayout)
      ];
      return () => {
        active = false;
        for (const ref of refs) app.workspace.offref(ref);
      };
    },
    available,
    checked(state) {
      const checked = new Set<InsertionAction>();
      const line = state.doc.lineAt(state.selection.main.head);
      const tree = ensureSyntaxTree(state, line.to);
      if (!tree) return checked;
      let heading = false;
      tree.iterate({ from: line.from, to: line.to, enter(node) {
        if (node.from > line.to || node.to < line.from) return;
        const scopes = node.name.split('_');
        for (const level of [1, 2, 3, 4, 5, 6] as const) {
          if (scopes.includes(`header-${level}`)) { checked.add(`heading${level}`); heading = true; }
        }
        if (scopes.includes('formatting-list-ul')) checked.add('bulletList');
        if (scopes.includes('formatting-list-ol')) checked.add('orderedList');
        if (scopes.includes('formatting-task')) checked.add('task');
        if (scopes.includes('quote') || scopes.includes('formatting-quote')) checked.add('quote');
      } });
      if (!heading) checked.add('text');
      return checked;
    },
    source(state: EditorState): Editor | null {
      const editor = state.field(info, false)?.editor;
      return editor && isActiveSource(editor) ? editor : null;
    },
    region(state: EditorState) {
      const editor = state.field(info, false)?.editor as (Editor & { inTableCell: boolean }) | undefined;
      if (editor?.inTableCell) return 'table';
      const line = state.doc.lineAt(state.selection.main.head);
      const tree = ensureSyntaxTree(state, line.to);
      if (!tree) return 'unknown';
      let region: ReturnType<NativeInsertion['region']> = 'text';
      tree.iterate({ from: line.from, to: line.to, enter(node) {
        if (node.from > line.to || node.to < line.from) return;
        const scopes = node.name.split('_');
        if (scopes.includes('HyperMD-codeblock')) region = 'code';
        else if (scopes.includes('HyperMD-math') || scopes.includes('math-block')) region = 'math';
        else if (scopes.includes('HyperMD-table-row')) region = 'table';
        else if (scopes.includes('hmd-frontmatter')) region = 'properties';
      } });
      return region;
    },
    execute(action, editor, isCurrent): boolean {
      try {
        if (!available(action, editor)) return false;
        editor.focus();
        if (!available(action, editor) || !isCurrent()) return false;
        return (app as CommandHost).commands?.executeCommandById(commands[action]) ?? false;
      } catch {
        return false;
      }
    }
  };
}

/** The editor's non-public CodeMirror handle never leaks into plugin assembly. */
export function createInsertionMenuCommand(open: (view: EditorView, checking: boolean) => boolean): Command {
  return {
    id: 'open-insert-menu',
    name: '打开插入菜单',
    editorCheckCallback(checking, editor) {
      const view = (editor as Editor & { cm?: EditorView }).cm;
      return view ? open(view, checking) : false;
    }
  };
}
