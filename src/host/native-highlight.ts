import type { App, Editor } from 'obsidian';
import type { HighlightColor } from '../formatting/contracts';

// The native context menu calls this editor method with an explicit color.
// It is not in the public Editor types. Keep this version-sensitive host edge
// here; never substitute the generic toggle command for the default color.
type HighlightEditor = Editor & { toggleHighlight: (color: HighlightColor) => void };

export function executeNativeHighlight(app: App, editor: Editor, color: HighlightColor): boolean {
  editor.focus();
  if (app.workspace.activeEditor?.editor !== editor) return false;
  const target = editor as Partial<HighlightEditor>;
  if (typeof target.toggleHighlight !== 'function') return false;
  try { target.toggleHighlight(color); return true; } catch { return false; }
}
