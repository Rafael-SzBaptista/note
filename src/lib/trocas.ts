import { addDays, parseDT } from './date';
import { escalaOccurrences } from './items';
import type { State } from './store';

export interface TrocaEntry {
  key: string;
  colega: string;
  /** cedi = um colega cobriu meu plantão; cobri = eu cobri o plantão de um colega */
  kind: 'cedi' | 'cobri';
  start: Date;
  end: Date;
  title: string;
}

const norm = (s: string) => s.trim().toLocaleLowerCase('pt-BR');

export function trocaEntries(state: State): TrocaEntry[] {
  const out: TrocaEntry[] = [];
  for (const [key, ov] of Object.entries(state.overrides)) {
    if (ov.status !== 'troca' || ov.removed) continue;
    const [escalaId, dt] = key.split('|');
    const e = state.escalas.find((x) => x.id === escalaId);
    if (!e) continue;
    const start = parseDT(dt);
    const occ = escalaOccurrences(e, start, addDays(start, 1)).find((o) => o.start.getTime() === start.getTime());
    out.push({ key, colega: ov.colega?.trim() || 'Sem nome', kind: 'cedi', start, end: occ?.end ?? start, title: e.name });
  }
  for (const ev of state.eventos) {
    if (ev.kind !== 'cobertura') continue;
    out.push({
      key: ev.id,
      colega: ev.colega?.trim() || 'Sem nome',
      kind: 'cobri',
      start: parseDT(ev.start),
      end: parseDT(ev.end),
      title: ev.title || 'Cobertura',
    });
  }
  return out.sort((a, b) => b.start.getTime() - a.start.getTime());
}

export interface Saldo {
  colega: string;
  cedi: number;
  cobri: number;
  /** > 0: eu devo plantões a este colega; < 0: ele me deve */
  saldo: number;
  entries: TrocaEntry[];
}

export function saldos(state: State): Saldo[] {
  const map = new Map<string, Saldo>();
  for (const t of trocaEntries(state)) {
    const k = norm(t.colega);
    const s = map.get(k) ?? { colega: t.colega, cedi: 0, cobri: 0, saldo: 0, entries: [] };
    if (t.kind === 'cedi') s.cedi++;
    else s.cobri++;
    s.saldo = s.cedi - s.cobri;
    s.entries.push(t);
    map.set(k, s);
  }
  return [...map.values()].sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo) || a.colega.localeCompare(b.colega));
}

export const colegas = (state: State) => saldos(state).map((s) => s.colega).filter((c) => c !== 'Sem nome');
