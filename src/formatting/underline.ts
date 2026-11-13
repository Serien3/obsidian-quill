import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state';
import { isolateHistory } from '@codemirror/commands';
import { parser, GFM } from '@lezer/markdown';

// CommonMark/GFM supplies code, link, HTML and block boundaries. Only the two
// Obsidian inline atoms missing from that grammar are added here; this parser
// is used for underline safety, never to implement the native format commands.
const markdown = parser.configure([GFM, {
  defineNodes: ['ObsidianMath', { name: 'ObsidianDisplayMath', block: true }, 'ObsidianWikiLink', 'ObsidianEmbed'],
  parseBlock: [{
    name: 'ObsidianDisplayMath', before: 'HTMLBlock',
    parse(cx, line) {
      const text = line.text.slice(line.pos);
      if (!text.startsWith('$$')) return false;
      const from = cx.lineStart + line.pos;
      let to = cx.lineStart + line.text.length;
      if (text.slice(2).includes('$$')) {
        cx.nextLine();
      } else {
        while (cx.nextLine()) {
          to = cx.lineStart + line.text.length;
          if (line.text.slice(line.pos).includes('$$')) { cx.nextLine(); break; }
        }
      }
      cx.addElement(cx.elt('ObsidianDisplayMath', from, to));
      return true;
    },
    endLeaf: (_cx, line) => line.text.slice(line.pos).startsWith('$$')
  }],
  parseInline: [{
    name: 'ObsidianMath', before: 'HTMLTag',
    parse(cx, next, pos) {
      if (next !== 36) return -1;
      const delimiter = cx.char(pos + 1) === 36 ? '$$' : '$';
      for (let end = pos + delimiter.length; end < cx.end; end++) {
        if (cx.char(end) === 92) { end++; continue; }
        if (cx.slice(end, end + delimiter.length) === delimiter) {
          return cx.addElement(cx.elt(delimiter.length === 2 ? 'ObsidianDisplayMath' : 'ObsidianMath', pos, end + delimiter.length));
        }
      }
      return -1;
    }
  }, {
    name: 'ObsidianWikiLink', before: 'Link',
    parse(cx, next, pos) {
      const embed = next === 33;
      const start = pos + (embed ? 1 : 0);
      if (cx.slice(start, start + 2) !== '[[') return -1;
      const end = cx.text.indexOf(']]', start + 2 - cx.offset);
      if (end < 0) return -1;
      return cx.addElement(cx.elt(embed ? 'ObsidianEmbed' : 'ObsidianWikiLink', pos, cx.offset + end + 2));
    }
  }]
}]);

type Range = { from: number; to: number };
type Boundary = Range & { inner?: Range; blocked?: boolean; reason: string };
type Underline = { open: Range; close: Range };

function parseUnderlines(state: EditorState) {
  const source = state.doc.toString();
  const stack: Range[] = [], pairs: Underline[] = [], prefixes: Range[] = [], suffixes: Range[] = [], breaks: Range[] = [], boundaries: Boundary[] = [];
  markdown.parse(source).iterate({ enter(node) {
    if (node.name === 'HardBreak') breaks.push({ from: node.from, to: node.to });
    if (node.name === 'HeaderMark' && node.from !== node.node.parent!.from) suffixes.push({ from: node.from, to: node.to });
    if (['ListMark', 'QuoteMark', 'HeaderMark', 'TaskMarker'].includes(node.name)) prefixes.push({ from: node.from, to: node.to });
    if (['FencedCode', 'CodeBlock', 'HTMLBlock', 'CommentBlock', 'ProcessingInstruction', 'Table', 'HorizontalRule', 'LinkReference', 'SetextHeading1', 'SetextHeading2', 'Image', 'ObsidianDisplayMath', 'ObsidianEmbed'].includes(node.name)) {
      boundaries.push({ from: node.from, to: node.to, blocked: true, reason: '选区包含代码块、嵌入或其他不支持的结构' });
    }
    if (['InlineCode', 'Entity', 'Escape', 'ObsidianMath', 'ObsidianWikiLink'].includes(node.name)) boundaries.push({ from: node.from, to: node.to, reason: '不能切开代码、实体或转义字符' });
    if (['Link', 'StrongEmphasis', 'Emphasis', 'Strikethrough'].includes(node.name)) {
      const first = node.node.firstChild!, last = node.node.lastChild!;
      let closing = last;
      if (node.name === 'Link') {
        for (let child = first.nextSibling; child; child = child.nextSibling) {
          if (child.name === 'LinkMark' && source.slice(child.from, child.to) === ']') { closing = child; break; }
        }
      }
      boundaries.push({ from: node.from, to: node.to, inner: { from: first.to, to: closing.from }, reason: '不能切开链接或格式标记边界' });
    }
    if (node.name !== 'HTMLTag') return;
    const tag = source.slice(node.from, node.to).toLowerCase();
    if (tag === '<u>') stack.push({ from: node.from, to: node.to });
    if (tag === '</u>' && stack.length) pairs.push({ open: stack.pop()!, close: { from: node.from, to: node.to } });
    else if (tag !== '<u>') boundaries.push({ from: node.from, to: node.to, blocked: true, reason: '不支持此 HTML 标签或未配对的下划线标签' });
  } });
  for (const tag of stack) boundaries.push({ from: tag.from, to: state.doc.length, blocked: true, reason: '下划线标签未配对' });
  const frontmatter = /^---\n[\s\S]*?\n(?:---|\.\.\.)(?:\n|$)/.exec(source);
  if (frontmatter) boundaries.push({ from: 0, to: frontmatter[0].length, blocked: true, reason: '不能修改 YAML 元数据' });
  return { pairs, prefixes, suffixes, breaks, boundaries };
}

