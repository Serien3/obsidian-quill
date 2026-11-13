import { expect, test, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { NodeType, Tree } from '@lezer/common';
import { nativeSelection } from '../src/host/native-selection';

vi.mock('@codemirror/language', () => ({ syntaxTree: vi.fn() }));

type Token = { name: string; from: number; to: number };
function fixture(doc: string, tokens: Token[]) {
  const children = tokens.map((token, index) => new Tree(NodeType.define({ name: token.name, id: index + 1 }), [], [], token.to - token.from));
  vi.mocked(syntaxTree).mockReturnValue(new Tree(NodeType.define({ name: 'Document', id: 0 }), children, tokens.map(token => token.from), doc.length));
  return EditorState.create({ doc });
}

// These are host-token query tests, not a replacement Markdown parser. Real
// Obsidian tests verify that the host still supplies these scopes and markers.
for (const [format, scope, markerScope, delimiter] of [
  ['bold', 'strong', 'strong', '**'], ['italic', 'em', 'em', '*'],
  ['strikethrough', 'strikethrough', 'strikethrough', '~~'],
  ['highlight', 'highlight', 'highlight', '=='], ['code', 'inline-code', 'code', '`'],
  ['math', 'math', 'math', '$']
] as const) {
  test(`${format}: host tokens determine display state and complete edge-marker identity`, () => {
    const from = delimiter.length, to = from + 4, end = to + delimiter.length;
    const state = fixture(`${delimiter}word${delimiter} word`, [
      { name: `formatting_formatting-${markerScope}_${scope}`, from: 0, to: from },
      { name: scope, from, to },
      { name: `formatting_formatting-${markerScope}_formatting-${markerScope}-end_${scope}`, from: to, to: end }
    ]);
    expect(nativeSelection.inspect(state, from, to).active.has(format)).toBe(true);
    expect(nativeSelection.inspect(state, 0, end).active.has(format)).toBe(true);
    expect(nativeSelection.inspect(state, from, end + 5).active.has(format)).toBe(false);
    expect(nativeSelection.inspect(state, from, from).active.size).toBe(0);
    expect(nativeSelection.same(state, { from, to }, { from: 0, to: end })).toBe(true);
    expect(nativeSelection.same(state, { from, to }, { from: end + 1, to: end + 5 })).toBe(false);
    if (delimiter.length > 1) expect(nativeSelection.same(state, { from, to }, { from: 1, to: end })).toBe(false);
  });
}

test('nested native scopes can report multiple active formats without any conversion', () => {
  const state = fixture('***word***', [
    { name: 'formatting_formatting-em_formatting-strong_em_strong', from: 0, to: 3 },
    { name: 'em_strong', from: 3, to: 7 },
    { name: 'formatting_formatting-em_formatting-strong_em_strong', from: 7, to: 10 }
  ]);
  expect(nativeSelection.inspect(state, 0, 10).active).toEqual(new Set(['bold', 'italic']));
  expect(nativeSelection.same(state, { from: 3, to: 7 }, { from: 0, to: 10 })).toBe(true);
});

test('literal syntax in code is never interpreted as other formats', () => {
  const state = fixture('`==word==`', [{ name: 'inline-code', from: 0, to: 10 }]);
  const { active, markers } = nativeSelection.inspect(state, 1, 9);
  expect(active).toEqual(new Set(['code']));
  expect(markers).toEqual([]);
});

test('old HTML has no custom parsing, migration or native display-state compatibility', () => {
  const state = fixture('<u>word</u>', []);
  expect(nativeSelection.inspect(state, 3, 7)).toEqual({ active: new Set(), markers: [] });
  expect(nativeSelection.same(state, { from: 3, to: 7 }, { from: 0, to: 11 })).toBe(false);
});
