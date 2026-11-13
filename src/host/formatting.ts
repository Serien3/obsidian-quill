import { Notice, editorInfoField, editorLivePreviewField, setIcon, type App } from 'obsidian';
import { nativeFormatLabels, type FormattingHost } from '../formatting/contracts';
import { executeNativeFormatting } from './native-formatting';
import { executeNativeHighlight } from './native-highlight';
import { openHighlightMenu } from './highlight-menu';
import { nativeSelection } from './native-selection';

/** Production adapter: resolves the originating editor and supplies host UI. */
export function createFormattingHost(app: App): FormattingHost {
  return {
    executeNativeFormat(state, format) {
      const editor = state.field(editorInfoField).editor;
      if (!editor || !executeNativeFormatting(app, editor, format))
        new Notice(`无法执行 Obsidian 原生${nativeFormatLabels[format]}命令，请确认当前编辑器可用。`);
    },
    executeNativeHighlight(state, color) {
      const editor = state.field(editorInfoField).editor;
      if (!editor || !executeNativeHighlight(app, editor, color))
        new Notice('无法执行 Obsidian 原生高亮，请确认当前编辑器及宿主版本可用。');
    },
    openHighlightMenu,
    isLivePreview: state => state.field(editorLivePreviewField, false) === true,
    selection: nativeSelection,
    setStyleIcon: setIcon
  };
}
