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
  /** Host-confirmed body prefix; null when syntax is unavailable or the caret is in inline code/math. */
  bodyStart(state: EditorState): number | null;
  checked(state: EditorState): ReadonlySet<InsertionAction>;
  available(action: InsertionAction, editor: Editor): boolean;
  /** Focus and recheck before preparing; recheck the prepared target before one command. */
  execute(action: InsertionAction, editor: Editor, isCurrent: () => boolean, prepare?: () => boolean): boolean;
}

