import type { EditorState } from '@codemirror/state';
import type { Editor } from 'obsidian';
import { insertionActions } from './actions';
import type { InsertionAction, NativeInsertion } from './contracts';

/** Shared presentation for the button search field and inline slash query. */
export class InsertionList {
  readonly dom: HTMLDivElement;
  selected: HTMLButtonElement | null = null;

  constructor(doc: Document, readonly host: NativeInsertion,
    readonly setIcon: (element: HTMLElement, icon: string) => void,
    readonly valid: () => boolean, readonly apply: (action: InsertionAction) => void,
    readonly changed: () => void) {
    this.dom = doc.createElement('div');
    this.dom.className = 'line-insert-list';
  }

  select(item: HTMLButtonElement | null) {
    this.selected?.removeAttribute('aria-current');
    this.selected?.removeAttribute('id');
    this.selected = item;
    item?.setAttribute('aria-current', 'true');
    if (item && this.dom.isConnected) {
      const rect = item.getBoundingClientRect(), bounds = this.dom.getBoundingClientRect();
      if (rect.top < bounds.top) this.dom.scrollTop -= bounds.top - rect.top;
      else if (rect.bottom > bounds.bottom) this.dom.scrollTop += rect.bottom - bounds.bottom;
    }
    this.changed();
  }

  move(delta: number) {
    const enabled = [...this.dom.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const index = this.selected ? enabled.indexOf(this.selected) : -1;
    this.select(enabled[(index + delta + enabled.length) % enabled.length] ?? null);
  }

  render(query: string, state: EditorState, editor: Editor) {
    if (!this.valid()) return;
    this.dom.replaceChildren();
    const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, '');
    query = normalize(query);
    const matches = insertionActions.filter(action => [action.label, ...action.aliases].some(name => normalize(name).includes(query)));
    const doc = this.dom.ownerDocument;
    const checked = this.host.checked(state);
    if (!matches.length) {
      const empty = doc.createElement('div');
      empty.className = 'line-insert-empty';
      empty.setAttribute('role', 'status');
      empty.textContent = '没有匹配的操作';
      this.dom.append(empty);
    }
    for (const action of matches) {
      if (!query && action.separator) {
        const separator = doc.createElement('div');
        separator.setAttribute('role', 'separator');
        this.dom.append(separator);
      }
      const item = doc.createElement('button');
      item.type = 'button';
      item.disabled = !this.host.available(action.id, editor);
      item.dataset.action = action.id;
      item.setAttribute('aria-label', action.label);
      item.setAttribute('role', 'menuitem');
      const icon = doc.createElement('span');
      icon.className = 'line-insert-icon';
      icon.setAttribute('aria-hidden', 'true');
      this.setIcon(icon, action.icon);
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
      item.addEventListener('focus', () => { if (this.valid() && this.dom.contains(item) && !item.disabled) this.select(item); });
      item.addEventListener('click', () => { if (this.valid() && this.dom.contains(item) && !item.disabled) this.apply(action.id); });
      this.dom.append(item);
    }
    this.select(this.dom.querySelector<HTMLButtonElement>('button:not(:disabled)'));
    this.dom.scrollTop = 0;
  }
}
