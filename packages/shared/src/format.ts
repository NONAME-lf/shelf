const UNITS = ['Б', 'КБ', 'МБ', 'ГБ'];

export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text = unit === 0 ? String(value) : value.toFixed(value < 10 ? 1 : 0).replace(/\.0$/, '');
  return `${text.replace('.', ',')} ${UNITS[unit]}`;
}

/** Local date and time as dd.MM.yyyy HH:mm; accepts an ISO string or epoch milliseconds. */
export function formatDateTime(value: string | number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
