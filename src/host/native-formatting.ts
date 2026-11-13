import type { App, Editor } from 'obsidian';
import type { NativeFormat } from '../formatting/contracts';

// Obsidian's formatting commands are not exposed by the public Editor.exec API.
// Keep this single, version-sensitive command-manager dependency at the host edge.
type CommandHost = App & {
  commands?: { executeCommandById: (id: string) => boolean };
};

const nativeFormatCommands: Record<NativeFormat, string> = {
  bold: 'editor:toggle-bold', italic: 'editor:toggle-italics',
  strikethrough: 'editor:toggle-strikethrough', clear: 'editor:clear-formatting',
  code: 'editor:toggle-code', math: 'editor:toggle-inline-math',
  internalLink: 'editor:insert-wikilink', externalLink: 'editor:insert-link'
};

export function executeNativeFormatting(app: App, editor: Editor, format: NativeFormat): boolean {
  editor.focus();
  // Never format another pane if focusing the originating editor did not activate it.
  if (app.workspace.activeEditor?.editor !== editor) return false;
  const commands = (app as CommandHost).commands;
  if (!commands || typeof commands.executeCommandById !== 'function') return false;
  return commands.executeCommandById(nativeFormatCommands[format]);
}
