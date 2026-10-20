import { addDays, dateKey } from './date';

export interface Holiday {
  date: string;
  name: string;
  /** ponto facultativo: aparece na agenda, mas não conta como feriado no pagamento */
  facultativo?: boolean;
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
function easter(y: number): Date {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}

const cache = new Map<number, Map<string, Holiday>>();

/** Feriados nacionais do Brasil (e pontos facultativos mais comuns). */
export function holidaysOf(y: number): Map<string, Holiday> {
  const hit = cache.get(y);
  if (hit) return hit;
  const p = (m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const e = easter(y);
  const list: Holiday[] = [
    { date: p(1, 1), name: 'Confraternização Universal' },
    { date: dateKey(addDays(e, -48)), name: 'Carnaval', facultativo: true },
    { date: dateKey(addDays(e, -47)), name: 'Carnaval', facultativo: true },
    { date: dateKey(addDays(e, -2)), name: 'Sexta-feira Santa' },
    { date: p(4, 21), name: 'Tiradentes' },
    { date: p(5, 1), name: 'Dia do Trabalho' },
    { date: dateKey(addDays(e, 60)), name: 'Corpus Christi', facultativo: true },
    { date: p(9, 7), name: 'Independência do Brasil' },
    { date: p(10, 12), name: 'Nossa Senhora Aparecida' },
    { date: p(11, 2), name: 'Finados' },
    { date: p(11, 15), name: 'Proclamação da República' },
    { date: p(11, 20), name: 'Dia da Consciência Negra' },
    { date: p(12, 25), name: 'Natal' },
  ];
  const map = new Map(list.map((h) => [h.date, h]));
  cache.set(y, map);
  return map;
}

export const holidayOn = (key: string) => holidaysOf(Number(key.slice(0, 4))).get(key);
export const isPaidHoliday = (key: string) => {
  const h = holidayOn(key);
  return !!h && !h.facultativo;
};
