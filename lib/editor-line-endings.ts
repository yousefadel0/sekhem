import { EditorState, Text, type ChangeSpec } from "@codemirror/state"

/** Normalize newly inserted line breaks only; never rewrite the source preimage. */
export function editorLineEndingExtensions(original: string) {
  return [EditorState.lineSeparator.of(original.includes("\r\n") ? "\r\n" : "\n"),
    EditorState.transactionFilter.of(transaction => {
      if (!transaction.docChanged) return transaction
      const changes: ChangeSpec[] = []
      transaction.changes.iterChanges((_fromA, _toA, fromB, toB, inserted) => {
        // With an explicit CRLF separator, pasted LF can remain embedded inside
        // a single Text line. Preserve genuine Text line boundaries as well.
        let embedded = false
        for (let line = 1; line <= inserted.lines; line++) if (/[\r\n]/.test(inserted.line(line).text)) embedded = true
        if (embedded) changes.push({ from: fromB, to: toB, insert: Text.of(inserted.toString().split(/\r\n|\r|\n/)) })
      })
      return changes.length ? [transaction, { changes, sequential: true }] : transaction
    })]
}
