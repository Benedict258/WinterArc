/** All IANA time zones the browser knows, with `current` included even when the list is unavailable. */
export function timezoneList(current: string): string[] {
  let all: string[] = []
  try { all = (Intl as any).supportedValuesOf('timeZone') } catch { /* older browsers */ }
  return all.includes(current) ? all : [current, ...all]
}

export function detectTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
}
