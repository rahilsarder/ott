/**
 * Inline SVGs rather than an icon package: the set is small and fixed, and this
 * keeps the client bundle free of a dependency for a dozen glyphs.
 */
type IconProps = { className?: string };

const base = (props: IconProps) => ({
  className: props.className,
  viewBox: '0 0 24 24',
  'aria-hidden': true as const,
});

export const PlayIcon = (p: IconProps) => (
  <svg {...base(p)} fill="currentColor">
    <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.29-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
  </svg>
);

export const PauseIcon = (p: IconProps) => (
  <svg {...base(p)} fill="currentColor">
    <path d="M7 4h3v16H7zM14 4h3v16h-3z" />
  </svg>
);

export const PlusIcon = (p: IconProps) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const CheckIcon = (p: IconProps) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="m5 13 4 4L19 7" />
  </svg>
);

export const InfoIcon = (p: IconProps) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 5-7 7 7 7" />
  </svg>
);

export const ChevronRightIcon = (p: IconProps) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 5 7 7-7 7" />
  </svg>
);

export const ChevronDownIcon = (p: IconProps) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const ArrowLeftIcon = (p: IconProps) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </svg>
);

export const SearchIcon = (p: IconProps) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const CloseIcon = (p: IconProps) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const VolumeIcon = (p: IconProps) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 5 6 9H3v6h3l5 4V5Z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
  </svg>
);

export const MuteIcon = (p: IconProps) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 5 6 9H3v6h3l5 4V5Z" />
    <path d="m16 9 5 6M21 9l-5 6" />
  </svg>
);

export const FullscreenIcon = (p: IconProps) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
);

export const FullscreenExitIcon = (p: IconProps) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
  </svg>
);

export const SettingsIcon = (p: IconProps) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </svg>
);

export const SpeedIcon = (p: IconProps) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 15a8 8 0 1 1 16 0" />
    <path d="M12 15 16 9" />
    <circle cx="12" cy="15" r="1.3" fill="currentColor" stroke="none" />
  </svg>
);

export const SubtitlesIcon = (p: IconProps) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M6 10h4M6 14h7M13 10h5" />
  </svg>
);

export const BackTenIcon = (p: IconProps) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4 6 8l5 4" />
    <path d="M6 8h7a6 6 0 1 1-6 6" />
  </svg>
);

export const ForwardTenIcon = (p: IconProps) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="m13 4 5 4-5 4" />
    <path d="M18 8h-7a6 6 0 1 0 6 6" />
  </svg>
);

export const TvIcon = (p: IconProps) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="6" width="20" height="13" rx="2" />
    <path d="m8 3 4 3 4-3" />
  </svg>
);

export const TrashIcon = (p: IconProps) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" />
  </svg>
);

export const PencilIcon = (p: IconProps) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);