// Selection changes share the immutable CM document. Cache only source analysis,
// not gesture state or a second editable document.
const documents = new WeakMap<EditorState['doc'], ReturnType<typeof parseUnderlines>>();
function underlines(state: EditorState) {
  let document = documents.get(state.doc);
  if (!document) { document = parseUnderlines(state); documents.set(state.doc, document); }
  return document;
}

function analyze(state: EditorState) {
  const { pairs, prefixes, suffixes, breaks, boundaries } = underlines(state);
  const tags = pairs.flatMap(pair => [pair.open, pair.close]).sort((a, b) => a.from - b.from);
  const { from, to } = state.selection.main;
  const isTag = (pos: number) => tags.some(tag => tag.from <= pos && pos < tag.to);
  const covered = (pos: number) => pairs.some(pair => pair.open.to <= pos && pos < pair.close.from);
  let reason = '';
  for (const boundary of boundaries) {
    if (from >= boundary.to || to <= boundary.from) continue;
    const whole = from <= boundary.from && to >= boundary.to;
    const inside = boundary.inner && from >= boundary.inner.from && to <= boundary.inner.to;
    if (boundary.blocked || (!whole && !inside)) { reason = boundary.reason; break; }
  }
  if (pairs.some(pair => pair.open.from < to && pair.close.to > from && boundaries.some(boundary => boundary.blocked && pair.open.to <= boundary.from && boundary.to <= pair.close.from))) reason = '暂不支持下划线内嵌套其他 HTML 结构';
  if (tags.some(tag => (from > tag.from && from < tag.to) || (to > tag.from && to < tag.to))) reason = '不能切开下划线标签';
  const content: number[] = [];
  for (let number = state.doc.lineAt(from).number; number <= state.doc.lineAt(to).number; number++) {
    const line = state.doc.line(number);
    let body = line.from, end = line.to;
    for (const prefix of prefixes) {
      if (prefix.from >= body && prefix.to <= line.to && !state.sliceDoc(body, prefix.from).trim()) body = prefix.to;
    }
    while (body < line.to && /[ \t]/.test(state.sliceDoc(body, body + 1))) body++;
    const suffix = suffixes.find(mark => mark.from >= body && mark.to <= line.to);
    if (suffix) {
      end = suffix.from;
      while (end > body && /[ \t]/.test(state.sliceDoc(end - 1, end))) end--;
    }
    for (let pos = Math.max(from, body); pos < Math.min(to, end); pos++) if (!isTag(pos) && !breaks.some(mark => mark.from <= pos && pos < mark.to)) content.push(pos);
  }
  return { pairs, tags, content, covered, reason, active: content.length > 0 && content.every(covered) };
}

export function inspectUnderline(state: EditorState) {
  const { active, reason, content } = analyze(state);
  return { active, reason: state.readOnly ? '当前编辑器只读' : state.selection.ranges.length !== 1 ? '仅支持单一选区' : reason || (!content.length ? '请选择正文' : '') };
}

export function toggleUnderline(state: EditorState): TransactionSpec | null {
  const selection = state.selection.main;
  if (state.readOnly || state.selection.ranges.length !== 1 || selection.empty) return null;
  const { pairs, tags, content, covered, active, reason } = analyze(state);
  if (reason || !content.length) return null;
  let from = selection.from, to = selection.to;
  for (const pair of pairs) {
    if (pair.open.from < to && pair.close.to > from) {
      from = Math.min(from, pair.open.from); to = Math.max(to, pair.close.to);
    }
  }
  let insert = '', opened = false, start = 0, end = 0;
  const first = content[0], last = content[content.length - 1], selectedContent = new Set(content);
  for (let pos = from; pos < to; pos++) {
    if (tags.some(tag => tag.from <= pos && pos < tag.to)) continue;
    const selected = selectedContent.has(pos);
    const underline = state.sliceDoc(pos, pos + 1) !== '\n' && (selected ? !active : covered(pos));
    if (underline !== opened) { insert += underline ? '<u>' : '</u>'; opened = underline; }
    if (pos === first) start = from + insert.length;
    insert += state.sliceDoc(pos, pos + 1);
    if (pos === last) end = from + insert.length;
  }
  if (opened) insert += '</u>';
  return {
    annotations: isolateHistory.of('full'),
    userEvent: 'input.underline',
    changes: { from, to, insert },
    selection: EditorSelection.single(selection.anchor <= selection.head ? start : end, selection.anchor <= selection.head ? end : start)
  };
}

/** The widget must be anchored to this exact opening tag, never a text search. */
export function underlineAt(state: EditorState, from: number) {
  return underlines(state).pairs.find(pair => pair.open.from === from);
}

export function underlineMarkers(state: EditorState) {
  return underlines(state).pairs.flatMap(pair => [pair.open, pair.close]);
}
