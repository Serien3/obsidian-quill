import type { Editor, TFile } from 'obsidian';

/** External Obsidian workspace event boundary, not a project-module mock. */
export function hostWorkspace(editor: Editor) {
  type Ref = { name: string; callback: () => void };
  const refs = new Set<Ref>();
  let mode: 'source' | 'preview' = 'source';
  const workspace = {
    activeEditor: { editor, file: null as TFile | null, getMode: () => mode },
    on(name: string, callback: () => void) {
      const ref = { name, callback };
      refs.add(ref);
      return ref;
    },
    offref(ref: Ref) { refs.delete(ref); }
  };
  return {
    workspace,
    setMode(value: 'source' | 'preview') { mode = value; },
    emit(name: string) { for (const ref of [...refs]) if (ref.name === name) ref.callback(); }
  };
}
