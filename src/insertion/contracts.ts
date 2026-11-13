import type { EditorState } from '@codemirror/state';
import type { Editor } from 'obsidian';

export type InsertionAction = 'text' | 'heading1' | 'heading2' | 'heading3' | 'heading4' | 'heading5' | 'heading6'
  | 'bulletList' | 'orderedList' | 'task' | 'code' | 'quote' | 'callout' | 'math' | 'table' | 'divider';

/** Host capabilities, not the line-menu's target/cancellation policy. */
export interface NativeInsertion {
  /** Subscribe to context exit; release must disable pending notifications. */
  watchContext(onChange: () => void): () => void;
  source(state: EditorState): Editor | null;
  region(state: EditorState): 'text' | 'code' | 'math' | 'table' | 'properties' | 'unknown';
  checked(state: EditorState): ReadonlySet<InsertionAction>;
  available(action: InsertionAction, editor: Editor): boolean;
  /** Recheck availability and isCurrent after focus, before exactly one command. */
  execute(action: InsertionAction, editor: Editor, isCurrent: () => boolean): boolean;
}

