import type { EditorView } from '@codemirror/view';
import { beginInsertion, endInsertion, insertionBoundary } from './compound-edit';
import type { EditorState } from '@codemirror/state';
import type { Editor } from 'obsidian';
import type { NativeInsertion, InsertionAction } from './contracts';

export interface InsertionTarget {
  state: EditorState;
  editor: Editor;
}

export function insertionTarget(state: EditorState, host: NativeInsertion): InsertionTarget | null {
  if (state.readOnly || state.selection.ranges.length !== 1 || !state.selection.main.empty || host.region(state) !== 'text') return null;
  const editor = host.source(state);
  return editor ? { state, editor } : null;
}

/** Editing behavior owns target validity, never menu instances or their lifecycle. */
export function applyInsertion(action: InsertionAction, readState: () => EditorState | null, target: InsertionTarget, host: NativeInsertion): boolean {
  const isCurrent = () => {
    const state = readState();
    return state !== null && state.doc === target.state.doc && state.selection.eq(target.state.selection)
      && insertionTarget(state, host)?.editor === target.editor;
  };
  if (!isCurrent()) return false;
  return host.execute(action, target.editor, isCurrent);
}

/** Presentation belongs to this feature; native command IDs stay in the host. */
export const insertionActions: readonly { id: InsertionAction; label: string; icon: string; aliases: readonly string[]; separator?: boolean }[] = [
  { id: 'text', label: '文本', icon: 'text', aliases: ['正文', '普通段落', 'text', 'paragraph'] },
  { id: 'heading1', label: '标题 1', icon: 'heading-1', aliases: ['heading 1', 'h1'] },
  { id: 'heading2', label: '标题 2', icon: 'heading-2', aliases: ['heading 2', 'h2'] },
  { id: 'heading3', label: '标题 3', icon: 'heading-3', aliases: ['heading 3', 'h3'] },
  { id: 'heading4', label: '标题 4', icon: 'heading-4', aliases: ['heading 4', 'h4'] },
  { id: 'heading5', label: '标题 5', icon: 'heading-5', aliases: ['heading 5', 'h5'] },
  { id: 'heading6', label: '标题 6', icon: 'heading-6', aliases: ['heading 6', 'h6'] },
  { id: 'bulletList', label: '项目符号列表', icon: 'list', aliases: ['无序列表', 'bullet list', 'unordered list'], separator: true },
  { id: 'orderedList', label: '有序列表', icon: 'list-ordered', aliases: ['数字列表', 'ordered list', 'numbered list'] },
  { id: 'task', label: '待办事项', icon: 'check-square', aliases: ['待办', '任务列表', 'todo', 'task', 'checklist'] },
  { id: 'code', label: '代码', icon: 'code', aliases: ['代码块', 'code', 'codeblock'], separator: true },
  { id: 'quote', label: '引用', icon: 'quote', aliases: ['引用块', 'quote', 'blockquote'] },
  { id: 'callout', label: '标注', icon: 'message-square', aliases: ['callout', '提示块'] },
  { id: 'math', label: '公式区块', icon: 'sigma', aliases: ['数学块', '公式', 'math', 'equation'] },
  { id: 'table', label: '表格', icon: 'table', aliases: ['table'], separator: true },
  { id: 'divider', label: '分隔线', icon: 'minus', aliases: ['水平线', 'divider', 'horizontal rule'] }
];

/** Consumes only the query; native commands retain ownership of block semantics. */
export function applySlashInsertion(action: InsertionAction, view: EditorView, target: InsertionTarget,
  from: number, to: number, host: NativeInsertion, alive: () => boolean): boolean {
  let expected = target.state;
  let prepared = false;
  const query = expected.doc.sliceString(from, to);
  const current = () => alive() && view.state.doc === expected.doc && view.state.selection.eq(expected.selection)
    && insertionTarget(view.state, host)?.editor === target.editor;
  try {
    const result = host.execute(action, target.editor, current, () => {
      if (!current()) return false;
      const tr = view.state.update({ changes: { from, to }, selection: { anchor: from }, effects: beginInsertion,
        annotations: insertionBoundary });
      expected = tr.state;
      prepared = true;
      view.dispatch(tr);
      return current();
    });
    if (!result && prepared && current()) {
      view.dispatch({ changes: { from, insert: query }, selection: target.state.selection });
    }
    return result;
  } finally {
    if (prepared && alive()) view.dispatch(endInsertion);
  }
}
