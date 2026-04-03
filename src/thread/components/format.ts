export function formatTimestampForDisplay(isoString: string): string {
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.valueOf())) return isoString;
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(parsed);
  } catch {
    return parsed.toISOString();
  }
}

export function formatShortTime(isoString: string): string {
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.valueOf())) return '';
  const h = String(parsed.getHours()).padStart(2, '0');
  const m = String(parsed.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function formatShortTimestamp(isoString: string): string {
  const d = new Date(isoString);
  if (Number.isNaN(d.valueOf())) return '';
  const mo = d.getMonth() + 1;
  const da = d.getDate();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${mo}月${da}日 ${h}:${m}`;
}

export function formatDuration(seconds: number): string {
  const n = Math.max(0, Math.floor(seconds));
  const s = n % 60;
  const totalM = Math.floor(n / 60);
  const m = totalM % 60;
  const h = Math.floor(totalM / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}
