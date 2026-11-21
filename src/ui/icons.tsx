// The line icons of the canvas tools: 14 px, the colour of the text, no fill. A button that holds one keeps its
// accessible name in its aria-label, so the icon carries no text.
const stroke = {
  width: 14,
  height: 14,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export const ZoomInIcon = () => (
  <svg {...stroke}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5 14 14M4.5 7h5M7 4.5v5" />
  </svg>
)

export const ZoomOutIcon = () => (
  <svg {...stroke}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5 14 14M4.5 7h5" />
  </svg>
)

export const FitIcon = () => (
  <svg {...stroke}>
    <path d="M2 5.5V2h3.5M10.5 2H14v3.5M14 10.5V14h-3.5M5.5 14H2v-3.5" />
    <rect x="5.5" y="5.5" width="5" height="5" rx="0.8" />
  </svg>
)

// The map of the view: a frame, and the part of it that the canvas shows.
export const MapIcon = () => (
  <svg {...stroke}>
    <rect x="2" y="2" width="12" height="12" rx="1.5" />
    <rect x="4.5" y="4.5" width="7" height="5" rx="0.6" />
  </svg>
)

// A picture: a frame, a sun, and a hill.
export const ImageIcon = () => (
  <svg {...stroke}>
    <rect x="2" y="3" width="12" height="10" rx="1.5" />
    <circle cx="6" cy="6.5" r="1" />
    <path d="M3 12.5 6.5 8.5 9 11l2-2 2.5 2.5" />
  </svg>
)

// A link: two loops that hold together (the link to this view, to copy).
export const LinkIcon = () => (
  <svg {...stroke}>
    <path d="M6.6 9.4a2.9 2.9 0 0 0 4.1 0l2-2a2.9 2.9 0 0 0-4.1-4.1l-1 1" />
    <path d="M9.4 6.6a2.9 2.9 0 0 0-4.1 0l-2 2a2.9 2.9 0 0 0 4.1 4.1l1-1" />
  </svg>
)

// A book: the guided tours.
export const BookIcon = () => (
  <svg {...stroke}>
    <path d="M2.5 3h3.2a2.3 2.3 0 0 1 2.3 2.3V13a1.8 1.8 0 0 0-1.8-1.8H2.5z" />
    <path d="M13.5 3H10.3A2.3 2.3 0 0 0 8 5.3V13a1.8 1.8 0 0 1 1.8-1.8h3.7z" />
  </svg>
)

// A question mark in a circle: the help.
export const HelpIcon = () => (
  <svg {...stroke}>
    <circle cx="8" cy="8" r="6" />
    <path d="M6.1 6.2a1.95 1.95 0 1 1 2.6 1.85c-.5.2-.7.6-.7 1.1v.35" />
    <path d="M8 12v.01" />
  </svg>
)

// The theme: the screen of the system, the sun of the light, and the moon of the dark.
export const MonitorIcon = () => (
  <svg {...stroke}>
    <rect x="2" y="3" width="12" height="8" rx="1.2" />
    <path d="M8 11v2.5M6 13.5h4" />
  </svg>
)

export const SunIcon = () => (
  <svg {...stroke}>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1" />
  </svg>
)

export const MoonIcon = () => (
  <svg {...stroke}>
    <path d="M14 8.53A6 6 0 1 1 7.47 2a4.67 4.67 0 0 0 6.53 6.53z" />
  </svg>
)

// Play and Pause: the two states of one button.
export const PlayIcon = () => (
  <svg {...stroke}>
    <path d="M5.5 3.3v9.4L12.5 8z" />
  </svg>
)

export const PauseIcon = () => (
  <svg {...stroke}>
    <path d="M6 3.5v9M10 3.5v9" />
  </svg>
)

// A chevron: the direction that a folded panel opens or closes to.
export const ChevronLeftIcon = () => (
  <svg {...stroke}>
    <path d="M9.5 3.5 5 8l4.5 4.5" />
  </svg>
)

export const ChevronRightIcon = () => (
  <svg {...stroke}>
    <path d="M6.5 3.5 11 8l-4.5 4.5" />
  </svg>
)
