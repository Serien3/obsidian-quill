import { Platform, Plugin, editorInfoField, setIcon } from 'obsidian';
import { quillToolbar } from './formatting/toolbar';
import { createFormattingHost } from './host/formatting';
import { createNativeInsertion, createInsertionMenuCommand } from './host/native-insertion';
import { lineInsertMenu } from './insertion/insert-menu';

export default class QuillPlugin extends Plugin {
  onload() {
    if (Platform.isMobile) return;
    const insertion = lineInsertMenu(createNativeInsertion(this.app, editorInfoField), setIcon);
    this.registerEditorExtension(insertion.extension);
    this.addCommand(createInsertionMenuCommand(insertion.open));
    this.registerEditorExtension(quillToolbar(createFormattingHost(this.app)));
  }
}
