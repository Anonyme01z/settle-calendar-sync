// Utilities for date calculations in a specific IANA timezone without extra deps
// We work with date-only strings in the format YYYY-MM-DD.

// Format a date parts triple to YYYY-MM-DD
function toDateStr(y: number, m: number, d: number): string {
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

// Get today's date in the given timezone as YYYY-MM-DD
export function getTodayStrTZ(timeZone: string): string {
  // Use Intl.DateTimeFormat to obtain the local date components in the target time zone
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(new Date());
  const y = Number(parts.find(p => p.type === 'year')?.value);
  const m = Number(parts.find(p => p.type === 'month')?.value);
  const d = Number(parts.find(p => p.type === 'day')?.value);
  return toDateStr(y, m, d);
}

// Add days to a YYYY-MM-DD date string using UTC math and return YYYY-MM-DD
export function addDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(n => Number(n));
  // Construct at UTC midnight to avoid local TZ shifts
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const y2 = dt.getUTCFullYear();
  const m2 = dt.getUTCMonth() + 1;
  const d2 = dt.getUTCDate();
  return toDateStr(y2, m2, d2);
}

