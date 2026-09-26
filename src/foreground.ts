export const DEFAULT_FOREGROUND_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function shouldRecheckInForeground(
  storedLastSuccess: string | number | null,
  now: number,
  intervalMs: number,
): boolean {
  const lastSuccess = typeof storedLastSuccess === 'number'
    ? storedLastSuccess
    : Number(storedLastSuccess);
  return !Number.isFinite(lastSuccess) || lastSuccess <= 0 || lastSuccess > now || now - lastSuccess >= intervalMs;
}
