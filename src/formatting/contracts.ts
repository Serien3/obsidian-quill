import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

/** Feature vocabulary and presentation; native command IDs are adapter details. */
export const nativeFormatLabels = {
  bold: '加粗', italic: '斜体', strikethrough: '删除线', clear: '清除格式',
  code: '行内代码', math: '行内公式', internalLink: '新增链接', externalLink: '新增外部链接'
} as const;
export type NativeFormat = keyof typeof nativeFormatLabels;
export type NativeToggle = 'bold' | 'italic' | 'strikethrough' | 'code' | 'math' | 'highlight';

export const highlightColors = [
  { color: '', label: '默认' }, { color: 'red', label: '红色' },
  { color: 'orange', label: '橙色' }, { color: 'yellow', label: '黄色' },
  { color: 'green', label: '绿色' }, { color: 'blue', label: '蓝色' },
  { color: 'purple', label: '紫色' }
] as const;
export type HighlightColor = typeof highlightColors[number]['color'];

type Range = { from: number; to: number };

/** Host-derived display/identity queries; they do not implement native edits. */
export interface SelectionQueries {
  inspect(state: EditorState, from: number, to: number): { active: ReadonlySet<NativeToggle>; markers: readonly Range[] };
  same(state: EditorState, before: Range, after: Range, extraMarkers?: readonly Range[]): boolean;
  /** Return a supported widget containing node in view, or null.
   * view.posAtDOM(widget, 0) must identify the exact opening <u> source tag;
   * the feature verifies its rendered text before mapping any selection.
   */
  underlineWidget(view: EditorView, node: Node): HTMLElement | null;
}

/** Injected host capabilities. The editor state always belongs to the caller's editor. */
export interface FormattingHost {
  executeNativeFormat(state: EditorState, format: NativeFormat): void;
  executeNativeHighlight(state: EditorState, color: HighlightColor): void;
  /** Returns an idempotent close function; onHide may run during close. */
  openHighlightMenu(position: { x: number; y: number }, doc: Document, onChoose: (color: HighlightColor) => void, onHide: () => void): () => void;
  isLivePreview(state: EditorState): boolean;
  selection: SelectionQueries;
  setStyleIcon?: (button: HTMLButtonElement, icon: string) => void;
}
