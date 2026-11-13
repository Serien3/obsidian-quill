import { EditorSelection, type EditorState } from '@codemirror/state';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { renderedUnderlineSelection } from './underline-selection';
import { inspectUnderline, toggleUnderline, underlineMarkers } from './underline';
import { nativeFormatLabels, type NativeFormat, type NativeToggle, type FormattingHost } from './contracts';

const actions = [
  { format: 'highlight', icon: 'highlighter', glyph: '▣' },
  { format: 'bold', icon: 'bold', glyph: 'B' },
  { format: 'italic', icon: 'italic', glyph: 'I' },
  { format: 'underline', icon: 'underline', glyph: 'U' },
  { format: 'clear', icon: 'remove-formatting', glyph: 'Tx' },
  { format: 'internalLink', icon: 'link', glyph: '↗' },
  { format: 'externalLink', icon: 'external-link', glyph: '↗' },
  { format: 'strikethrough', icon: 'strikethrough', glyph: 'S' },
  { format: 'code', icon: 'code', glyph: '</>' },
  { format: 'math', icon: 'sigma', glyph: '∑' }
] as const;

export function quillToolbar(options: FormattingHost) {
  const { renderedUnderline, renderedUnderlinePoint, readRenderedUnderlineSelection } = renderedUnderlineSelection(options.selection.underlineWidget);
  return ViewPlugin.fromClass(class {
    toolbar: HTMLDivElement | null = null;
    highlightMenu: { state: EditorState; close: (() => void) | null } | null = null;
    pendingMouse = false;
    renderedMouse = false;
    gestureDoc: EditorState['doc'] | null = null;
    gestureAnchor: number | null = null;
    mouseEpoch = 0;
    destroyed = false;
    applying = false;
    scrollTop = 0;
    scrollLeft = 0;
    constructor(readonly view: EditorView) {
      view.dom.ownerDocument.addEventListener('mouseup', this.onMouseUp, true);
      view.contentDOM.addEventListener('mousedown', this.onMouseDown, true);
      view.dom.ownerDocument.addEventListener('mousedown', this.onOutsideMouseDown, true);
      view.dom.ownerDocument.addEventListener('keydown', this.onKeyDown);
      view.scrollDOM.addEventListener('scroll', this.onScroll, true);
      view.contentDOM.addEventListener('beforeinput', this.onBeforeInput);
    }
    hide = () => { this.toolbar?.remove(); this.toolbar = null; };
    closeHighlightMenu() {
      const menu = this.highlightMenu;
      this.highlightMenu = null;
      menu?.close?.();
    }
    cancelMouse() { this.pendingMouse = false; this.renderedMouse = false; this.gestureDoc = null; this.gestureAnchor = null; this.mouseEpoch++; }
    onBeforeInput = () => { this.closeHighlightMenu(); this.cancelMouse(); this.hide(); };
    onOutsideMouseDown = (event: MouseEvent) => {
      if (!this.view.contentDOM.contains(event.target as Node)) this.cancelMouse();
      if (!this.toolbar?.contains(event.target as Node)) this.hide();
    };
    onScroll = () => {
      if (this.view.scrollDOM.scrollTop !== this.scrollTop || this.view.scrollDOM.scrollLeft !== this.scrollLeft) {
        this.closeHighlightMenu(); this.cancelMouse(); this.hide();
      }
    };
    onKeyDown = (event: KeyboardEvent) => {
      this.cancelMouse();
      if (event.key === 'Escape') { this.closeHighlightMenu(); this.hide(); }
    };
    update(update: ViewUpdate) {
      if (this.applying) return;
      if (update.docChanged || !options.isLivePreview(update.state)) {
        this.closeHighlightMenu();
        this.cancelMouse(); this.hide(); return;
      }
      if (this.highlightMenu) {
        const before = this.highlightMenu.state.selection.main, after = update.state.selection;
        if (update.state.readOnly || after.ranges.length !== 1 || !options.selection.same(update.state, before, after.main, underlineMarkers(update.state))) this.closeHighlightMenu();
      }
      if (!this.toolbar) return;
      if (!update.startState.selection.eq(update.state.selection)) {
        const before = update.startState.selection, after = update.state.selection;
        if (before.ranges.length !== 1 || after.ranges.length !== 1 || !options.selection.same(update.state, before.main, after.main, underlineMarkers(update.state))) {
          this.hide(); return;
        }
        this.refreshButtons();
      }
      this.position();
    }
    onMouseDown = (event: MouseEvent) => {
      this.closeHighlightMenu(); this.cancelMouse(); this.hide();
      if (event.button !== 0 || !options.isLivePreview(this.view.state)) return;
      const rendered = renderedUnderline(this.view, event.target as Node);
      if ((event.target as Element).closest('[contenteditable="false"]') && !rendered) return;
      if (rendered) {
        // Let the browser select widget text, but do not let the host replace
        // the widget with an unrelated whole-block selection on mousedown.
        event.stopPropagation();
        this.renderedMouse = true;
        this.gestureDoc = this.view.state.doc;
      }
      this.gestureDoc = this.view.state.doc;
      this.gestureAnchor = rendered ? null : this.view.posAtCoords({ x: event.clientX, y: event.clientY });
      this.scrollTop = this.view.scrollDOM.scrollTop;
      this.scrollLeft = this.view.scrollDOM.scrollLeft;
      this.pendingMouse = true;
    };
    onMouseUp = (event: MouseEvent) => {
      if (!this.pendingMouse || event.button !== 0) return;
      this.pendingMouse = false;
      const startedRendered = this.renderedMouse;
      this.renderedMouse = false;
      if (this.gestureDoc !== this.view.state.doc) return;
      const head = !startedRendered ? renderedUnderlinePoint(this.view, event.clientX, event.clientY) : null;
      const selection = head !== null && this.gestureAnchor !== null && head !== this.gestureAnchor
        ? EditorSelection.single(this.gestureAnchor, head) : readRenderedUnderlineSelection(this.view);
      this.gestureDoc = null;
      this.gestureAnchor = null;
      if (startedRendered || selection) {
        event.stopPropagation();
        if (!selection) return;
        this.view.dispatch({ selection });
      }
      const epoch = this.mouseEpoch;
      queueMicrotask(() => { if (!this.destroyed && epoch === this.mouseEpoch) this.show(); });
    };
    show() {
      const selection = this.view.state.selection;
      if (!options.isLivePreview(this.view.state) || selection.ranges.length !== 1 || selection.main.empty) return;
      this.hide();
      this.scrollTop = this.view.scrollDOM.scrollTop;
      this.scrollLeft = this.view.scrollDOM.scrollLeft;
      const doc = this.view.dom.ownerDocument;
      this.toolbar = doc.createElement('div');
      this.toolbar.className = 'quill-toolbar';
      this.toolbar.style.cssText = 'position:fixed;display:flex;width:max-content;z-index:1000;visibility:hidden';
      this.toolbar.setAttribute('role', 'toolbar');
      this.toolbar.setAttribute('aria-label', '选中文字格式');
      for (const action of actions) {
        const button = doc.createElement('button');
        button.type = 'button'; button.textContent = action.glyph;
        options.setStyleIcon?.(button, action.icon);
        if (action.format === 'underline') {
          button.setAttribute('aria-label', '下划线');
          button.title = '下划线';
          button.addEventListener('mousedown', event => event.preventDefault());
          button.addEventListener('click', () => this.runUnderline());
        } else if (action.format === 'highlight') {
          button.setAttribute('aria-label', '高亮');
          button.setAttribute('aria-haspopup', 'menu');
          button.title = '高亮颜色（Obsidian 原生）';
          button.addEventListener('mousedown', event => event.preventDefault());
          button.addEventListener('click', () => this.runHighlight(button));
        } else {
          const format = action.format;
          const label = nativeFormatLabels[format];
          button.dataset.nativeFormat = format;
          button.setAttribute('aria-label', label); button.title = `${label}（Obsidian 原生）`;
          button.addEventListener('mousedown', event => event.preventDefault());
          button.addEventListener('click', () => this.runNativeFormat(format));
        }
        this.toolbar.append(button);
      }
      this.refreshButtons();
      doc.body.append(this.toolbar);
      this.position();
    }
    runUnderline() {
      this.view.focus();
      if (!options.isLivePreview(this.view.state)) return;
      const transaction = toggleUnderline(this.view.state);
      if (!transaction) return;
      this.applying = true;
      try { this.view.dispatch(transaction); } finally { this.applying = false; }
      this.refreshButtons();
      this.position();
    }
    runHighlight(button: HTMLButtonElement) {
      this.view.focus();
      const state = this.view.state;
      if (!options.isLivePreview(state) || state.readOnly || state.selection.ranges.length !== 1 || state.selection.main.empty) return;
      this.closeHighlightMenu();
      const rect = button.getBoundingClientRect();
      this.cancelMouse(); this.hide();
      const menu = { state: this.view.state, close: null as (() => void) | null };
      this.highlightMenu = menu;
      menu.close = options.openHighlightMenu({ x: rect.left, y: rect.bottom }, this.view.dom.ownerDocument,
        color => {
          if (this.highlightMenu !== menu) return;
          this.highlightMenu = null;
          options.executeNativeHighlight(this.view.state, color);
        }, () => { if (this.highlightMenu === menu) this.highlightMenu = null; });
    }
    runNativeFormat(format: NativeFormat) {
      this.view.focus();
      if (format === 'internalLink' || format === 'externalLink') {
        this.cancelMouse(); this.hide();
        options.executeNativeFormat(this.view.state, format);
        return;
      }
      this.applying = true;
      try { options.executeNativeFormat(this.view.state, format); } finally { this.applying = false; }
      if (this.view.state.selection.main.empty) { this.hide(); return; }
      this.refreshButtons();
      this.position();
    }
    refreshButtons() {
      const underline = this.toolbar!.querySelector<HTMLButtonElement>('[aria-label="下划线"]')!;
      const status = inspectUnderline(this.view.state);
      underline.setAttribute('aria-pressed', String(status.active));
      underline.disabled = Boolean(status.reason);
      underline.title = status.reason || '下划线';
      const { from, to } = this.view.state.selection.main;
      const { active } = options.selection.inspect(this.view.state, from, to);
      const highlight = this.toolbar!.querySelector<HTMLButtonElement>('[aria-label="高亮"]')!;
      highlight.setAttribute('aria-pressed', String(active.has('highlight')));
      highlight.disabled = this.view.state.readOnly;
      for (const button of this.toolbar!.querySelectorAll<HTMLButtonElement>('[data-native-format]')) {
        const format = button.dataset.nativeFormat as NativeFormat;
        if (['bold', 'italic', 'strikethrough', 'code', 'math'].includes(format))
          button.setAttribute('aria-pressed', String(active.has(format as NativeToggle)));
      }
    }
    position() {
      if (!this.toolbar) return;
      this.view.requestMeasure({
        key: this,
        read: () => this.measurePosition(),
        write: position => {
          if (this.destroyed || !this.toolbar) return;
          if (!position) { this.hide(); return; }
          const { left, top, maxWidth, maxHeight } = position;
          const constraintsChanged = this.toolbar.style.maxWidth !== maxWidth || this.toolbar.style.maxHeight !== maxHeight;
          Object.assign(this.toolbar.style, { left, top, maxWidth, maxHeight, overflow: 'auto', visibility: 'visible' });
          if (constraintsChanged) this.position();
        }
      });
    }
    measurePosition() {
      if (this.destroyed || !this.toolbar) return null;
      const { from, to } = this.view.state.selection.main;
      const start = this.view.coordsAtPos(from), end = this.view.coordsAtPos(to);
      if (!start || !end) return null;
      const bounds = this.view.dom.getBoundingClientRect();
      const viewport = this.view.dom.ownerDocument.documentElement;
      const left = Math.max(0, bounds.left), right = Math.min(viewport.clientWidth, bounds.right);
      const top = Math.max(0, bounds.top), bottom = Math.min(viewport.clientHeight, bounds.bottom);
      const maxWidth = Math.max(0, right - left), maxHeight = Math.max(0, bottom - top);
      const rect = this.toolbar.getBoundingClientRect();
      const width = Math.min(rect.width, maxWidth), height = Math.min(rect.height, maxHeight);
      const x = Math.max(left, Math.min((start.left + end.right) / 2 - width / 2, right - width));
      const preferredTop = start.top - height - 8;
      const y = Math.max(top, Math.min(preferredTop >= top ? preferredTop : end.bottom + 8, bottom - height));
      return { left: `${x}px`, top: `${y}px`, maxWidth: `${maxWidth}px`, maxHeight: `${maxHeight}px` };
    }
    destroy() {
      this.destroyed = true;
      this.closeHighlightMenu();
      this.view.contentDOM.removeEventListener('mousedown', this.onMouseDown, true);
      this.view.dom.ownerDocument.removeEventListener('mousedown', this.onOutsideMouseDown, true);
      this.view.dom.ownerDocument.removeEventListener('keydown', this.onKeyDown);
      this.view.scrollDOM.removeEventListener('scroll', this.onScroll, true);
      this.view.contentDOM.removeEventListener('beforeinput', this.onBeforeInput);
      this.view.dom.ownerDocument.removeEventListener('mouseup', this.onMouseUp, true);
      this.hide();
    }
  });
}
