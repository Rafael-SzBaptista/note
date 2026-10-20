import { addDays, dateKey, diffDays, dtKey, parseDate, parseDT, startOfDay } from './date';
import { holidaysOf } from './holidays';
import type { Escala, Evento, Regra, ShiftStatus, State } from './store';

export type ItemType = 'shift' | 'extra' | 'cover' | 'event' | 'note' | 'holiday';

/** Item já resolvido para exibição no calendário. */
export interface Item {
  key: string;
  type: ItemType;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  color: string;
  refId: string;
  /** plantões de escala */
  occKey?: string;
  status?: ShiftStatus;
  note?: string;
  colega?: string;
  paid?: boolean;
  turno?: string;
  rule?: Regra;
  /** plantão extra */
  value?: number;
  location?: string;
  /** compromisso recorrente: data desta ocorrência */
  recurring?: boolean;
  occDate?: string;
}

const H = 3600e3;

export interface Occ {
  start: Date;
  end: Date;
  turno?: string;
}

/** Momento em que a regra passa a valer. */
export const regraAnchor = (r: Regra) =>
  r.mode === 'horas' ? parseDT(`${r.startDate}T${r.startTime}`) : parseDate(r.startDate);

export const sortedVersions = (e: Escala) =>
  [...e.versions].sort((a, b) => regraAnchor(a).getTime() - regraAnchor(b).getTime());

/** Índice (em sortedVersions) da regra válida num momento. */
export function versionAt(e: Escala, at: Date): number {
  const vs = sortedVersions(e);
  let idx = 0;
  vs.forEach((v, i) => {
    if (regraAnchor(v) <= at) idx = i;
  });
  return idx;
}

export function regraOccurrences(r: Regra, from: Date, to: Date, limit: Date | null = null): Occ[] {
  const out: Occ[] = [];
  if (r.mode === 'horas') {
    const first = parseDT(`${r.startDate}T${r.startTime}`);
    const on = r.onHours * H;
    const cycle = (r.onHours + r.offHours) * H;
    if (on <= 0 || cycle <= 0) return out;
    let k = Math.max(0, Math.floor((from.getTime() - first.getTime() - on) / cycle));
    for (; out.length < 2000; k++) {
      const s = new Date(first.getTime() + k * cycle);
      if (s >= to || (limit && s >= limit)) break;
      const end = new Date(s.getTime() + on);
      if (end > from) out.push({ start: s, end });
    }
    return out;
  }

  // "dias" e "ciclo": percorre dia a dia
  const startDay = parseDate(r.startDate);
  let slots: ({ start: string; hours: number; label?: string } | null)[];
  if (r.mode === 'dias') {
    if (r.onDays <= 0 || r.shiftHours <= 0) return out;
    slots = Array.from({ length: r.onDays + r.offDays }, (_, i) =>
      i < r.onDays ? { start: r.startTime, hours: r.shiftHours } : null,
    );
  } else {
    slots = r.ciclo.map((id) => {
      const t = r.turnos.find((x) => x.id === id);
      return t && t.hours > 0 ? { start: t.start, hours: t.hours, label: t.label } : null;
    });
  }
  if (!slots.some(Boolean)) return out;
  const maxH = Math.max(...slots.map((s) => s?.hours ?? 0));
  let d = addDays(startOfDay(from), -Math.ceil(maxH / 24));
  if (d < startDay) d = startDay;
  for (; d < to; d = addDays(d, 1)) {
    if (limit && d >= limit) break;
    const idx = diffDays(startDay, d);
    const slot = slots[((idx % slots.length) + slots.length) % slots.length];
    if (!slot) continue;
    const [hh, mm] = slot.start.split(':').map(Number);
    const s = new Date(d);
    s.setHours(hh || 0, mm || 0, 0, 0);
    const end = new Date(s.getTime() + slot.hours * H);
    if (end > from && s < to) out.push({ start: s, end, turno: slot.label });
  }
  return out;
}

/** Plantões de uma escala, respeitando as versões da regra. */
export function escalaOccurrences(e: Escala, from: Date, to: Date): (Occ & { rule: Regra })[] {
  const vs = sortedVersions(e);
  const limit = e.endDate ? addDays(parseDate(e.endDate), 1) : null;
  const out: (Occ & { rule: Regra })[] = [];
  vs.forEach((v, i) => {
    const next = vs[i + 1] ? regraAnchor(vs[i + 1]) : null;
    for (const o of regraOccurrences(v, from, next && next < to ? next : to, limit)) {
      if (!next || o.start < next) out.push({ ...o, rule: v });
    }
  });
  return out;
}

