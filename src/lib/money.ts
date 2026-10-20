import { addDays, dateKey, startOfDay } from './date';
import { isPaidHoliday } from './holidays';
import { getItems, isWork, itemHours, type Item } from './items';
import type { Settings, State } from './store';

const H = 3600e3;

export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const overlap = (s: Date, e: Date, a: Date, b: Date) =>
  Math.max(0, Math.min(e.getTime(), b.getTime()) - Math.max(s.getTime(), a.getTime())) / H;

/** Horas dentro do período noturno (22h às 5h). */
export function nightHours(s: Date, e: Date): number {
  let h = 0;
  for (let d = addDays(startOfDay(s), -1); d < e; d = addDays(d, 1)) {
    const a = new Date(d);
    a.setHours(22, 0, 0, 0);
    const b = addDays(startOfDay(d), 1);
    b.setHours(5, 0, 0, 0);
    h += overlap(s, e, a, b);
  }
  return h;
}

/** Horas trabalhadas em feriados nacionais. */
export function holidayHours(s: Date, e: Date): number {
  let h = 0;
  for (let d = startOfDay(s); d < e; d = addDays(d, 1)) {
    if (isPaidHoliday(dateKey(d))) h += overlap(s, e, d, addDays(d, 1));
  }
  return h;
}

export interface Earn {
  base: number;
  night: number;
  holiday: number;
  total: number;
  /** escala de salário fixo: não calculamos valor por plantão */
  fixed: boolean;
}

const ZERO: Earn = { base: 0, night: 0, holiday: 0, total: 0, fixed: false };

/**
 * Quanto um item rende.
 * - Plantão de escala: valor da regra + adicionais. Se foi passado na troca, continua sendo pago
 *   (quem cobre recebe pelo próprio plantão); folga não é paga.
 * - Plantão extra: valor informado.
 * - Cobertura de troca: não gera pagamento extra.
 */
export function earnings(item: Item, settings: Settings): Earn {
  if (item.type === 'extra') {
    const v = item.value ?? 0;
    return { ...ZERO, base: v, total: v };
  }
  if (item.type !== 'shift' || !item.rule || item.status === 'folga') return ZERO;
  const r = item.rule;
  if (r.payType === 'fixo') return { ...ZERO, fixed: true };
  const hours = itemHours(item);
  if (hours <= 0) return ZERO;
  const hourly = r.payType === 'hora' ? r.payValue : r.payValue / hours;
  const base = r.payType === 'hora' ? r.payValue * hours : r.payValue;
  const night = r.night ? nightHours(item.start, item.end) * hourly * (settings.nightPct / 100) : 0;
  const holiday = r.holiday ? holidayHours(item.start, item.end) * hourly * (settings.holidayPct / 100) : 0;
  return { base, night, holiday, total: base + night + holiday, fixed: false };
}

export interface SummaryRow {
  id: string;
  label: string;
  color: string;
  /** plantões trabalhados */
  count: number;
  hours: number;
  total: number;
  received: number;
  folgas: number;
  trocas: number;
  fixed: boolean;
  /** itens pagáveis (para marcar como pago) */
  payable: Item[];
  items: Item[];
}

export interface Summary {
  rows: SummaryRow[];
  count: number;
  hours: number;
  total: number;
  received: number;
  compromissos: number;
  notas: number;
}

/** Resumo de um período: plantões, horas e dinheiro por escala. */
export function summarize(state: State, from: Date, to: Date): Summary {
  const all = getItems({ ...state, hidden: [] }, from, to).filter((i) => i.start >= from && i.start < to);
  const s = state.settings;
  const row = (id: string, label: string, color: string, items: Item[]): SummaryRow => {
    const worked = items.filter(isWork);
    const payable = items.filter((i) => earnings(i, s).total > 0);
    return {
      id,
      label,
      color,
      count: worked.length,
      hours: worked.reduce((a, i) => a + itemHours(i), 0),
      total: payable.reduce((a, i) => a + earnings(i, s).total, 0),
      received: payable.filter((i) => i.paid).reduce((a, i) => a + earnings(i, s).total, 0),
      folgas: items.filter((i) => i.status === 'folga').length,
      trocas: items.filter((i) => i.status === 'troca').length,
      fixed: items.some((i) => earnings(i, s).fixed),
      payable,
      items,
    };
  };
  const rows = state.escalas.map((e) => row(e.id, e.name, e.color, all.filter((i) => i.type === 'shift' && i.refId === e.id)));
  rows.push(row('extras', 'Plantões extras', '#616161', all.filter((i) => i.type === 'extra')));
  rows.push(row('coberturas', 'Coberturas de troca', '#8e24aa', all.filter((i) => i.type === 'cover')));
  return {
    rows,
    count: rows.reduce((a, r) => a + r.count, 0),
    hours: rows.reduce((a, r) => a + r.hours, 0),
    total: rows.reduce((a, r) => a + r.total, 0),
    received: rows.reduce((a, r) => a + r.received, 0),
    compromissos: all.filter((i) => i.type === 'event').length,
    notas: all.filter((i) => i.type === 'note').length,
  };
}
