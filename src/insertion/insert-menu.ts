import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import type { NativeInsertion } from './contracts';
import { applyInsertion, insertionActions, insertionTarget, type InsertionTarget } from './actions';

/** Per-editor interaction; Markdown editing is delegated to the feature behavior. */
export function lineInsertMenu(host: NativeInsertion, setIcon: (element: HTMLElement, icon: string) => void) {
  const plugin = ViewPlugin.fromClass(class {
    button: HTMLButtonElement;
    menu: HTMLDivElement | null = null;
    target: InsertionTarget | null = null;
    decorations: DecorationSet = Decoration.none;
    destroyed = false;
    releaseContext: (() => void) | null = null;

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
      this.position();
    }

    onResize = () => this.position();
    onWindowExit = () => this.close();
    onPageHide = () => { this.close(); this.destroy(); };
    onVisibilityChange = () => { if (this.view.dom.ownerDocument.visibilityState === 'hidden') this.close(); };

    onFocusIn = (event: FocusEvent) => {
      const node = event.target as Node;
      if (this.target && !this.menu?.contains(node) && !this.button.contains(node)) this.close();
    };

    onOutsideMouseDown = (event: MouseEvent) => {
      const node = event.target as Node;
      if (!this.button.contains(node) && !this.menu?.contains(node)) this.close();
    };

    update(update: ViewUpdate) {
      if (this.target && (update.docChanged || !update.startState.selection.eq(update.state.selection)
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
          const point = this.view.coordsAtPos(line.from);
          const bounds = this.view.dom.getBoundingClientRect();
          if (!point) return null;
          const menu = this.menu;
          const win = this.view.dom.ownerDocument.defaultView!;
          const scroller = this.view.scrollDOM.getBoundingClientRect();
          const visibleTop = Math.max(0, scroller.top);
          const visibleBottom = Math.min(win.innerHeight, scroller.bottom);
          const block = this.view.lineBlockAt(line.from);
          if (this.view.documentTop + block.bottom <= visibleTop || this.view.documentTop + block.top >= visibleBottom) return null;
          const left = bounds.left + 4;
          const buttonVisible = point.bottom > visibleTop && point.top < visibleBottom;
          if (!menu) return { left, top: point.top, buttonVisible, menu, layout: null };
          const list = menu.querySelector<HTMLElement>('.line-insert-list')!;
          const rect = menu.getBoundingClientRect();
          const desired = Math.min(420, list.scrollHeight + rect.height - list.clientHeight);
          // The first visual row may have scrolled out while a wrapped source line is still visible.
          const anchorTop = Math.max(visibleTop, Math.min(point.top, visibleBottom - 24));
          const below = win.innerHeight - 8 - (anchorTop + 24);
          const above = anchorTop - 8;
          const up = below < desired && above > below;
          const height = Math.max(0, Math.min(desired, up ? above : below));
          return { left, top: point.top, buttonVisible, menu, layout: {
            left: Math.max(8, Math.min(left + 24, win.innerWidth - rect.width - 8)),
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
            Object.assign(this.button.style, { left: `${position.left}px`, top: `${position.top}px` });
            if (position.menu === this.menu && position.layout) Object.assign(this.menu!.style, {
              left: `${position.layout.left}px`, top: `${position.layout.top}px`, maxHeight: `${position.layout.height}px`, opacity: '1'
            });
          }
        }
      });
    }

    open(checking = false): boolean {
      if (this.destroyed) return false;
      const target = insertionTarget(this.view.state, host);
      if (!target) return false;
      if (checking) return true;
      if (this.menu) { this.close(); return true; }
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
      this.menu.append(search);
      const list = doc.createElement('div');
      list.className = 'line-insert-list';
      this.menu.append(list);
      let selected: HTMLButtonElement | null = null;
      const select = (item: HTMLButtonElement | null) => {
        selected?.removeAttribute('aria-current');
        selected = item;
        selected?.setAttribute('aria-current', 'true');
        if (selected && list.isConnected) {
          const itemRect = selected.getBoundingClientRect();
          const bounds = list.getBoundingClientRect();
          if (itemRect.top < bounds.top) list.scrollTop -= bounds.top - itemRect.top;
          else if (itemRect.bottom > bounds.bottom) list.scrollTop += itemRect.bottom - bounds.bottom;
        }
      };
      this.menu.addEventListener('keydown', event => {
        if (this.destroyed || this.target !== target || event.isComposing) return;
        if (!['Escape', 'ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.key === 'Escape') {
          this.close();
          this.view.focus();
        } else if (event.key === 'Enter') {
          if (!(event.target as Element).closest('button')?.disabled) selected?.click();
        } else {
          const enabled = [...list.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
          const index = selected ? enabled.indexOf(selected) : -1;
          const next = (index + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length;
          select(enabled[next] ?? null);
        }
      });
      const checked = host.checked(this.view.state);
      const render = () => {
        if (this.destroyed || this.target !== target) return;
        list.replaceChildren();
        const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, '');
        const query = normalize(search.value);
        const matches = insertionActions.filter(action => [action.label, ...action.aliases].some(name => normalize(name).includes(query)));
        if (!matches.length) {
          const empty = doc.createElement('div');
          empty.className = 'line-insert-empty';
          empty.setAttribute('role', 'status');
          empty.textContent = '没有匹配的操作';
          list.append(empty);
        }
        for (const action of matches) {
          if (!query && action.separator) {
            const separator = doc.createElement('div');
            separator.setAttribute('role', 'separator');
            list.append(separator);
          }
          const item = doc.createElement('button');
          item.type = 'button';
          item.disabled = !host.available(action.id, target.editor);
          item.dataset.action = action.id;
          item.setAttribute('aria-label', action.label);
          item.setAttribute('role', 'menuitem');
          const icon = doc.createElement('span');
          icon.className = 'line-insert-icon';
          icon.setAttribute('aria-hidden', 'true');
          setIcon(icon, action.icon);
          const label = doc.createElement('span');
          label.className = 'line-insert-label';
          label.textContent = action.label;
          item.append(icon, label);
          if (checked.has(action.id)) {
            const mark = doc.createElement('span');
            mark.className = 'line-insert-check';
            mark.textContent = '✓';
            mark.setAttribute('aria-label', '当前格式');
            item.append(mark);
          }
          item.addEventListener('focus', () => { if (!item.disabled) select(item); });
          item.addEventListener('click', () => {
            if (this.destroyed || this.target !== target || item.disabled) return;
            this.close();
            applyInsertion(action.id, () => this.destroyed ? null : this.view.state, target, host);
          });
          list.append(item);
        }
        select(list.querySelector<HTMLButtonElement>('button:not(:disabled)'));
        list.scrollTop = 0;
        this.position();
      };
      search.addEventListener('input', render);
      render();
      doc.body.append(this.menu);
      this.releaseContext = host.watchContext(() => { if (this.target === target) this.close(); });
      search.focus({ preventScroll: true });
      this.position();
      return true;
    }

    close(refresh = true) {
      const hadTarget = this.target !== null;
      this.target = null;
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
      this.button.remove();
    }
  }, { decorations: plugin => plugin.decorations });
  return {
    extension: [EditorView.editorAttributes.of({ class: 'line-insert-editor' }), plugin],
    open: (view: EditorView, checking = false): boolean => view.plugin(plugin)?.open(checking) ?? false
  };
}
