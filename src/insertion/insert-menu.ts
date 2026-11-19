import { Prec } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import type { NativeInsertion } from './contracts';
import { InsertionList } from './menu-list';
import { compoundInsertion } from './compound-edit';
import { applyInsertion, applySlashInsertion, insertionTarget, type InsertionTarget } from './actions';

/** Per-editor interaction; Markdown editing is delegated to the feature behavior. */
export function lineInsertMenu(host: NativeInsertion, setIcon: (element: HTMLElement, icon: string) => void) {
  const plugin = ViewPlugin.fromClass(class {
    button: HTMLButtonElement;
    menu: HTMLDivElement | null = null;
    target: InsertionTarget | null = null;
    decorations: DecorationSet = Decoration.none;
    destroyed = false;
    slash: { from: number; to: number } | null = null;
    list: InsertionList | null = null;
    compositionContext: EventTarget | null = null;
    releaseContext: (() => void) | null = null;
    resizeObserver: ResizeObserver;
    measuredLine: Element | null = null;

    constructor(readonly view: EditorView) {
      const doc = view.dom.ownerDocument;
      this.button = doc.createElement('button');
      this.button.type = 'button';
      this.button.className = 'line-insert-button';
      this.button.textContent = '+';
      this.button.setAttribute('aria-label', '打开插入菜单');
      this.button.setAttribute('aria-haspopup', 'menu');
      this.button.style.cssText = 'position:fixed;visibility:hidden';
      this.button.addEventListener('mousedown', event => event.preventDefault());
      this.button.addEventListener('click', () => this.open());
      doc.body.append(this.button);
      doc.addEventListener('mousedown', this.onOutsideMouseDown, true);
      doc.defaultView!.addEventListener('blur', this.onWindowExit);
      doc.defaultView!.addEventListener('pagehide', this.onPageHide);
      doc.defaultView!.addEventListener('resize', this.onResize);
      doc.addEventListener('focusin', this.onFocusIn, true);
      doc.addEventListener('visibilitychange', this.onVisibilityChange);
      doc.addEventListener('scroll', this.onResize, true);
      this.resizeObserver = new doc.defaultView!.ResizeObserver(this.onResize);
      this.resizeObserver.observe(view.dom);
      this.resizeObserver.observe(view.contentDOM);
      this.position();
    }

    onCompositionEnd = () => {
      const slash = this.slash;
      queueMicrotask(() => { if (!this.destroyed && slash && this.slash === slash) this.renderSlash(); });
    };
    onResize = () => this.position();
    onWindowExit = () => this.close();
    onPageHide = () => { this.close(); this.destroy(); };
    onVisibilityChange = () => { if (this.view.dom.ownerDocument.visibilityState === 'hidden') this.close(); };

    onFocusIn = (event: FocusEvent) => {
      const node = event.target as Node;
      if (this.target && !this.menu?.contains(node) && !this.button.contains(node)
        && !(this.slash && this.view.dom.contains(node))) this.close();
    };

    onOutsideMouseDown = (event: MouseEvent) => {
      const node = event.target as Node;
      if (!this.button.contains(node) && !this.menu?.contains(node)) this.close();
    };

    update(update: ViewUpdate) {
      if (this.target && this.slash) {
        const slash = this.slash;
        let to = slash.to;
        let valid = true;
        for (const tr of update.transactions) {
          if (!tr.docChanged) continue;
          const typing = tr.isUserEvent('input.type') || tr.isUserEvent('delete.backward') || tr.isUserEvent('input.paste');
          if (!typing || tr.isUserEvent('undo') || tr.isUserEvent('redo')) valid = false;
          tr.changes.iterChanges((from, end, _a, _b, inserted) => {
            if (from <= slash.from || end > to || end !== to || inserted.lines > 1) valid = false;
          });
          to = tr.changes.mapPos(to, 1);
        }
        const state = update.state;
        const target = insertionTarget(state, host);
        if (!valid || !target || host.bodyStart(state) === null || target.editor !== this.target.editor || state.selection.main.head !== to
          || state.doc.sliceString(slash.from, slash.from + 1) !== '/') this.close(false);
        else {
          slash.to = to;
          this.target = target;
          if (update.docChanged && !this.view.composing) this.renderSlash();
        }
      } else if (this.target && (update.docChanged || !update.startState.selection.eq(update.state.selection)
        || insertionTarget(update.state, host)?.editor !== this.target.editor)) this.close(false);
      this.decorations = this.target
        ? Decoration.set([Decoration.line({ class: 'line-insert-target' }).range(update.state.doc.lineAt(update.state.selection.main.head).from)])
        : Decoration.none;
      this.position();
    }

    position() {
      this.view.requestMeasure({
        key: this,
        read: () => {
          if (this.destroyed || (!this.view.hasFocus && !this.menu) || !insertionTarget(this.view.state, host)) return null;
          const line = this.view.state.doc.lineAt(this.view.state.selection.main.head);
          const firstRow = this.view.coordsAtPos(line.from);
          const point = this.slash ? this.view.coordsAtPos(this.slash.from) : firstRow;
          if (!point || !firstRow) return null;
          const node = this.view.domAtPos(line.from).node;
          const lineElement = (node.nodeType === 1 ? node as Element : node.parentElement)?.closest('.cm-line');
          if (!lineElement) return null;
          const menu = this.menu;
          const win = this.view.dom.ownerDocument.defaultView!;
          const scroller = this.view.scrollDOM.getBoundingClientRect();
          const visibleTop = Math.max(0, scroller.top);
          const visibleBottom = Math.min(win.innerHeight, scroller.bottom);
          if (this.slash && (point.bottom <= visibleTop || point.top >= visibleBottom)) return null;
          const block = this.view.lineBlockAt(line.from);
          if (this.view.documentTop + block.bottom <= visibleTop || this.view.documentTop + block.top >= visibleBottom) return null;
          // Hosts can inset individual line boxes inside a full-width contentDOM.
          // Their outer edge excludes hanging list indentation and inline markers.
          const columnLeft = lineElement.getBoundingClientRect().left;
          const button = this.button.getBoundingClientRect();
          const left = columnLeft - 16 - button.width;
          const top = (firstRow.top + firstRow.bottom - button.height) / 2;
          const gutters = this.view.dom.querySelector('.cm-gutters')?.getBoundingClientRect();
          const availableLeft = Math.max(0, this.view.dom.getBoundingClientRect().left, scroller.left, gutters?.right ?? 0);
          const buttonVisible = left >= availableLeft && left + button.width <= Math.min(scroller.right, win.innerWidth)
            && firstRow.bottom > visibleTop && firstRow.top < visibleBottom
            && top >= visibleTop && top + button.height <= visibleBottom;
          if (!menu) return { left, top, buttonVisible, menu, layout: null, lineElement };
          const list = menu.querySelector<HTMLElement>('.line-insert-list')!;
          const rect = menu.getBoundingClientRect();
          const desired = Math.min(420, list.scrollHeight + rect.height - list.clientHeight);
          // The first visual row may have scrolled out while a wrapped source line is still visible.
          const anchorTop = Math.max(visibleTop, Math.min(this.slash ? point.top : top, visibleBottom - 24));
          const below = win.innerHeight - 8 - (anchorTop + 24);
          const above = anchorTop - 8;
          const up = below < desired && above > below;
          const height = Math.max(0, Math.min(desired, up ? above : below));
          return { left, top, buttonVisible, menu, lineElement, layout: {
            left: Math.max(8, Math.min(this.slash ? point.left : left + button.width, win.innerWidth - rect.width - 8)),
            top: up ? anchorTop - height : anchorTop + 24,
            height
          } };
        },
        write: position => {
          if (this.destroyed) return;
          this.button.style.visibility = position?.buttonVisible ? 'visible' : 'hidden';
          if (!position && this.target) {
            const target = this.target;
            // CodeMirror is still measuring; dispatch only once that update finishes.
            queueMicrotask(() => { if (!this.destroyed && this.target === target) this.close(); });
          }
          if (position) {
            if (this.measuredLine !== position.lineElement) {
              if (this.measuredLine) this.resizeObserver.unobserve(this.measuredLine);
              this.measuredLine = position.lineElement;
              this.resizeObserver.observe(this.measuredLine);
            }
            Object.assign(this.button.style, { left: `${position.left}px`, top: `${position.top}px` });
            if (position.menu === this.menu && position.layout) Object.assign(this.menu!.style, {
              left: `${position.layout.left}px`, top: `${position.layout.top}px`, maxHeight: `${position.layout.height}px`, opacity: '1'
            });
          }
        }
      });
    }

    open(checking = false, slashFrom?: number): boolean {
      if (this.destroyed) return false;
      const target = insertionTarget(this.view.state, host);
      if (!target) return false;
      if (checking) return true;
      if (this.menu) {
        this.close();
        if (slashFrom === undefined) return true;
      }
      this.slash = slashFrom === undefined ? null : { from: slashFrom, to: this.view.state.selection.main.head };
      this.target = target;
      this.view.dispatch({});
      const doc = this.view.dom.ownerDocument;
      this.menu = doc.createElement('div');
      this.menu.className = 'line-insert-menu';
      this.menu.setAttribute('role', 'menu');
      this.menu.setAttribute('aria-label', '插入');
      this.menu.style.cssText = 'position:fixed;left:0;top:0;z-index:1000;opacity:0';
      const search = doc.createElement('input');
      search.type = 'search';
      search.placeholder = '搜索……';
      search.setAttribute('aria-label', '搜索操作');
      if (!this.slash) this.menu.append(search);
      const menu = this.menu;
      const valid = () => !this.destroyed && this.menu === menu;
      const list = this.list = new InsertionList(doc, host, setIcon, valid, action => {
        const current = this.target;
        if (!current || !valid()) return;
        const slash = this.slash;
        this.close();
        if (slash) applySlashInsertion(action, this.view, current, slash.from, slash.to, host, () => !this.destroyed);
        else applyInsertion(action, () => this.destroyed ? null : this.view.state, current, host);
      }, () => { this.updateActiveItem(); this.position(); });
      this.menu.append(list.dom);
      this.menu.addEventListener('mousedown', event => { if (this.slash) event.preventDefault(); });
      this.menu.addEventListener('keydown', event => {
        if (!valid() || event.isComposing) return;
        if (!['Escape', 'ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.key === 'Escape') { this.close(); this.view.focus(); }
        else if (event.key === 'Enter') {
          if (!(event.target as Element).closest('button')?.disabled) list.selected?.click();
        } else list.move(event.key === 'ArrowDown' ? 1 : -1);
      });
      const render = () => {
        if (valid()) list.render(search.value, this.view.state, this.target!.editor);
      };
      search.addEventListener('input', render);
      render();
      doc.body.append(this.menu);
      this.releaseContext = host.watchContext(() => { if (valid()) this.close(); });
      if (!this.slash) search.focus({ preventScroll: true });
      else {
        // Chromium's public EditContext emits composition events on itself, not
        // contentDOM. DOM compositionend remains the path in other engines.
        this.compositionContext = (this.view.contentDOM as HTMLElement & { editContext?: EventTarget | null }).editContext ?? null;
        this.compositionContext?.addEventListener('compositionend', this.onCompositionEnd);
        this.updateActiveItem();
      }
      this.position();
      return true;
    }

    renderSlash() {
      if (this.slash && this.target) this.list?.render(
        this.view.state.doc.sliceString(this.slash.from + 1, this.slash.to), this.view.state, this.target.editor);
    }

    updateActiveItem() {
      if (!this.slash || !this.menu) return;
      const doc = this.view.dom.ownerDocument;
      if (!this.menu.id) {
        let id = 0;
        while (doc.getElementById(`quill-slash-${id}`)) id++;
        this.menu.id = `quill-slash-${id}`;
      }
      const item = this.list?.selected;
      if (item) {
        item.id = `${this.menu.id}-active`;
        this.view.contentDOM.setAttribute('aria-activedescendant', item.id);
      } else this.view.contentDOM.removeAttribute('aria-activedescendant');
      this.view.contentDOM.setAttribute('aria-controls', this.menu.id);
      this.view.contentDOM.setAttribute('aria-owns', this.menu.id);
    }

    keydown(event: KeyboardEvent): boolean {
      if (!this.slash || event.isComposing || this.view.composing || event.keyCode === 229) return false;
      if (event.key === 'Tab') { this.close(); return false; }
      if (event.key === 'Escape') { this.close(); return true; }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        this.list?.move(event.key === 'ArrowDown' ? 1 : -1);
        return true;
      }
      if (event.key === 'Enter') {
        if (!this.list?.selected) { this.close(); return false; }
        this.list.selected.click();
        return true;
      }
      return false;
    }

    close(refresh = true) {
      const hadTarget = this.target !== null;
      this.target = null;
      if (this.slash) {
        this.view.contentDOM.removeAttribute('aria-activedescendant');
        this.view.contentDOM.removeAttribute('aria-controls');
        this.view.contentDOM.removeAttribute('aria-owns');
      }
      this.slash = null;
      this.compositionContext?.removeEventListener('compositionend', this.onCompositionEnd);
      this.compositionContext = null;
      this.list = null;
      this.releaseContext?.();
      this.releaseContext = null;
      this.menu?.remove();
      this.menu = null;
      if (refresh && hadTarget && !this.destroyed) this.view.dispatch({});
    }

    destroy() {
      this.destroyed = true;
      this.close();
      this.view.dom.ownerDocument.removeEventListener('mousedown', this.onOutsideMouseDown, true);
      this.view.dom.ownerDocument.defaultView!.removeEventListener('blur', this.onWindowExit);
      this.view.dom.ownerDocument.defaultView!.removeEventListener('pagehide', this.onPageHide);
      this.view.dom.ownerDocument.defaultView!.removeEventListener('resize', this.onResize);
      this.view.dom.ownerDocument.removeEventListener('focusin', this.onFocusIn, true);
      this.view.dom.ownerDocument.removeEventListener('visibilitychange', this.onVisibilityChange);
      this.view.dom.ownerDocument.removeEventListener('scroll', this.onResize, true);
      this.resizeObserver.disconnect();
      this.button.remove();
    }
  }, { decorations: plugin => plugin.decorations });
  return {
    extension: [compoundInsertion, plugin,
      Prec.highest(EditorView.domEventHandlers({
        keydown: (event, view) => view.plugin(plugin)?.keydown(event) ?? false,
        compositionend: (_event, view) => {
          view.plugin(plugin)?.onCompositionEnd();
        }
      })),
      EditorView.inputHandler.of((view, from, to, text, insert) => {
        if (text !== '/' || from !== to || view.composing || !insertionTarget(view.state, host)) return false;
        const bodyStart = host.bodyStart(view.state);
        if (bodyStart === null || (from !== bodyStart && (from === 0 || !/\s/u.test(view.state.doc.sliceString(from - 1, from))))) return false;
        const instance = view.plugin(plugin);
        if (!instance || instance.destroyed) return false;
        const tr = insert();
        if (!tr.isUserEvent('input.type') || tr.isUserEvent('input.type.compose')) return false;
        view.dispatch(tr);
        if (view.state.doc === tr.newDoc && view.state.selection.eq(tr.newSelection)) instance.open(false, from);
        return true;
      })],
    open: (view: EditorView, checking = false): boolean => view.plugin(plugin)?.open(checking) ?? false
  };
}
