import { Menu, type MenuPositionDef } from 'obsidian';
import { highlightColors, type HighlightColor } from '../formatting/contracts';

/** Native Obsidian UI only. The chosen color's formatting belongs to the host. */
export function openHighlightMenu(position: MenuPositionDef, doc: Document, onChoose: (color: HighlightColor) => void, onHide: () => void) {
  const menu = new Menu().setUseNativeMenu(false).setNoIcon();
  for (const { color, label } of highlightColors) {
    const title = doc.createDocumentFragment();
    const swatch = doc.createElement('span');
    swatch.className = 'quill-highlight-swatch';
    swatch.setAttribute('aria-hidden', 'true');
    swatch.style.backgroundColor = color ? `var(--color-${color})` : 'var(--text-highlight-bg)';
    title.append(swatch, doc.createTextNode(label));
    menu.addItem(item => item.setTitle(title).onClick(() => onChoose(color)));
  }
  menu.onHide(onHide);
  menu.showAtPosition(position, doc);
  return () => { menu.hide(); };
}
