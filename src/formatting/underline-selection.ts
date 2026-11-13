import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { underlineAt } from './underline';
import type { SelectionQueries } from './contracts';

/** Own source mapping; recognition of host widgets is supplied at the seam. */
export function renderedUnderlineSelection(widgetAt: SelectionQueries['underlineWidget']) {
  /** Only the host's HTML widget containing a supported <u> source range. */
  function renderedUnderline(view: EditorView, node: Node) {
    const widget = widgetAt(view, node);
    if (!widget) return null;
    const pair = underlineAt(view.state, view.posAtDOM(widget, 0));
    if (!pair) return null;
    const source = view.state.sliceDoc(pair.open.to, pair.close.from);
    const units: { from: number; to: number; start: number; end: number }[] = [];
    const decoder = view.dom.ownerDocument.createElement('textarea');
    let text = '';
    for (let offset = 0; offset < source.length;) {
      const tail = source.slice(offset);
      const tag = /^<\/?u>/i.exec(tail);
      if (tag) { offset += tag[0].length; continue; }
      const entity = /^&(?:#x[\da-f]+|#\d+|[a-z][a-z\d]+);/i.exec(tail);
      let value: string, length: number;
      if (entity) {
        decoder.innerHTML = entity[0]; value = decoder.value; length = entity[0].length;
      } else {
        value = String.fromCodePoint(source.codePointAt(offset)!); length = value.length;
      }
      units.push({ from: pair.open.to + offset, to: pair.open.to + offset + length, start: text.length, end: text.length + value.length });
      text += value; offset += length;
    }
    // Reject unsupported HTML/host transformations rather than guessing positions.
    if (widget.textContent !== text) return null;
    return { widget, units };
  }

  function endpoint(view: EditorView, node: Node, offset: number, start: boolean): number | null {
    if (!view.contentDOM.contains(node)) return null;
    const rendered = renderedUnderline(view, node);
    if (rendered) {
      const range = view.dom.ownerDocument.createRange();
      range.selectNodeContents(rendered.widget);
      range.setEnd(node, offset);
      const length = range.toString().length;
      const unit = rendered.units.find(unit => start ? unit.start === length : unit.end === length);
      return unit ? (start ? unit.from : unit.to) : null;
    }
    const element = node.nodeType === 1 ? node as Element : node.parentElement;
    if (element?.closest('[contenteditable="false"]')) return null;
    return view.posAtDOM(node, offset);
  }

  /** Read DOM before dispatching: establishing the native selection may expand HTML. */
  function readRenderedUnderlineSelection(view: EditorView) {
    const selection = view.dom.ownerDocument.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!renderedUnderline(view, range.startContainer) && !renderedUnderline(view, range.endContainer)) return null;
    const from = endpoint(view, range.startContainer, range.startOffset, true);
    const to = endpoint(view, range.endContainer, range.endOffset, false);
    if (from === null || to === null || from >= to) return null;
    const forward = selection.anchorNode === range.startContainer && selection.anchorOffset === range.startOffset;
    return EditorSelection.single(forward ? from : to, forward ? to : from);
  }

  /** CM drags beginning in editable text may stop DOM selection at a widget edge.
   * Recover the actual head under the pointer, using the browser's caret API. */
  function renderedUnderlinePoint(view: EditorView, x: number, y: number) {
    const caret = view.dom.ownerDocument.caretPositionFromPoint(x, y);
    if (!caret || !renderedUnderline(view, caret.offsetNode)) return null;
    return endpoint(view, caret.offsetNode, caret.offset, true) ?? endpoint(view, caret.offsetNode, caret.offset, false);
  }

  return { renderedUnderline, readRenderedUnderlineSelection, renderedUnderlinePoint };
}
