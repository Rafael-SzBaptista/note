import { addDays } from './date';
import { getItems, isWork, type Item } from './items';
import type { State } from './store';

export interface Conflict {
  kind: 'overlap' | 'rest';
  a: Item;
  b: Item;
  /** descanso entre os dois, em horas */
  gap: number;
}

/**
 * Choques entre plantões (escalas, extras e coberturas) e intervalos de descanso
 * menores que o mínimo configurado. Retorna conflitos cujo 2º item começa em [from, to).
 */
export function findConflicts(state: State, from: Date, to: Date, extra: Item[] = []): Conflict[] {
  const work = [
    ...getItems({ ...state, hidden: [] }, addDays(from, -3), addDays(to, 1)).filter(isWork),
    ...extra,
  ].sort((x, y) => x.start.getTime() - y.start.getTime());
  const minRest = state.settings.minRest * 3600e3;
  const out: Conflict[] = [];
  let last: Item | null = null; // item que termina mais tarde até aqui
  for (const b of work) {
    if (last && b.start >= from && b.start < to) {
      const gap = b.start.getTime() - last.end.getTime();
      if (gap < 0) out.push({ kind: 'overlap', a: last, b, gap: gap / 3600e3 });
      else if (minRest > 0 && gap < minRest) out.push({ kind: 'rest', a: last, b, gap: gap / 3600e3 });
    }
    if (!last || b.end > last.end) last = b;
  }
  return out;
}

export const conflictsOf = (list: Conflict[], key: string) => list.filter((c) => c.a.key === key || c.b.key === key);
