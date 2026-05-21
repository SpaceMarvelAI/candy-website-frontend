// Central SVG icon library — maps name → JSX path(s)
const iconPaths = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1.75"/>
      <rect x="14" y="3" width="7" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1.75"/>
      <rect x="3" y="14" width="7" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1.75"/>
      <rect x="14" y="14" width="7" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1.75"/>
    </>
  ),
  chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>,
  mic: (
    <>
      <rect x="9" y="2" width="6" height="12" rx="3" fill="none" stroke="currentColor" strokeWidth="1.75"/>
      <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" fill="none"/>
    </>
  ),
  flow: (
    <>
      <circle cx="5" cy="6" r="3" fill="none" stroke="currentColor" strokeWidth="1.75"/>
      <circle cx="19" cy="6" r="3" fill="none" stroke="currentColor" strokeWidth="1.75"/>
      <circle cx="12" cy="18" r="3" fill="none" stroke="currentColor" strokeWidth="1.75"/>
      <path d="M5 9v2a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V9" fill="none" stroke="currentColor" strokeWidth="1.75"/>
    </>
  ),
  chart: <path d="M3 3v18h18M7 14l4-4 4 4 5-6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.75"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" fill="none" stroke="currentColor" strokeWidth="1.75"/>
    </>
  ),
  team: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" fill="none" stroke="currentColor" strokeWidth="1.75"/>
      <circle cx="9" cy="7" r="4" fill="none" stroke="currentColor" strokeWidth="1.75"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" fill="none" stroke="currentColor" strokeWidth="1.75"/>
    </>
  ),
  plug: <path d="M9 2v6M15 2v6M7 8h10v4a5 5 0 0 1-5 5 5 5 0 0 1-5-5V8zM12 17v5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>,
  help: (
    <>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.75"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    </>
  ),
  bell: <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>,
  send: <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>,
  spark: <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/>,
  plus: <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>,
  arrowRight: <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>,
  cart: (
    <>
      <circle cx="9" cy="21" r="1" fill="currentColor"/>
      <circle cx="20" cy="21" r="1" fill="currentColor"/>
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    </>
  ),
  money: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.75"/>
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.75"/>
      <path d="M6 8h.01M18 16h.01" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    </>
  ),
  truck: <path d="M1 3h15v13H1zM16 8h4l3 3v5h-7M5.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>,
  health: <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" fill="none"/>,
  hr: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" fill="none" stroke="currentColor" strokeWidth="1.75"/>
      <circle cx="9" cy="7" r="4" fill="none" stroke="currentColor" strokeWidth="1.75"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" fill="none" stroke="currentColor" strokeWidth="1.75"/>
    </>
  ),
  broadcast: (
    <>
      <path d="M5.5 8.5a6.5 6.5 0 0 1 13 0M3 12a9 9 0 0 1 18 0M8 12a4 4 0 0 1 8 0" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      <circle cx="12" cy="19" r="2" fill="currentColor"/>
    </>
  ),
  paperclip: <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>,
  file: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" fill="none"/>
    </>
  ),
  phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>,
  play: <polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/>,
  pause: (
    <>
      <rect x="6" y="4" width="4" height="16" fill="currentColor"/>
      <rect x="14" y="4" width="4" height="16" fill="currentColor"/>
    </>
  ),
  more: (
    <>
      <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
      <circle cx="19" cy="12" r="1.5" fill="currentColor"/>
      <circle cx="5" cy="12" r="1.5" fill="currentColor"/>
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="8" fill="none" stroke="currentColor" strokeWidth="1.75"/>
      <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>,
  filter: <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>,
  export: <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>,
  refresh: <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>,
  zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>,
  upload: <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>,
  brain: <path d="M12 2a3 3 0 0 0-3 3c0 .38.07.73.2 1.05A3.5 3.5 0 0 0 5 9.5c0 .77.25 1.5.67 2.08A3.5 3.5 0 0 0 4 15a3.5 3.5 0 0 0 4 3.46V20a2 2 0 0 0 4 0v-1.54A3.5 3.5 0 0 0 16 15a3.5 3.5 0 0 0-1.67-3.42A3.5 3.5 0 0 0 14.8 6.05 3 3 0 0 0 12 2z" fill="none" stroke="currentColor" strokeWidth="1.75"/>,
  list: (
    <>
      <line x1="8" y1="6" x2="21" y2="6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      <line x1="8" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      <line x1="8" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      <line x1="3" y1="6" x2="3.01" y2="6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="3" y1="12" x2="3.01" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="3" y1="18" x2="3.01" y2="18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    </>
  ),
  expand: <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>,
  logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.75"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    </>
  ),
  moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>,
  x: <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>,
  layers: <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>,
  code: (
    <>
      <polyline points="16 18 22 12 16 6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="8 6 2 12 8 18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    </>
  ),
  livecall: (
    <>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
      <path d="M14.5 3.5a8.5 8.5 0 0 1 6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" fill="none"/>
      <path d="M15.5 6.5a4.5 4.5 0 0 1 3 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" fill="none"/>
    </>
  ),
  flowsnav: (
    <>
      <circle cx="4" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.75"/>
      <circle cx="20" cy="6" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.75"/>
      <circle cx="20" cy="18" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.75"/>
      <path d="M6.5 12C9 12 14 6 17.5 6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      <path d="M6.5 12C9 12 14 18 17.5 18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    </>
  ),
  voicebot: (
    <>
      <line x1="2"  y1="12" x2="2"  y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="6"  y1="8"  x2="6"  y2="16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="10" y1="4"  x2="10" y2="20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="14" y1="7"  x2="14" y2="17" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="18" y1="10" x2="18" y2="14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="22" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    </>
  ),
};

export function Icon({ name, size = 16, className = '', style = {} }) {
  const paths = iconPaths[name];
  if (!paths) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}

export default Icon;
