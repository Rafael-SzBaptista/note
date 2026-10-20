export const pad = (n: number) => String(n).padStart(2, '0');

export const dateKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const timeKey = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const dtKey = (d: Date) => `${dateKey(d)}T${timeKey(d)}`;

export function parseDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function parseDT(s: string): Date {
  const [dp, tp = '00:00'] = s.split('T');
  const d = parseDate(dp);
  const [h, mi] = tp.split(':').map(Number);
  d.setHours(h || 0, mi || 0, 0, 0);
  return d;
}

export const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
export const addMonths = (d: Date, n: number) => {
  const x = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  x.setDate(Math.min(d.getDate(), last));
  return x;
};
export const startOfWeek = (d: Date) => addDays(startOfDay(d), -d.getDay());
export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export const diffDays = (a: Date, b: Date) =>
  Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 864e5);

export const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
export const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const WEEKDAY_LETTER = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export const fmtTime = (d: Date) => timeKey(d);

/** "seg., 19 de out." */
export const fmtShortDate = (d: Date) =>
  `${WEEKDAYS_SHORT[d.getDay()]}., ${d.getDate()} de ${MONTHS_SHORT[d.getMonth()]}.`;

/** "segunda-feira, 19 de outubro" */
export const fmtLongDate = (d: Date) => `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;

export function fmtRange(start: Date, end: Date, allDay: boolean): string {
  if (allDay) {
    const last = addDays(end, -1);
    return sameDay(start, last) ? fmtLongDate(start) : `${fmtShortDate(start)} – ${fmtShortDate(last)}`;
  }
  if (sameDay(start, end) || (end.getHours() === 0 && end.getMinutes() === 0 && diffDays(start, end) === 1)) {
    return `${fmtLongDate(start)} · ${fmtTime(start)} – ${fmtTime(end)}`;
  }
  return `${fmtShortDate(start)} ${fmtTime(start)} – ${fmtShortDate(end)} ${fmtTime(end)}`;
}

export const fmtHours = (h: number) => {
  const whole = Math.floor(h);
  const min = Math.round((h - whole) * 60);
  return min ? `${whole}h${pad(min)}` : `${whole}h`;
};
