import React from 'react';

/**
 * 界面里共用的符号。名字决定图形，尺寸用 size。
 * @param {{ name: string, size?: number }} props
 */
export function Symbol({ name, size = 18 }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    width: size,
    height: size,
    'aria-hidden': true
  };
  if (name === 'home') {
    return <svg {...common}><path d="M5 19V11M12 19V5M19 19v-6" /></svg>;
  }
  if (name === 'tasks') {
    return <svg {...common}><path d="M8 6h11M8 12h11M8 18h11" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></svg>;
  }
  if (name === 'ideas') {
    return (
      <svg {...common}>
        <path d="M7 3.5h6.8L19 8.4V19a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 6 19V5A1.5 1.5 0 0 1 7.5 3.5z" />
        <path d="M13.5 3.8V8.2H18.6" />
        <path d="M9 12h6M9 15.5h6" />
      </svg>
    );
  }
  if (name === 'agent') {
    return <svg {...common}><path d="M5 6h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 3v-3H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" /></svg>;
  }
  if (name === 'open') {
    return <svg {...common}><path d="M14 5h5v5M19 5l-7 7M10 19H5v-5M5 19l7-7" /></svg>;
  }
  if (name === 'settings') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    );
  }
  if (name === 'plus') {
    return <svg {...common}><path d="M12 4v16M4 12h16" /></svg>;
  }
  if (name === 'compose') {
    return (
      <svg {...common}>
        <rect x="4" y="4" width="16" height="16" rx="3.2" />
        <path d="M8.6 15.6 13.4 10.8" />
        <path d="M12.2 9.6 14.6 12" />
        <path d="M14.4 8.4 18.4 4.4" />
      </svg>
    );
  }
  if (name === 'filter') {
    return <svg {...common}><path d="M4 7h16M7 12h10M10 17h4" /></svg>;
  }
  if (name === 'sidebar') {
    return (
      <svg {...common}>
        <rect x="3.25" y="3.25" width="17.5" height="17.5" rx="4" />
        <path d="M8.1 7.2v9.6" strokeWidth="2.6" />
      </svg>
    );
  }
  if (name === 'pin') {
    return (
      <svg {...common}>
      <circle className="pin-head" cx="15.8" cy="6.2" r="2.8" />
      <path d="M14 8.3 5.6 18.3" />
      </svg>
    );
  }
  if (name === 'delete') {
    return (
      <svg {...common}>
        <path d="M9.3 6.35V5.15c0-.55.45-1 1-1h3.4c.55 0 1 .45 1 1v1.2" />
        <rect x="3.25" y="6.35" width="17.5" height="2.55" rx="1.15" />
        <rect x="5.2" y="10.65" width="13.6" height="9.7" rx="1.65" />
        <path d="M10.05 13.25v4.2M13.95 13.25v4.2" />
      </svg>
    );
  }
  if (name === 'expand' || name === 'chevron-down') {
    return <svg {...common}><path d="M6 9l6 6 6-6" /></svg>;
  }
  if (name === 'search') {
    return <svg {...common}><circle cx="11" cy="11" r="6" /><path d="m16 16 3 3" /></svg>;
  }
  if (name === 'download') {
    return (
      <svg {...common}>
        <path d="M12 4v11" />
        <path d="m7 11 5 5 5-5" />
        <path d="M5 15.5V19h14v-3.5" />
      </svg>
    );
  }
  if (name === 'close') {
    return <svg {...common}><path d="M6 6l12 12M18 6 6 18" /></svg>;
  }
  if (name === 'chevron-left') {
    return <svg {...common}><path d="M15 6 9 12l6 6" /></svg>;
  }
  if (name === 'chevron-right') {
    return <svg {...common}><path d="M9 6l6 6-6 6" /></svg>;
  }
  if (name === 'send') {
    return <svg {...common} strokeWidth="2.2"><path d="M12 19V7M7 11l5-5 5 5" /></svg>;
  }
  if (name === 'stop') {
    return <svg {...common} fill="currentColor" stroke="none"><rect x="7" y="7" width="10" height="10" rx="1.5" /></svg>;
  }
  if (name === 'eye') {
    return <svg {...common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
  }
  if (name === 'eye-off') {
    return <svg {...common}><path d="M3 3l18 18M10.5 10.7A2 2 0 0 0 13.3 13.5M9.9 5.2A10.8 10.8 0 0 1 12 5c5 0 9.3 3.1 11 7-1 2.2-2.6 4-4.6 5.3M6.1 6.7C4.2 8 2.7 9.8 2 12c1.7 3.9 6 7 10 7 1.1 0 2.2-.2 3.2-.5" /></svg>;
  }
  if (name === 'clock') {
    return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></svg>;
  }
  if (name === 'copy') {
    return <svg {...common}><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M5 15V5h10" /></svg>;
  }
  if (name === 'check') {
    return <svg {...common}><path d="M5 12.5 9.5 17 19 7" /></svg>;
  }
  if (name === 'edit') {
    return <svg {...common}><path d="M4 20h4l10.5-10.5a1.5 1.5 0 0 0-2.1-2.1L5.9 17.9z" /><path d="M13.2 6.8l2.1 2.1" /></svg>;
  }
  if (name === 'file') {
    return <svg {...common}><path d="M7 3.5h7l3.5 3.5V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" /><path d="M14 3.5V8h3.5" /></svg>;
  }
  if (name === 'history') {
    return (
      <svg {...common}>
        <path d="M12 4a8 8 0 1 1-6.4 3.2" />
        <path d="M5.1 4v4h4" />
        <path d="M12 8.6v3.7l2.5 1.8" />
      </svg>
    );
  }
  if (name === 'sync') {
    return (
      <svg {...common}>
        <path d="M20 12a8 8 0 0 0-14.2-5" />
        <path d="M4 4v5h5" />
        <path d="M4 12a8 8 0 0 0 14.2 5" />
        <path d="M20 20v-5h-5" />
      </svg>
    );
  }
  return <svg {...common}><path d="M9 6l6 6-6 6" /></svg>;
}

/** 侧栏等旧调用仍用 Icon 这个名字。 */
export function Icon(props) {
  return <Symbol {...props} />;
}
