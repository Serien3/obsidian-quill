import { EditorState, StateEffect, StateField, Transaction } from '@codemirror/state';
import { isolateHistory } from '@codemirror/commands';

const grouping = StateEffect.define<boolean>();
const grouped = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(grouping)) value = effect.value;
    return value;
  }
});

/** Only synchronous native edits following query removal belong to this compound edit.
 * CodeMirror's compose event explicitly joins even non-adjacent changes and selection
 * transactions. This is a history annotation, not a simulated DOM composition event.
 * Prepending specs retains the native transaction's effects and other annotations.
 */
export const compoundInsertion = [grouped, EditorState.transactionFilter.of(tr =>
  tr.startState.field(grouped) && tr.docChanged
    ? [{ annotations: [Transaction.userEvent.of('input.type.compose'), Transaction.addToHistory.of(true)] }, tr]
    : tr
)];

export const beginInsertion = [grouping.of(true)];
export const endInsertion = { effects: grouping.of(false), annotations: isolateHistory.of('after') };
export const insertionBoundary = isolateHistory.of('before');
