// A table row that a click opens also opens with Enter or Space. A key on a link or a button in the row is that
// control's own key, not the row's.
export function rowKeys(action: () => void) {
  return {
    tabIndex: 0,
    onKeyDown: (e: React.KeyboardEvent<HTMLTableRowElement>) => {
      if (e.target !== e.currentTarget) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        action()
      }
    },
  }
}