/** Ocorrências de um evento (expande a repetição). */
export function eventOccurrences(ev: Evento, from: Date, to: Date): { start: Date; end: Date; occDate: string }[] {
  const s0 = ev.allDay ? parseDate(ev.start.slice(0, 10)) : parseDT(ev.start);
  const e0 = ev.allDay ? addDays(parseDate(ev.end.slice(0, 10)), 1) : parseDT(ev.end);
  const dur = Math.max(0, e0.getTime() - s0.getTime());
  const rep = ev.repeat ?? 'none';
  if (rep === 'none') return e0 > from && s0 < to ? [{ start: s0, end: e0, occDate: dateKey(s0) }] : [];

  const until = ev.repeatUntil ? addDays(parseDate(ev.repeatUntil), 1) : null;
  const ex = new Set(ev.exdates ?? []);
  const out: { start: Date; end: Date; occDate: string }[] = [];
  const step = rep === 'daily' ? 1 : rep === 'weekly' ? 7 : 0;
  let k = step ? Math.max(0, Math.floor((diffDays(s0, from) - dur / 864e5) / step) - 1) : 0;
  for (; k < 20000; k++) {
    let s: Date;
    if (step) s = addDays(s0, k * step);
    else {
      const months = rep === 'monthly' ? k : k * 12;
      s = new Date(s0.getFullYear(), s0.getMonth() + months, s0.getDate(), s0.getHours(), s0.getMinutes());
      if (s.getDate() !== s0.getDate()) continue; // ex.: dia 31 em mês curto
    }
    if (s >= to || (until && s >= until)) break;
    const e = new Date(s.getTime() + dur);
    if (e > from && !ex.has(dateKey(s))) out.push({ start: s, end: e, occDate: dateKey(s) });
  }
  return out;
}

export function getItems(state: State, from: Date, to: Date): Item[] {
  const hidden = new Set(state.hidden);
  const items: Item[] = [];

  for (const e of state.escalas) {
    if (hidden.has(e.id)) continue;
    for (const o of escalaOccurrences(e, from, to)) {
      const occKey = `${e.id}|${dtKey(o.start)}`;
      const ov = state.overrides[occKey];
      if (ov?.removed) continue;
      items.push({
        key: occKey,
        type: 'shift',
        title: e.name,
        start: o.start,
        end: o.end,
        allDay: false,
        color: e.color,
        refId: e.id,
        occKey,
        status: ov?.status ?? 'normal',
        note: ov?.note ?? '',
        colega: ov?.colega,
        paid: !!ov?.paid,
        turno: o.turno,
        rule: o.rule,
      });
    }
  }

  for (const ev of state.eventos) {
    const cal = ev.kind === 'extra' ? 'extras' : ev.kind === 'cobertura' ? 'coberturas' : 'eventos';
    if (hidden.has(cal)) continue;
    const recurring = (ev.repeat ?? 'none') !== 'none';
    for (const o of eventOccurrences(ev, from, to)) {
      items.push({
        key: recurring ? `${ev.id}|${o.occDate}` : ev.id,
        type: ev.kind === 'extra' ? 'extra' : ev.kind === 'cobertura' ? 'cover' : 'event',
        title:
          ev.title ||
          (ev.kind === 'extra' ? 'Plantão extra' : ev.kind === 'cobertura' ? `Cobrindo ${ev.colega || 'colega'}` : '(Sem título)'),
        start: o.start,
        end: o.end,
        allDay: ev.allDay,
        color: ev.color,
        refId: ev.id,
        location: ev.location,
        value: ev.value,
        paid: !!ev.paid,
        colega: ev.colega,
        recurring,
        occDate: o.occDate,
      });
    }
  }

  if (!hidden.has('notas')) {
    for (const n of state.notas) {
      const start = parseDate(n.date);
      if (start < startOfDay(from) || start >= to) continue;
      items.push({
        key: n.id,
        type: 'note',
        title: n.text.split('\n')[0] || 'Anotação',
        start,
        end: addDays(start, 1),
        allDay: true,
        color: n.color,
        refId: n.id,
      });
    }
  }

  if (!hidden.has('feriados')) {
    for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
      for (const h of holidaysOf(y).values()) {
        const start = parseDate(h.date);
        if (start < startOfDay(from) || start >= to) continue;
        items.push({
          key: `hol|${h.date}`,
          type: 'holiday',
          title: h.facultativo ? `${h.name} (facultativo)` : h.name,
          start,
          end: addDays(start, 1),
          allDay: true,
          color: '#0b8043',
          refId: h.date,
        });
      }
    }
  }

  return items.sort(
    (a, b) => Number(b.allDay) - Number(a.allDay) || a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime(),
  );
}

/** Plantões que realmente trabalho (exclui folgas e plantões que passei na troca). */
export const isWork = (i: Item) => (i.type === 'shift' && i.status === 'normal') || i.type === 'extra' || i.type === 'cover';

/** Itens que aparecem num dia (tocam o intervalo do dia). */
export function itemsOnDay(items: Item[], day: Date): Item[] {
  const s = startOfDay(day);
  const e = addDays(s, 1);
  return items.filter((i) => i.start < e && i.end > s);
}

/** Itens que "pertencem" ao dia em listas: começam no dia (ou dia inteiro que o cobre). */
export function itemsStartingOn(items: Item[], day: Date): Item[] {
  const s = startOfDay(day);
  const e = addDays(s, 1);
  return items.filter((i) => (i.allDay ? i.start < e && i.end > s : i.start >= s && i.start < e));
}

export const itemHours = (i: Item) => (i.end.getTime() - i.start.getTime()) / H;
