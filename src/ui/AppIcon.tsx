// The app icon (a spine over three racks): the same picture as the favicon in index.html.
export function AppIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="7" style={{ fill: 'var(--accent)' }} />
      <g style={{ fill: 'var(--panel)' }}>
        <rect x="6" y="6" width="20" height="5" rx="2" />
        <rect x="5" y="19" width="6" height="7" rx="1.5" />
        <rect x="13" y="19" width="6" height="7" rx="1.5" />
        <rect x="21" y="19" width="6" height="7" rx="1.5" />
        <path d="M7 11h2v8H7zM15 11h2v8h-2zM23 11h2v8h-2z" />
      </g>
    </svg>
  )
}
