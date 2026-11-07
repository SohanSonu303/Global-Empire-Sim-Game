import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 20, p: P) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...p,
});

export const IconHome = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-5h4v5" /></svg>
);
export const IconBriefcase = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M3 13h18" /></svg>
);
export const IconChart = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></svg>
);
export const IconGlobe = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" /></svg>
);
export const IconDots = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><circle cx="5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="19" cy="12" r="1.3" fill="currentColor" /></svg>
);
export const IconCash = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 9v.01M18 15v.01" /></svg>
);
export const IconCalendar = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
);
export const IconPause = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M9 5v14M15 5v14" /></svg>
);
export const IconPlay = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M7 5v14l11-7z" fill="currentColor" /></svg>
);
export const IconBack = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M15 5l-7 7 7 7" /></svg>
);
export const IconPlus = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconClose = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IconUsers = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.5.7 4 2.8 4 6" /></svg>
);
export const IconArrowUp = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M12 19V5M5 12l7-7 7 7" /></svg>
);
export const IconTag = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.5" /></svg>
);
export const IconTarget = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></svg>
);
export const IconNews = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M4 5h13v14H6a2 2 0 0 1-2-2z" /><path d="M17 9h3v8a2 2 0 0 1-2 2" /><path d="M8 9h5M8 13h5M8 16h3" /></svg>
);
export const IconBank = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M3 10 12 4l9 6" /><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" /></svg>
);
export const IconSave = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M5 3h11l3 3v15H5z" /><path d="M8 3v5h7V3M8 21v-7h8v7" /></svg>
);
export const IconTrophy = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8M9 18h6" /></svg>
);
export const IconPerson = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></svg>
);
export const IconStats = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M3 17l5-5 4 4 8-8" /><path d="M14 8h6v6" /></svg>
);
export const IconGear = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></svg>
);
export const IconInfo = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.01" /></svg>
);
export const IconChevron = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M9 5l7 7-7 7" /></svg>
);
export const IconBolt = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>
);
export const IconLock = ({ size, ...p }: P) => (
  <svg {...base(size, p)}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
);
