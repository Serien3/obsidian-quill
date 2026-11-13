import type { NativeToggle, SelectionQueries } from '../formatting/contracts';
import type { EditorView } from '@codemirror/view';
import type { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';

const toggleScopes = {
  bold: 'strong', italic: 'em', strikethrough: 'strikethrough',
  code: 'inline-code', math: 'math', highlight: 'highlight'
} as const satisfies Record<NativeToggle, string>;
type Range = { from: number; to: number };

/** Query the host's existing tree, never parse Markdown or gate native commands. */
function inspectNativeSelection(state: EditorState, from: number, to: number) {
  const formats = Object.entries(toggleScopes).map(([format, scope]) => ({
    format: format as NativeToggle, scope, covered: from, continuous: true, content: false
  }));
  const markers: Range[] = [];
  syntaxTree(state).iterate({ from, to, enter(node) {
    const scopes = node.name.split('_');
    const start = Math.max(from, node.from), end = Math.min(to, node.to);
    if (start >= end) return;
    const formatting = scopes.some(scope => /^formatting-(strong|em|strikethrough|code|math|highlight)(?:-|$)/.test(scope));
    if (formatting) markers.push({ from: node.from, to: node.to });
    for (const format of formats) {
      if (!scopes.includes(format.scope)) continue;
      if (start > format.covered) format.continuous = false;
      format.covered = Math.max(format.covered, end);
      if (!formatting) format.content = true;
    }
  } });
  const active = new Set(formats.filter(format => from < to && format.continuous && format.content && format.covered >= to).map(format => format.format));
  return { active, markers };
}

/** Keep a toolbar only when the host reveals/hides complete supported edge markers. */
function sameNativeSelection(state: EditorState, before: Range, after: Range, extraMarkers: readonly Range[] = []) {
  const markers = [...inspectNativeSelection(state, Math.min(before.from, after.from), Math.max(before.to, after.to)).markers, ...extraMarkers];
  const content = ({ from, to }: Range) => {
    let marker;
    while ((marker = markers.find(marker => marker.from === from && marker.to <= to))) from = marker.to;
    while ((marker = markers.find(marker => marker.to === to && marker.from >= from))) to = marker.from;
    return { from, to };
  };
  const a = content(before), b = content(after);
  return a.from < a.to && b.from < b.to && a.from === b.from && a.to === b.to;
}

/** Only this adapter knows the host's rendered HTML widget protocol. */
function underlineWidget(view: EditorView, node: Node): HTMLElement | null {
  const element = node.nodeType === 1 ? node as Element : node.parentElement;
  const widget = element?.closest<HTMLElement>('.cm-html-embed[contenteditable="false"]');
  return widget && view.contentDOM.contains(widget) && widget.querySelector('u') ? widget : null;
}

export const nativeSelection: SelectionQueries = {
  inspect: inspectNativeSelection,
  same: sameNativeSelection,
  underlineWidget
};
