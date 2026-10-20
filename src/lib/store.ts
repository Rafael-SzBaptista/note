import { useCallback, useEffect, useState } from 'react';
import { dateKey } from './date';

export type Mode = 'horas' | 'dias' | 'ciclo';

/** Turno usado no modo "ciclo" (ex.: D = Dia 07:00 12h, N = Noite 19:00 12h). */
export interface Turno {
  id: string;
  label: string;
  start: string;
  hours: number;
}

export type PayType = 'plantao' | 'hora' | 'fixo';

/**
 * Regra de uma escala, válida a partir do seu primeiro plantão (startDate/startTime)
 * até o início da regra seguinte. Assim, mudar a escala não reescreve o histórico.
 */
export interface Regra {
  mode: Mode;
  /** modo "horas": X horas de trabalho por Y horas de descanso */
  onHours: number;
  offHours: number;
  /** modo "dias": X dias trabalhados por Y dias de folga */
  onDays: number;
  offDays: number;
  shiftHours: number;
  /** modo "ciclo": sequência de dias com id de turno ou 'F' (folga) */
  turnos: Turno[];
  ciclo: string[];
  /** início da regra: 1º plantão (horas/dias) ou 1º dia do ciclo */
  startDate: string;
  startTime: string;
  payType: PayType;
  payValue: number;
  night: boolean;
  holiday: boolean;
}

export interface Escala {
  id: string;
  name: string;
  color: string;
  /** opcional: último dia da escala */
  endDate: string;
  versions: Regra[];
}

export type ShiftStatus = 'normal' | 'folga' | 'troca';
export interface ShiftOverride {
  status: ShiftStatus;
  note: string;
  /** troca: colega que cobriu este plantão */
  colega?: string;
  paid?: boolean;
  /** plantão excluído só nesta data */
  removed?: boolean;
}

export type EventKind = 'compromisso' | 'extra' | 'cobertura';
export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Evento {
  id: string;
  kind: EventKind;
  title: string;
  start: string; // YYYY-MM-DDTHH:MM
  end: string;
  allDay: boolean;
  color: string;
  location: string;
  description: string;
  /** plantão extra */
  value?: number;
  paid?: boolean;
  /** cobertura: plantão de um colega que eu trabalho em troca */
  colega?: string;
  escalaId?: string;
  trocaKey?: string;
  /** compromisso recorrente */
  repeat?: Repeat;
  repeatUntil?: string;
  exdates?: string[];
}

export interface Nota {
  id: string;
  date: string; // YYYY-MM-DD
  text: string;
  color: string;
}

export interface Settings {
  nightPct: number;
  holidayPct: number;
  minRest: number;
  extraValue: number;
  reminders: boolean;
  remindMin: number;
  remindEvents: boolean;
}

export type View = 'hoje' | 'agenda' | 'dia' | '3dias' | 'semana' | 'mes';

export interface State {
  version: 2;
  escalas: Escala[];
  /** chave: `${escalaId}|${YYYY-MM-DDTHH:MM}` do início do plantão */
  overrides: Record<string, ShiftOverride>;
  eventos: Evento[];
  notas: Nota[];
  /** ids de agendas ocultas: ids de escala, 'eventos', 'extras', 'coberturas', 'notas', 'feriados' */
  hidden: string[];
  view: View;
  settings: Settings;
}

export const COLORS: { name: string; hex: string }[] = [
  { name: 'Tomate', hex: '#d50000' },
  { name: 'Flamingo', hex: '#e67c73' },
  { name: 'Tangerina', hex: '#f4511e' },
  { name: 'Banana', hex: '#f6bf26' },
  { name: 'Sálvia', hex: '#33b679' },
  { name: 'Manjericão', hex: '#0b8043' },
  { name: 'Pavão', hex: '#039be5' },
  { name: 'Mirtilo', hex: '#3f51b5' },
  { name: 'Lavanda', hex: '#7986cb' },
  { name: 'Uva', hex: '#8e24aa' },
  { name: 'Grafite', hex: '#616161' },
];

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const DEFAULT_TURNOS: Turno[] = [
  { id: 'D', label: 'Dia', start: '07:00', hours: 12 },
  { id: 'N', label: 'Noite', start: '19:00', hours: 12 },
];

export const DEFAULT_SETTINGS: Settings = {
  nightPct: 20,
  holidayPct: 100,
  minRest: 11,
  extraValue: 0,
  reminders: false,
  remindMin: 60,
  remindEvents: true,
};

export function newRegra(partial: Partial<Regra> = {}): Regra {
  return {
    mode: 'horas',
    onHours: 12,
    offHours: 36,
    onDays: 5,
    offDays: 2,
    shiftHours: 8,
    turnos: DEFAULT_TURNOS.map((t) => ({ ...t })),
    ciclo: ['D', 'D', 'N', 'N', 'F', 'F', 'F', 'F'],
    startDate: dateKey(new Date()),
    startTime: '07:00',
    payType: 'plantao',
    payValue: 0,
    night: true,
    holiday: true,
    ...partial,
  };
}

export function newEscala(partial: Partial<Escala> = {}, regra: Partial<Regra> = {}): Escala {
  return { id: uid(), name: 'Plantão', color: '#039be5', endDate: '', versions: [newRegra(regra)], ...partial };
}

const KEY = 'note:v1';

function empty(): State {
  return {
    version: 2,
    escalas: [],
    overrides: {},
    eventos: [],
    notas: [],
    hidden: [],
    view: 'hoje',
    settings: { ...DEFAULT_SETTINGS },
  };
}

/** Converte dados da versão 1 (regra única dentro da escala) para versões. */
function migrate(raw: any): State {
  const s = { ...empty(), ...raw, settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) }, version: 2 as const };
  s.escalas = (raw.escalas ?? []).map((e: any) =>
    Array.isArray(e.versions)
      ? e
      : {
          id: e.id,
          name: e.name,
          color: e.color,
          endDate: e.endDate ?? '',
          versions: [
            newRegra({
              mode: e.mode,
              onHours: e.onHours,
              offHours: e.offHours,
              onDays: e.onDays,
              offDays: e.offDays,
              shiftHours: e.shiftHours,
              startDate: e.startDate,
              startTime: e.startTime,
            }),
          ],
        },
  );
  return s;
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch {
    /* armazenamento indisponível */
  }
  // primeira execução: uma escala 12x36 de exemplo
  return { ...empty(), escalas: [newEscala({ name: 'Plantão 12x36' })] };
}

export function useStore() {
  const [state, setState] = useState<State>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* armazenamento indisponível */
    }
  }, [state]);
  const update = useCallback((fn: (s: State) => State) => setState(fn), []);
  return [state, update] as const;
}
