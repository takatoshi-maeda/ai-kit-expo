const DEFAULT_COLORS = {
  text: '#374151',
  background: '#ffffff',
  tint: '#0a7ea4',
  icon: '#8b929b',
  border: 'rgba(128, 128, 128, 0.2)',
  sidebarBg: '#ffffff',
  sidebarBorder: '#e5e7eb',
  sidebarSelectedBg: '#eff6ff',
  sidebarHeaderText: '#9ca3af',
  badgeBg: '#f3f4f6',
  badgeText: '#9ca3af',
  runningBadgeBg: '#fef2f2',
  runningBadgeText: '#ef4444',
  overlayBg: 'rgba(0, 0, 0, 0.7)',
  overlayCardBg: '#1e1e1e',
  error: '#dc2626',
  timelineDot: '#22c55e',
  timelineDotBlue: '#3b82f6',
  timelineLabel: '#4b5563',
  timelineArg: '#9ca3af',
  timelineDuration: '#9ca3af',
  authorText: '#374151',
  timestampText: '#b4bcc4',
  systemText: '#8b929b',
  costText: '#9ca3af',
  avatarUser: '#22c55e',
  avatarAgent: '#374151',
  avatarBlue: '#3b82f6',
  avatarPurple: '#8b5cf6',
  avatarRed: '#ef4444',
  avatarOrange: '#f97316',
} as const;

type ThreadUiColorDefaults = typeof DEFAULT_COLORS;

export type ThreadUiColors = {
  [K in keyof ThreadUiColorDefaults]?: string;
};

export function resolveColors(colors?: ThreadUiColors) {
  return { ...DEFAULT_COLORS, ...colors };
}
