import { Language, defineLanguageFacet } from '@codemirror/language';
import { Parser, NodeType, Tree, type Input, type PartialParse } from '@lezer/common';

/** Artificial Obsidian syntax snapshots, not a Markdown parser or host acceptance. */
export function hostLanguage(lines: readonly (readonly string[])[] = []) {
  const parser = new class extends Parser {
    createParse(input: Input): PartialParse {
      const children: Tree[] = [], positions: number[] = [];
      let from = 0, id = 1;
      for (const [index, text] of input.read(0, input.length).split('\n').entries()) {
        for (const name of lines[index] ?? []) {
          children.push(new Tree(NodeType.define({ id: id++, name }), [], [], text.length));
          positions.push(from);
        }
        from += text.length + 1;
      }
      const tree = new Tree(NodeType.define({ id: 0, name: 'Document', top: true }), children, positions, input.length);
      return { parsedPos: input.length, stoppedAt: null, stopAt() {}, advance: () => tree };
    }
  }();
  return new Language(defineLanguageFacet(), parser).extension;
}
